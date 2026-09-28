import React, { useMemo } from 'react'
import { View, Text, Button } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import classnames from 'classnames'
import { useAccountStore } from '@/store/useAccountStore'
import { fenToText } from '@/utils/amount'
import { formatDateTime } from '@/utils/date'
import Empty from '@/components/Empty'
import styles from './index.module.scss'

function DetailPage() {
  const router = useRouter()
  const uuid = router.params.uuid as string
  const txns = useAccountStore((s) => s.txns)
  const removeTxn = useAccountStore((s) => s.removeTxn)

  const txn = useMemo(() => txns.find((t) => t.uuid === uuid), [txns, uuid])

  const onEdit = () => {
    Taro.redirectTo({ url: `/pages/add/index?uuid=${uuid}` })
  }

  const onDelete = () => {
    Taro.showModal({
      title: '删除这条记录？',
      content: '删除后将从云端同步移除',
      confirmText: '删除',
      confirmColor: '#ef4444',
      success: (res) => {
        if (res.confirm) {
          removeTxn(uuid)
          Taro.showToast({ title: '已删除', icon: 'success' })
          setTimeout(() => Taro.navigateBack(), 500)
        }
      }
    })
  }

  if (!txn) {
    return (
      <View className={styles.page}>
        <View className={styles.empty}>
          <Empty icon='❓' title='记录不存在' subtitle='可能已被删除' />
        </View>
      </View>
    )
  }

  const isIncome = txn.type === 'income'

  return (
    <View className={styles.page}>
      <View className={styles.hero}>
        <View className={styles.heroIcon}>{txn.categoryIcon}</View>
        <Text className={styles.heroCategory}>{txn.categoryName}</Text>
        <Text className={styles.heroAmount}>
          {isIncome ? '+' : '-'}{fenToText(txn.amount)}
        </Text>
      </View>

      <View className={styles.card}>
        <View className={styles.row}>
          <Text className={styles.rowLabel}>类型</Text>
          <Text className={styles.rowValue}>{isIncome ? '收入' : '支出'}</Text>
        </View>
        <View className={styles.row}>
          <Text className={styles.rowLabel}>时间</Text>
          <Text className={styles.rowValue}>{formatDateTime(txn.date)}</Text>
        </View>
        <View className={styles.row}>
          <Text className={styles.rowLabel}>备注</Text>
          <Text className={styles.rowValue}>{txn.description || '无'}</Text>
        </View>
      </View>

      <View className={styles.actions}>
        <Button className={classnames(styles.btn, styles.btnEdit)} onClick={onEdit}>
          编辑
        </Button>
        <Button className={classnames(styles.btn, styles.btnDelete)} onClick={onDelete}>
          删除
        </Button>
      </View>
    </View>
  )
}

export default DetailPage
