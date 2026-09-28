import React, { useEffect, useState } from 'react'
import { View, Text, Image, Button, Input } from '@tarojs/components'
import Taro from '@tarojs/taro'
import dayjs from 'dayjs'
import { useAccountStore } from '@/store/useAccountStore'
import styles from './index.module.scss'

function MinePage() {
  const user = useAccountStore((s) => s.user)
  const outbox = useAccountStore((s) => s.outbox)
  const syncing = useAccountStore((s) => s.syncing)
  const lastSyncAt = useAccountStore((s) => s.lastSyncAt)
  const saveUser = useAccountStore((s) => s.saveUser)
  const flush = useAccountStore((s) => s.flush)

  const [nickname, setNickname] = useState('')

  // 登录回填昵称
  useEffect(() => {
    if (user?.nickname) setNickname(user.nickname)
  }, [user?.nickname])

  // 微信头像选择（新版能力 open-type=chooseAvatar）
  const onChooseAvatar = (e) => {
    const avatarUrl = e?.detail?.avatarUrl
    if (avatarUrl) {
      saveUser({ avatar: avatarUrl }).catch((err) =>
        console.error('[Mine] save avatar failed:', err)
      )
    }
  }

  // 微信昵称输入（type=nickname 触发微信昵称自动填充），失焦时保存
  const onNicknameBlur = () => {
    const next = nickname.trim()
    if (next && next !== user?.nickname) {
      saveUser({ nickname: next }).catch((err) =>
        console.error('[Mine] save nickname failed:', err)
      )
    }
  }

  const onSync = () => {
    if (syncing) return
    flush()
      .then(() => Taro.showToast({ title: '同步完成', icon: 'success' }))
      .catch(() => Taro.showToast({ title: '同步失败，请稍后重试', icon: 'none' }))
  }

  const goCategory = () => Taro.navigateTo({ url: '/pages/category/index' })
  const onExport = () =>
    Taro.showToast({ title: '导出功能即将上线', icon: 'none' })
  const onAbout = () =>
    Taro.showModal({
      title: '钱去哪儿了',
      content: '离线优先记账本，数据先存本地、自动云同步。小程序版 v1.0.0',
      showCancel: false
    })

  const syncDesc = syncing
    ? '正在同步到云端…'
    : outbox.length > 0
      ? `${outbox.length} 条记录待上传`
      : lastSyncAt
        ? `上次同步 ${dayjs(lastSyncAt).format('MM-DD HH:mm')}`
        : '数据将自动备份到云端'

  return (
    <View className={styles.page}>
      {/* 微信账号 */}
      <View className={styles.userCard}>
        <Button
          className={styles.avatarBtn}
          openType='chooseAvatar'
          onChooseAvatar={onChooseAvatar}
        >
          {user?.avatar ? (
            <Image className={styles.avatarImg} src={user.avatar} mode='aspectFill' />
          ) : (
            <Text className={styles.avatarPlaceholder}>🙂</Text>
          )}
        </Button>
        <View className={styles.userInfo}>
          <Input
            className={styles.nicknameInput}
            type='nickname'
            value={nickname}
            placeholder='点击设置微信昵称'
            placeholderClass={styles.userTip}
            onInput={(e) => setNickname(e.detail.value)}
            onBlur={onNicknameBlur}
          />
          <Text className={styles.userTip}>点击头像/昵称绑定微信账号</Text>
        </View>
      </View>

      {/* 云同步状态 */}
      <View className={styles.card}>
        <View className={styles.syncRow}>
          <View className={styles.syncIcon}>☁️</View>
          <View className={styles.syncInfo}>
            <Text className={styles.syncTitle}>云端同步</Text>
            <Text className={styles.syncDesc}>{syncDesc}</Text>
          </View>
          <Button className={styles.syncBtn} onClick={onSync} loading={syncing}>
            {syncing ? '同步中' : '立即同步'}
          </Button>
        </View>
      </View>

      {/* 功能菜单 */}
      <View className={styles.card}>
        <View className={styles.menuItem} onClick={goCategory}>
          <View className={styles.menuIcon}>🏷️</View>
          <Text className={styles.menuLabel}>分类管理</Text>
          <Text className={styles.menuArrow}>›</Text>
        </View>
        <View className={styles.menuItem} onClick={onExport}>
          <View className={styles.menuIcon}>📤</View>
          <Text className={styles.menuLabel}>导出账单</Text>
          <Text className={styles.menuArrow}>›</Text>
        </View>
        <View className={styles.menuItem} onClick={onAbout}>
          <View className={styles.menuIcon}>ℹ️</View>
          <Text className={styles.menuLabel}>关于</Text>
          <Text className={styles.menuArrow}>›</Text>
        </View>
      </View>
    </View>
  )
}

export default MinePage
