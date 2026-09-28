import React from 'react'
import { View, Text } from '@tarojs/components'
import classnames from 'classnames'
import styles from './index.module.scss'

interface AmountKeyboardProps {
  onPress: (key: string) => void
}

const KEYS = ['1', '2', '3', '4', '5', '6', '7', '8', '9', '.', '0', 'back']

function AmountKeyboard({ onPress }: AmountKeyboardProps) {
  return (
    <View className={styles.keyboard}>
      {KEYS.map((k) => (
        <View
          key={k}
          className={classnames(styles.key, k === 'back' && styles.keyBack)}
          onClick={() => onPress(k)}
        >
          <Text className={styles.keyText}>{k === 'back' ? '⌫' : k}</Text>
        </View>
      ))}
    </View>
  )
}

export default AmountKeyboard
