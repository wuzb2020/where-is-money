import React, { useEffect } from 'react'
import Taro, { useDidShow } from '@tarojs/taro'
import { useAccountStore } from './store/useAccountStore'
// 全局样式
import './app.scss'

function App(props) {
  useEffect(() => {
    // 云开发初始化（仅微信端；env 在 CloudBase 部署后填入真实环境 ID）
    if (process.env.TARO_ENV === 'weapp') {
      Taro.cloud.init({ env: 'your-env-id', traceUser: true })
    }
    // 启动：先加载本地数据，再静默登录 + 云端同步
    useAccountStore.getState().init().catch((err) => {
      console.error('[App] init failed:', err)
    })
  }, [])

  // 每次回到前台：重试同步待上传队列
  useDidShow(() => {
    const { outbox, init } = useAccountStore.getState()
    if (outbox.length > 0) {
      init().catch((err) => console.error('[App] re-sync failed:', err))
    }
  })

  return props.children
}

export default App
