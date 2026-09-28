import React from 'react'
import { View, Text } from '@tarojs/components'
import styles from './index.module.scss'

function CategoryPage() {
  return (
    <View className={styles.placeholder}>
      <Text className={styles.icon}>🏷️</Text>
      <Text className={styles.title}>分类管理</Text>
      <Text className={styles.tip}>功能正在开发中…</Text>
    </View>
  )
}

export default CategoryPage
