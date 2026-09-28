import React, { useEffect, useMemo, useState } from 'react'
import { View, Text, Input, Picker, Button } from '@tarojs/components'
import Taro, { useRouter } from '@tarojs/taro'
import dayjs from 'dayjs'
import classnames from 'classnames'
import { useAccountStore } from '@/store/useAccountStore'
import { getCategories, type Category } from '@/constants/categories'
import { yuanToFen } from '@/utils/amount'
import {
  toDatePickerValue,
  toTimePickerValue,
  fromPickerValues
} from '@/utils/date'
import type { TxnType } from '@/types'
import CategoryGrid from '@/components/CategoryGrid'
import AmountKeyboard from '@/components/AmountKeyboard'
import styles from './index.module.scss'

function AddPage() {
  const router = useRouter()
  const editUuid = (router.params.uuid as string) || ''

  const addTxn = useAccountStore((s) => s.addTxn)
  const updateTxn = useAccountStore((s) => s.updateTxn)
  const getTxn = useAccountStore((s) => s.getTxn)

  const [type, setType] = useState<TxnType>('expense')
  const [yuan, setYuan] = useState('')
  const [category, setCategory] = useState<Category | null>(null)
  const [date, setDate] = useState<number>(Date.now())
  const [desc, setDesc] = useState('')

  const categories = useMemo(() => getCategories(type), [type])

  // 编辑模式：回填
  useEffect(() => {
    if (!editUuid) return
    const txn = getTxn(editUuid)
    if (!txn) {
      console.error('[Add] edit target not found:', editUuid)
      return
    }
    setType(txn.type)
    setYuan((txn.amount / 100).toFixed(2).replace(/\.?0+$/, ''))
    setCategory({
      id: txn.categoryId,
      name: txn.categoryName,
      icon: txn.categoryIcon,
      color: txn.categoryColor,
      type: txn.type
    })
    setDate(txn.date)
    setDesc(txn.description)
  }, [editUuid])

  // 切换收支类型时，分类选择重置
  const switchType = (t: TxnType) => {
    setType(t)
    setCategory(null)
  }

  const onKeyPress = (key: string) => {
    setYuan((prev) => {
      if (key === 'back') return prev.slice(0, -1)
      if (key === '.') {
        if (prev.includes('.')) return prev
        return prev === '' ? '0.' : `${prev}.`
      }
      if (prev.includes('.')) {
        const cents = prev.split('.')[1]
        if (cents.length >= 2) return prev
      }
      if (prev === '0') return key
      return prev + key
    })
  }

  const quickDate = (mode: 'today' | 'yesterday') => {
    const base = mode === 'today' ? dayjs() : dayjs().subtract(1, 'day')
    setDate(base.valueOf())
  }

  const onDateChange = (e) => {
    const dateStr = e.detail.value as string
    setDate(fromPickerValues(dateStr, toTimePickerValue(date)))
  }

  const onTimeChange = (e) => {
    const timeStr = e.detail.value as string
    setDate(fromPickerValues(toDatePickerValue(date), timeStr))
  }

  const onSave = () => {
    const fen = yuanToFen(parseFloat(yuan || '0'))
    if (fen <= 0) {
      Taro.showToast({ title: '请输入金额', icon: 'none' })
      return
    }
    if (!category) {
      Taro.showToast({ title: '请选择分类', icon: 'none' })
      return
    }
    const payload = {
      type,
      categoryId: category.id,
      amount: fen,
      description: desc.trim(),
      date
    }
    if (editUuid) {
      updateTxn(editUuid, payload)
      Taro.showToast({ title: '已更新', icon: 'success' })
    } else {
      addTxn(payload)
      Taro.showToast({ title: '已保存', icon: 'success' })
    }
    setTimeout(() => Taro.navigateBack(), 600)
  }

  return (
    <View className={styles.page}>
      {/* 收支切换 */}
      <View className={styles.segmented}>
        <View
          className={classnames(styles.segItem, type === 'expense' && styles.segExpenseActive)}
          onClick={() => switchType('expense')}
        >
          支出
        </View>
        <View
          className={classnames(styles.segItem, type === 'income' && styles.segIncomeActive)}
          onClick={() => switchType('income')}
        >
          收入
        </View>
      </View>

      {/* 金额 */}
      <View className={styles.amountCard}>
        <Text className={styles.currency}>¥</Text>
        <Text className={styles.amountText}>{yuan || '0'}</Text>
      </View>

      {/* 分类 */}
      <View className={styles.card}>
        <Text className={styles.cardHeader}>选择分类</Text>
        <CategoryGrid
          categories={categories}
          selectedId={category?.id || ''}
          onSelect={setCategory}
        />
      </View>

      {/* 日期与备注 */}
      <View className={styles.card}>
        <View className={styles.formRow}>
          <Text className={styles.formLabel}>日期</Text>
          <Picker mode='date' value={toDatePickerValue(date)} onChange={onDateChange}>
            <Text className={styles.formValue}>{dayjs(date).format('YYYY年M月D日')}</Text>
          </Picker>
          <View className={styles.quickChips}>
            <Text className={styles.quickChip} onClick={() => quickDate('today')}>今天</Text>
            <Text className={styles.quickChip} onClick={() => quickDate('yesterday')}>昨天</Text>
          </View>
        </View>
        <Picker mode='time' value={toTimePickerValue(date)} onChange={onTimeChange}>
          <View className={styles.formRow}>
            <Text className={styles.formLabel}>时间</Text>
            <Text className={styles.formValue}>{dayjs(date).format('HH:mm')}</Text>
          </View>
        </Picker>
        <View className={styles.formRow}>
          <Text className={styles.formLabel}>备注</Text>
          <Input
            className={styles.remarkInput}
            value={desc}
            placeholder='记点什么…（如：午餐）'
            maxlength={50}
            onInput={(e) => setDesc(e.detail.value)}
          />
        </View>
      </View>

      <Button className={styles.saveBtn} onClick={onSave}>
        {editUuid ? '保存修改' : '保存'}
      </Button>

      {/* 数字键盘 */}
      <View className={styles.keyboardWrap}>
        <AmountKeyboard onPress={onKeyPress} />
      </View>
    </View>
  )
}

export default AddPage
