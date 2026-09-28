import { create } from 'zustand'
import Taro from '@tarojs/taro'
import type { OutboxChange, SyncResult, Txn, TxnType, UserInfo, LoginResult } from '@/types'
import { findCategory } from '@/constants/categories'
import { callFunction } from '@/services/cloud'

const KEY_TXNS = 'qqnle_txns'
const KEY_OUTBOX = 'qqnle_outbox'
const KEY_USER = 'qqnle_user'
const KEY_LAST_SYNC = 'qqnle_last_sync'

interface NewTxnInput {
  type: TxnType
  categoryId: string
  amount: number // 分
  description: string
  date: number
}

interface AccountState {
  user: UserInfo | null
  txns: Txn[]
  outbox: OutboxChange[]
  lastSyncAt: number | null
  syncing: boolean

  init: () => Promise<void>
  addTxn: (input: NewTxnInput) => Txn
  updateTxn: (uuid: string, patch: Partial<NewTxnInput>) => void
  removeTxn: (uuid: string) => void
  getTxn: (uuid: string) => Txn | undefined
  saveUser: (patch: { nickname?: string; avatar?: string }) => Promise<void>
  flush: () => Promise<void>
}

const genUuid = (): string =>
  `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`

const readStorage = <T>(key: string, fallback: T): T => {
  try {
    const v = Taro.getStorageSync(key)
    return v || fallback
  } catch (err) {
    console.error('[Store] read storage failed:', key, err)
    return fallback
  }
}

const persistAll = (state: Pick<AccountState, 'txns' | 'outbox' | 'user' | 'lastSyncAt'>) => {
  try {
    Taro.setStorageSync(KEY_TXNS, state.txns)
    Taro.setStorageSync(KEY_OUTBOX, state.outbox)
    if (state.user) Taro.setStorageSync(KEY_USER, state.user)
    if (state.lastSyncAt) Taro.setStorageSync(KEY_LAST_SYNC, state.lastSyncAt)
  } catch (err) {
    console.error('[Store] persist failed:', err)
  }
}

// 云端数据 + 本地乐观数据合并（LWW：updateTime 新者胜）
const mergeCloud = (
  server: Txn[],
  current: Txn[],
  outbox: OutboxChange[]
): Txn[] => {
  const map = new Map<string, Txn>()
  for (const t of server) {
    if (!t.deleted) map.set(t.uuid, t)
  }
  const pendingUuids = new Set(outbox.map((o) => o.uuid))
  // 本地有、云端还没有（待推送）的乐观数据保留
  for (const t of current) {
    if (pendingUuids.has(t.uuid) && !map.has(t.uuid)) map.set(t.uuid, t)
  }
  // 待推送的删除立即生效
  for (const o of outbox) {
    if (o.op === 'delete') map.delete(o.uuid)
  }
  return [...map.values()].sort((a, b) => b.date - a.date)
}

const buildTxn = (input: NewTxnInput, old?: Txn): Txn => {
  const cat = findCategory(input.type, input.categoryId)
  const now = Date.now()
  return {
    uuid: old?.uuid || genUuid(),
    type: input.type,
    categoryId: cat.id,
    categoryName: cat.name,
    categoryIcon: cat.icon,
    categoryColor: cat.color,
    amount: input.amount,
    description: input.description,
    date: input.date,
    source: 'manual',
    deleted: false,
    createTime: old?.createTime || now,
    updateTime: now
  }
}

export const useAccountStore = create<AccountState>((set, get) => ({
  user: null,
  txns: [],
  outbox: [],
  lastSyncAt: null,
  syncing: false,

  init: async () => {
    // 1. 先读本地，界面立即有数据（离线优先）
    const localTxns = readStorage<Txn[]>(KEY_TXNS, [])
    const localOutbox = readStorage<OutboxChange[]>(KEY_OUTBOX, [])
    const localUser = readStorage<UserInfo | null>(KEY_USER, null)
    const localLastSync = readStorage<number | null>(KEY_LAST_SYNC, null)
    set({ txns: localTxns, outbox: localOutbox, user: localUser, lastSyncAt: localLastSync })

    // 2. 静默登录（微信端云函数取 openid；H5 走 mock）
    try {
      const loginRes = await callFunction<LoginResult>('login')
      const mergedUser: UserInfo = {
        openid: loginRes.openid,
        nickname: get().user?.nickname || loginRes.user?.nickname || '',
        avatar: get().user?.avatar || loginRes.user?.avatar || '',
        createTime: loginRes.user?.createTime
      }
      set({ user: mergedUser })
      console.info('[Auth] login success:', mergedUser.openid)
    } catch (err) {
      console.error('[Auth] login failed:', err)
    }

    // 3. 推送本地变更 + 拉取云端
    await get().flush()
  },

  addTxn: (input) => {
    const txn = buildTxn(input)
    const outbox: OutboxChange[] = [
      ...get().outbox,
      { uuid: txn.uuid, op: 'upsert', payload: txn, ts: Date.now() }
    ]
    const txns = [txn, ...get().txns].sort((a, b) => b.date - a.date)
    set({ txns, outbox })
    persistAll({ ...get(), txns, outbox })
    console.info('[Txn] local added:', txn.uuid)
    // 后台同步，不阻塞界面
    get().flush().catch((err) => console.error('[Txn] sync after add failed:', err))
    return txn
  },

  updateTxn: (uuid, patch) => {
    const old = get().txns.find((t) => t.uuid === uuid)
    if (!old) return
    const txn = buildTxn(
      {
        type: patch.type ?? old.type,
        categoryId: patch.categoryId ?? old.categoryId,
        amount: patch.amount ?? old.amount,
        description: patch.description ?? old.description,
        date: patch.date ?? old.date
      },
      old
    )
    const txns = get().txns.map((t) => (t.uuid === uuid ? txn : t)).sort((a, b) => b.date - a.date)
    const outbox: OutboxChange[] = [
      ...get().outbox.filter((o) => o.uuid !== uuid),
      { uuid, op: 'upsert', payload: txn, ts: Date.now() }
    ]
    set({ txns, outbox })
    persistAll({ ...get(), txns, outbox })
    get().flush().catch((err) => console.error('[Txn] sync after update failed:', err))
  },

  removeTxn: (uuid) => {
    const txns = get().txns.filter((t) => t.uuid !== uuid)
    const outbox: OutboxChange[] = [
      ...get().outbox.filter((o) => o.uuid !== uuid),
      { uuid, op: 'delete', ts: Date.now() }
    ]
    set({ txns, outbox })
    persistAll({ ...get(), txns, outbox })
    console.info('[Txn] local removed:', uuid)
    get().flush().catch((err) => console.error('[Txn] sync after remove failed:', err))
  },

  getTxn: (uuid) => get().txns.find((t) => t.uuid === uuid),

  saveUser: async (patch) => {
    const user = get().user
    if (!user) return
    const next: UserInfo = { ...user, ...patch }
    set({ user: next })
    persistAll({ ...get(), user: next })
    try {
      await callFunction('updateUser', { nickname: next.nickname, avatar: next.avatar })
      console.info('[User] profile synced')
    } catch (err) {
      console.error('[User] profile sync failed:', err)
      Taro.showToast({ title: '资料保存失败，稍后重试', icon: 'none' })
    }
  },

  flush: async () => {
    if (get().syncing) return
    set({ syncing: true })
    try {
      const res = await callFunction<SyncResult>('syncTransactions', {
        changes: get().outbox
      })
      const txns = mergeCloud(res.transactions || [], get().txns, get().outbox)
      set({ txns, outbox: [], lastSyncAt: res.serverTime || Date.now(), syncing: false })
      persistAll(get())
      console.info('[Sync] flush done, txns =', txns.length)
    } catch (err) {
      set({ syncing: false })
      console.error('[Sync] flush failed, will retry later:', err)
      throw err
    }
  }
}))
