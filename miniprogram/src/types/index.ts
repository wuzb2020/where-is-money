// 全局类型定义

export type TxnType = 'expense' | 'income'

export interface Category {
  id: string
  name: string
  icon: string
  color: string
  type: TxnType
}

export interface Txn {
  uuid: string
  type: TxnType
  categoryId: string
  categoryName: string
  categoryIcon: string
  categoryColor: string
  amount: number // 单位：分
  description: string
  date: number // 毫秒时间戳
  source: 'manual'
  deleted: boolean
  createTime: number
  updateTime: number
}

export interface UserInfo {
  openid: string
  nickname: string
  avatar: string
  createTime?: number
}

// 出站同步队列项（先本地后云）
export interface OutboxChange {
  uuid: string
  op: 'upsert' | 'delete'
  payload?: Txn
  ts: number
}

export interface SyncResult {
  transactions: Txn[]
  serverTime: number
}

export interface LoginResult {
  openid: string
  user: {
    nickname: string
    avatar: string
    createTime?: number
  }
}
