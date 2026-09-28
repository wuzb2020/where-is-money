import Taro from '@tarojs/taro'
import type { LoginResult } from '@/types'

const MOCK_USER_KEY = 'mock_server_user'

// H5 预览时模拟「微信静默登录」云函数
export default async function login(): Promise<LoginResult> {
  let user = Taro.getStorageSync(MOCK_USER_KEY)
  if (!user) {
    user = {
      nickname: '微信用户',
      avatar: '',
      createTime: Date.now()
    }
    Taro.setStorageSync(MOCK_USER_KEY, user)
  }
  return {
    openid: 'mock_openid_preview',
    user
  }
}
