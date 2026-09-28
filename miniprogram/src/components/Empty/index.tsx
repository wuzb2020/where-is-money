import React from 'react'
import { View, Text } from '@tarojs/components'
import styles from './index.module.scss'

interface EmptyProps {
  icon?: string
  title?: string
  subtitle?: string
}

function Empty({ icon = '📒', title = '还没有记录', subtitle = '点下方按钮记第一笔吧' }: EmptyProps) {
  return (
    <View className={styles.empty}>
      <Text className={styles.icon}>{icon}</Text>
      <Text className={styles.title}>{title}</Text>
      <Text className={styles.subtitle}>{subtitle}</Text>
    </View>
  )
}

export default Empty
