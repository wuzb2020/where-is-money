import React, { useMemo, useState } from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import classnames from 'classnames'
import dayjs from 'dayjs'
import { useAccountStore } from '@/store/useAccountStore'
import { fenToText } from '@/utils/amount'
import { formatDateLabel } from '@/utils/date'
import type { Txn, TxnType } from '@/types'
import TxnItem from '@/components/TxnItem'
import Empty from '@/components/Empty'
import styles from './index.module.scss'

type Filter = 'all' | TxnType

const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'expense', label: '支出' },
  { key: 'income', label: '收入' }
]

interface DayGroup {
  key: string
  label: string
  expense: number
  income: number
  items: Txn[]
}

function RecordsPage() {
  const txns = useAccountStore((s) => s.txns)
  const flush = useAccountStore((s) => s.flush)
  const [filter, setFilter] = useState<Filter>('all')

  usePullDownRefresh(() => {
    flush()
      .catch((err) => console.error('[Records] pull refresh failed:', err))
      .finally(() => Taro.stopPullDownRefresh())
  })

  const groups = useMemo<DayGroup[]>(() => {
    const list = txns
      .filter((t) => !t.deleted)
      .filter((t) => filter === 'all' || t.type === filter)
      .sort((a, b) => b.date - a.date)

    const map = new Map<string, DayGroup>()
    for (const t of list) {
      const key = dayjs(t.date).format('YYYY-MM-DD')
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: dayjs(t.date).isSame(dayjs(), 'year')
            ? formatDateLabel(t.date)
            : dayjs(t.date).format('YYYY年M月D日'),
          expense: 0,
          income: 0,
          items: []
        })
      }
      const g = map.get(key)!
      g.items.push(t)
      if (t.type === 'expense') g.expense += t.amount
      else g.income += t.amount
    }
    return [...map.values()]
  }, [txns, filter])

  const goDetail = (txn: Txn) =>
    Taro.navigateTo({ url: `/pages/detail/index?uuid=${txn.uuid}` })
  const goAdd = () => Taro.navigateTo({ url: '/pages/add/index' })

  return (
    <View className={styles.page}>
      <View className={styles.chips}>
        {FILTERS.map((f) => (
          <Text
            key={f.key}
            className={classnames(styles.chip, filter === f.key && styles.chipActive)}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </Text>
        ))}
      </View>

      <ScrollView scrollY style={{ height: 'calc(100vh - 260rpx)' }}>
        {groups.length === 0 ? (
          <Empty
            icon={filter === 'all' ? '📒' : '🔍'}
            title={filter === 'all' ? '还没有记录' : '没有相关记录'}
            subtitle='点右下角按钮记一笔'
          />
        ) : (
          groups.map((g) => (
            <View key={g.key} className={styles.dayGroup}>
              <View className={styles.dayHeader}>
                <Text className={styles.dayTitle}>{g.label}</Text>
                <Text className={styles.dayTotal}>
                  {g.expense > 0 && `支 ${fenToText(g.expense)}  `}
                  {g.income > 0 && `收 ${fenToText(g.income)}`}
                </Text>
              </View>
              {g.items.map((t) => (
                <View key={t.uuid} className={styles.dayItem}>
                  <TxnItem txn={t} onClick={goDetail} showDay />
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>

      <View className={styles.fab} onClick={goAdd}>＋</View>
    </View>
  )
}

export default RecordsPage
