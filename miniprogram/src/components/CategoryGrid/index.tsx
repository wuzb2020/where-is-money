import React from 'react'
import { View, Text, ScrollView } from '@tarojs/components'
import classnames from 'classnames'
import type { Category } from '@/types'
import styles from './index.module.scss'

interface CategoryGridProps {
  categories: Category[]
  selectedId: string
  onSelect: (cat: Category) => void
}

function CategoryGrid({ categories, selectedId, onSelect }: CategoryGridProps) {
  return (
    <ScrollView scrollY className={styles.scroll}>
      <View className={styles.grid}>
        {categories.map((cat) => {
          const active = cat.id === selectedId
          return (
            <View
              key={cat.id}
              className={classnames(styles.cell, active && styles.cellActive)}
              onClick={() => onSelect(cat)}
            >
              <View
                className={styles.icon}
                style={{ backgroundColor: active ? cat.color : `${cat.color}1a` }}
              >
                <Text className={styles.iconText}>{cat.icon}</Text>
              </View>
              <Text className={classnames(styles.name, active && styles.nameActive)}>
                {cat.name}
              </Text>
            </View>
          )
        })}
      </View>
    </ScrollView>
  )
}

export default CategoryGrid
