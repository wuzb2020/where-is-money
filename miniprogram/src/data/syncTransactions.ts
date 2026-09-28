import Taro from '@tarojs/taro'
import dayjs from 'dayjs'
import type { OutboxChange, SyncResult, Txn } from '@/types'

const MOCK_SERVER_KEY = 'mock_server_txns'

// 首次进入播种演示数据（当前月前后），让 H5 预览有内容
const seedTxns = (): Txn[] => {
  const now = Date.now()
  const mk = (partial: Partial<Txn> & Pick<Txn, 'type' | 'categoryId' | 'amount' | 'categoryName' | 'categoryIcon' | 'categoryColor' | 'date'>): Txn => ({
    uuid: `seed_${Math.random().toString(36).slice(2, 9)}`,
    description: '',
    source: 'manual',
    deleted: false,
    createTime: partial.date || now,
    updateTime: partial.date || now,
    ...partial
  })
  const d = (dayOffset: number, hour: number) =>
    dayjs().subtract(dayOffset, 'day').hour(hour).minute(0).second(0).millisecond(0).valueOf()

  return [
    mk({ type: 'income', categoryId: 'salary', categoryName: '工资', categoryIcon: '💰', categoryColor: '#10b981', amount: 1580000, date: d(2, 10), description: '8月工资' }),
    mk({ type: 'expense', categoryId: 'food', categoryName: '餐饮', categoryIcon: '🍜', categoryColor: '#f59e0b', amount: 3250, date: d(0, 12), description: '午餐·牛肉面' }),
    mk({ type: 'expense', categoryId: 'transport', categoryName: '交通', categoryIcon: '🚌', categoryColor: '#3b82f6', amount: 600, date: d(0, 9), description: '地铁通勤' }),
    mk({ type: 'expense', categoryId: 'shopping', categoryName: '购物', categoryIcon: '🛍️', categoryColor: '#ec4899', amount: 29900, date: d(1, 20), description: '运动鞋' }),
    mk({ type: 'expense', categoryId: 'snack', categoryName: '零食', categoryIcon: '🍰', categoryColor: '#f472b6', amount: 1880, date: d(1, 15), description: '奶茶+蛋糕' }),
    mk({ type: 'expense', categoryId: 'home', categoryName: '居家', categoryIcon: '🏠', categoryColor: '#8b5cf6', amount: 8600, date: d(3, 19), description: '水电费' }),
    mk({ type: 'expense', categoryId: 'fun', categoryName: '娱乐', categoryIcon: '🎮', categoryColor: '#10b981', amount: 4500, date: d(4, 21), description: '电影票' }),
    mk({ type: 'income', categoryId: 'redpacket', categoryName: '红包', categoryIcon: '🧧', categoryColor: '#ef4444', amount: 20000, date: d(5, 9), description: '节日红包' }),
    mk({ type: 'expense', categoryId: 'medical', categoryName: '医疗', categoryIcon: '💊', categoryColor: '#ef4444', amount: 12600, date: d(6, 14), description: '感冒药' }),
    mk({ type: 'expense', categoryId: 'food', categoryName: '餐饮', categoryIcon: '🍜', categoryColor: '#f59e0b', amount: 15600, date: d(7, 19), description: '周末聚餐' }),
    mk({ type: 'expense', categoryId: 'transport', categoryName: '交通', categoryIcon: '🚌', categoryColor: '#3b82f6', amount: 3200, date: d(8, 8), description: '打车' }),
    mk({ type: 'expense', categoryId: 'travel', categoryName: '旅行', categoryIcon: '✈️', categoryColor: '#06b6d4', amount: 128000, date: d(12, 10), description: '机票' })
  ]
}

// H5 预览时模拟「同步交易」云函数：幂等 upsert + 删除，返回全量
export default async function syncTransactions(event?: {
  changes?: OutboxChange[]
}): Promise<SyncResult> {
  let server: Txn[] = Taro.getStorageSync(MOCK_SERVER_KEY)
  if (!server || server.length === 0) {
    server = seedTxns()
  }

  const changes = event?.changes || []
  for (const change of changes) {
    const idx = server.findIndex((t) => t.uuid === change.uuid)
    if (change.op === 'delete') {
      if (idx >= 0) server.splice(idx, 1)
    } else if (change.payload) {
      const payload = { ...change.payload, updateTime: Date.now() }
      if (idx >= 0) {
        // LWW：时间戳新者胜
        if (payload.updateTime >= (server[idx].updateTime || 0)) {
          server[idx] = payload
        }
      } else {
        server.push(payload)
      }
    }
  }

  Taro.setStorageSync(MOCK_SERVER_KEY, server)
  return {
    transactions: server.filter((t) => !t.deleted),
    serverTime: Date.now()
  }
}
