import React from 'react'
import { View, Text } from '@tarojs/components'
import classnames from 'classnames'
import type { Txn } from '@/types'
import { fenToText } from '@/utils/amount'
import { formatTime } from '@/utils/date'
import styles from './index.module.scss'

interface TxnItemProps {
  txn: Txn
  onClick?: (txn: Txn) => void
  showDay?: boolean
}

function TxnItem({ txn, onClick, showDay }: TxnItemProps) {
  const isIncome = txn.type === 'income'
  return (
    <View className={styles.item} onClick={() => onClick?.(txn)}>
      <View
        className={styles.icon}
        style={{ backgroundColor: `${txn.categoryColor}1a` }}
      >
        <Text className={styles.iconText}>{txn.categoryIcon}</Text>
      </View>
      <View className={styles.info}>
        <Text className={styles.name}>{txn.categoryName}</Text>
        <Text className={styles.desc}>
          {txn.description || formatTime(txn.date)}
        </Text>
      </View>
      <View className={styles.right}>
        <Text className={classnames(styles.amount, isIncome && styles.income)}>
          {isIncome ? '+' : '-'}{fenToText(txn.amount)}
        </Text>
        {showDay && <Text className={styles.time}>{formatTime(txn.date)}</Text>}
      </View>
    </View>
  )
}

export default TxnItem
