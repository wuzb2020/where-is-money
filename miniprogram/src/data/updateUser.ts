import Taro from '@tarojs/taro'

const MOCK_USER_KEY = 'mock_server_user'

// H5 预览时模拟「更新用户资料」云函数
export default async function updateUser(event?: {
  nickname?: string
  avatar?: string
}) {
  const user = Taro.getStorageSync(MOCK_USER_KEY) || {}
  const next = {
    ...user,
    nickname: event?.nickname ?? user.nickname ?? '',
    avatar: event?.avatar ?? user.avatar ?? '',
    updateTime: Date.now()
  }
  Taro.setStorageSync(MOCK_USER_KEY, next)
  return { user: next }
}
