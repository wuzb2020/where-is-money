import React, { useMemo } from 'react'
import { View, Text, Image } from '@tarojs/components'
import Taro, { usePullDownRefresh } from '@tarojs/taro'
import dayjs from 'dayjs'
import classnames from 'classnames'
import { useAccountStore } from '@/store/useAccountStore'
import { fenToShort } from '@/utils/amount'
import type { Txn } from '@/types'
import TxnItem from '@/components/TxnItem'
import Empty from '@/components/Empty'
import styles from './index.module.scss'

function HomePage() {
  const txns = useAccountStore((s) => s.txns)
  const user = useAccountStore((s) => s.user)
  const outbox = useAccountStore((s) => s.outbox)
  const syncing = useAccountStore((s) => s.syncing)
  const lastSyncAt = useAccountStore((s) => s.lastSyncAt)
  const flush = useAccountStore((s) => s.flush)

  // 本月数据
  const monthData = useMemo(() => {
    const start = dayjs().startOf('month').valueOf()
    const list = txns.filter((t) => t.date >= start && !t.deleted)
    let income = 0
    let expense = 0
    for (const t of list) {
      if (t.type === 'income') income += t.amount
      else expense += t.amount
    }
    return { income, expense, balance: income - expense, count: list.length }
  }, [txns])

  const recent = useMemo(() => txns.slice(0, 6), [txns])

  usePullDownRefresh(() => {
    flush()
      .catch((err) => console.error('[Home] pull refresh sync failed:', err))
      .finally(() => Taro.stopPullDownRefresh())
  })

  const goAdd = () => Taro.navigateTo({ url: '/pages/add/index' })
  const goRecords = () => Taro.switchTab({ url: '/pages/records/index' })
  const goMine = () => Taro.switchTab({ url: '/pages/mine/index' })
  const goDetail = (txn: Txn) =>
    Taro.navigateTo({ url: `/pages/detail/index?uuid=${txn.uuid}` })

  const syncText = syncing
    ? '正在同步…'
    : outbox.length > 0
      ? `待同步 ${outbox.length} 条`
      : lastSyncAt
        ? `已同步 · ${dayjs(lastSyncAt).format('HH:mm')}`
        : '云端已连接'

  return (
    <View className={styles.page}>
      <View className={styles.header}>
        <View className={styles.greetingRow}>
          <Text className={styles.greeting}>
            {dayjs().hour() < 12 ? '早上好' : dayjs().hour() < 18 ? '下午好' : '晚上好'}，记下今天的开销吧
          </Text>
          <View className={styles.avatar} onClick={goMine}>
            {user?.avatar ? (
              <Image className={styles.avatarImg} src={user.avatar} mode='aspectFill' />
            ) : (
              <Text className={styles.avatarText}>🙂</Text>
            )}
          </View>
        </View>

        <View className={styles.syncBadge}>
          <View className={classnames(styles.syncDot, outbox.length > 0 && styles.syncDotPending)} />
          <Text>{syncText}</Text>
        </View>

        <Text className={styles.monthLabel}>{dayjs().format('YYYY年M月')}</Text>

        <View className={styles.summary}>
          <View className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>本月收入</Text>
            <Text className={styles.summaryValue}>{fenToShort(monthData.income)}</Text>
          </View>
          <View className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>本月支出</Text>
            <Text className={styles.summaryValue}>{fenToShort(monthData.expense)}</Text>
          </View>
          <View className={styles.summaryItem}>
            <Text className={styles.summaryLabel}>本月结余</Text>
            <Text className={styles.summaryValue}>{fenToShort(monthData.balance)}</Text>
          </View>
        </View>
      </View>

      <View className={styles.body}>
        <View className={styles.card}>
          <View className={styles.cardHeader}>
            <Text className={styles.cardTitle}>最近记录</Text>
            <Text className={styles.cardMore} onClick={goRecords}>查看全部 ›</Text>
          </View>
          {recent.length === 0 ? (
            <Empty />
          ) : (
            recent.map((txn) => (
              <View key={txn.uuid} className={styles.recentItem}>
                <TxnItem txn={txn} onClick={goDetail} />
              </View>
            ))
          )}
        </View>
      </View>

      <View className={styles.fab} onClick={goAdd}>＋ 记一笔</View>
    </View>
  )
}

export default HomePage
