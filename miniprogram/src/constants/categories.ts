import type { Category, TxnType } from '@/types'

// 内置分类（与 App 版保持一致，emoji 图标，跨端无依赖）
export const EXPENSE_CATEGORIES: Category[] = [
  { id: 'food', name: '餐饮', icon: '🍜', color: '#f59e0b', type: 'expense' },
  { id: 'shopping', name: '购物', icon: '🛍️', color: '#ec4899', type: 'expense' },
  { id: 'transport', name: '交通', icon: '🚌', color: '#3b82f6', type: 'expense' },
  { id: 'home', name: '居家', icon: '🏠', color: '#8b5cf6', type: 'expense' },
  { id: 'fun', name: '娱乐', icon: '🎮', color: '#10b981', type: 'expense' },
  { id: 'medical', name: '医疗', icon: '💊', color: '#ef4444', type: 'expense' },
  { id: 'travel', name: '旅行', icon: '✈️', color: '#06b6d4', type: 'expense' },
  { id: 'snack', name: '零食', icon: '🍰', color: '#f472b6', type: 'expense' },
  { id: 'pet', name: '宠物', icon: '🐱', color: '#a16207', type: 'expense' },
  { id: 'other-exp', name: '其他', icon: '📦', color: '#94a3b8', type: 'expense' }
]

export const INCOME_CATEGORIES: Category[] = [
  { id: 'salary', name: '工资', icon: '💰', color: '#10b981', type: 'income' },
  { id: 'bonus', name: '奖金', icon: '🎁', color: '#f59e0b', type: 'income' },
  { id: 'invest', name: '理财', icon: '📈', color: '#6366f1', type: 'income' },
  { id: 'parttime', name: '兼职', icon: '💼', color: '#0ea5e9', type: 'income' },
  { id: 'redpacket', name: '红包', icon: '🧧', color: '#ef4444', type: 'income' },
  { id: 'other-inc', name: '其他', icon: '📥', color: '#94a3b8', type: 'income' }
]

export const getCategories = (type: TxnType): Category[] =>
  type === 'expense' ? EXPENSE_CATEGORIES : INCOME_CATEGORIES

export const findCategory = (type: TxnType, id: string): Category => {
  const list = getCategories(type)
  return list.find((c) => c.id === id) || list[list.length - 1]
}
