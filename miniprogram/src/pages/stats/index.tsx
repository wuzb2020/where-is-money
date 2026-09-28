import React, { useMemo } from 'react'
import { View, Text } from '@tarojs/components'
import dayjs from 'dayjs'
import { useAccountStore } from '@/store/useAccountStore'
import { fenToShort, fenToText } from '@/utils/amount'
import { recentMonths } from '@/utils/date'
import Empty from '@/components/Empty'
import styles from './index.module.scss'

interface CategoryStat {
  id: string
  name: string
  icon: string
  color: string
  amount: number
  percent: number
}

function StatsPage() {
  const txns = useAccountStore((s) => s.txns)

  // 本月概览 + 分类排行
  const month = useMemo(() => {
    const start = dayjs().startOf('month').valueOf()
    const list = txns.filter((t) => t.date >= start && !t.deleted)
    let income = 0
    let expense = 0
    const catMap = new Map<string, CategoryStat>()
    for (const t of list) {
      if (t.type === 'income') {
        income += t.amount
        continue
      }
      expense += t.amount
      const exist = catMap.get(t.categoryId)
      if (exist) {
        exist.amount += t.amount
      } else {
        catMap.set(t.categoryId, {
          id: t.categoryId,
          name: t.categoryName,
          icon: t.categoryIcon,
          color: t.categoryColor,
          amount: t.amount,
          percent: 0
        })
      }
    }
    const ranking = [...catMap.values()]
      .sort((a, b) => b.amount - a.amount)
      .slice(0, 6)
      .map((c) => ({
        ...c,
        percent: expense > 0 ? Math.round((c.amount / expense) * 100) : 0
      }))
    return { income, expense, balance: income - expense, ranking, count: list.length }
  }, [txns])

  // 近 6 个月趋势
  const trend = useMemo(() => {
    const months = recentMonths(6)
    return months.map((m) => {
      let expense = 0
      let income = 0
      for (const t of txns) {
        if (t.deleted || t.date < m.start || t.date > m.end) continue
        if (t.type === 'expense') expense += t.amount
        else income += t.amount
      }
      return { ...m, expense, income }
    })
  }, [txns])

  const maxTrend = Math.max(1, ...trend.map((m) => Math.max(m.expense, m.income)))
  const barHeight = (v: number) => `${Math.max(4, (v / maxTrend) * 200)}rpx`

  return (
    <View className={styles.page}>
      <View className={styles.overview}>
        <Text className={styles.overviewTitle}>{dayjs().format('YYYY年M月')}收支总览</Text>
        <View className={styles.overviewRow}>
          <View className={styles.overviewItem}>
            <Text className={styles.overviewLabel}>收入</Text>
            <Text className={styles.overviewValue}>{fenToShort(month.income)}</Text>
          </View>
          <View className={styles.overviewItem}>
            <Text className={styles.overviewLabel}>支出</Text>
            <Text className={styles.overviewValue}>{fenToShort(month.expense)}</Text>
          </View>
          <View className={styles.overviewItem}>
            <Text className={styles.overviewLabel}>结余</Text>
            <Text className={styles.overviewValue}>{fenToShort(month.balance)}</Text>
          </View>
        </View>
      </View>

      <View className={styles.card}>
        <Text className={styles.cardTitle}>支出分类排行</Text>
        {month.ranking.length === 0 ? (
          <Empty icon='📊' title='本月还没有支出' subtitle='记一笔后自动生成排行' />
        ) : (
          month.ranking.map((c) => (
            <View key={c.id} className={styles.rankRow}>
              <View className={styles.rankIcon} style={{ backgroundColor: `${c.color}1a` }}>
                <Text>{c.icon}</Text>
              </View>
              <View className={styles.rankInfo}>
                <View className={styles.rankName}>
                  <Text>{c.name}</Text>
                  <Text className={styles.rankAmount}>
                    {fenToText(c.amount)}
                    <Text className={styles.rankPercent}> {c.percent}%</Text>
                  </Text>
                </View>
                <View className={styles.rankBarTrack}>
                  <View
                    className={styles.rankBar}
                    style={{ width: `${c.percent}%`, backgroundColor: c.color }}
                  />
                </View>
              </View>
            </View>
          ))
        )}
      </View>

      <View className={styles.card}>
        <Text className={styles.cardTitle}>近 6 个月趋势</Text>
        <View className={styles.trend}>
          {trend.map((m) => (
            <View key={m.key} className={styles.trendCol}>
              <View className={styles.trendBars}>
                <View className={styles.trendBarExpense} style={{ height: barHeight(m.expense) }} />
                <View className={styles.trendBarIncome} style={{ height: barHeight(m.income) }} />
              </View>
              <Text className={styles.trendLabel}>{m.label}</Text>
            </View>
          ))}
        </View>
        <View className={styles.legend}>
          <View className={styles.legendItem}>
            <View className={styles.legendDot} style={{ backgroundColor: '#ef4444' }} />
            <Text>支出</Text>
          </View>
          <View className={styles.legendItem}>
            <View className={styles.legendDot} style={{ backgroundColor: '#10b981' }} />
            <Text>收入</Text>
          </View>
        </View>
      </View>
    </View>
  )
}

export default StatsPage
