import Taro from '@tarojs/taro'

const isWeapp = process.env.TARO_ENV === 'weapp'

/**
 * 调用微信云函数（真实云端能力）。
 * 仅支持微信小程序环境；H5 预览无云端后端，直接抛真实错误，绝不加载本地 mock。
 */
export async function callFunction<T = any>(
  name: string,
  data?: Record<string, any>
): Promise<T> {
  if (!isWeapp) {
    throw new Error(`云端能力「${name}」仅在微信小程序中可用，H5 预览不提供模拟数据`)
  }
  const res = await Taro.cloud.callFunction({ name, data })
  const result = res.result as { code: number; message: string; data: T }
  if (result.code !== 0) {
    console.error(`[Cloud] ${name} failed:`, result.message)
    throw new Error(result.message || '请求失败')
  }
  return result.data
}

export function getDatabase() {
  if (!isWeapp) {
    return null
  }
  return Taro.cloud.database()
}
