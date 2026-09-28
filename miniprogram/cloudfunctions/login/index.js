const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 静默登录：获取 openid，首次登录自动建档
exports.main = async () => {
  try {
    const wxContext = cloud.getWXContext()
    const openid = wxContext.OPENID
    const users = db.collection('users')

    const found = await users.where({ _openid: openid }).limit(1).get()
    let user
    if (found.data.length === 0) {
      const createTime = db.serverDate()
      await users.add({
        data: { nickname: '', avatar: '', createTime }
      })
      user = { nickname: '', avatar: '', createTime: Date.now() }
    } else {
      user = found.data[0]
    }

    return {
      code: 0,
      message: 'success',
      data: {
        openid,
        user: {
          nickname: user.nickname || '',
          avatar: user.avatar || '',
          createTime: user.createTime
        }
      }
    }
  } catch (err) {
    console.error('[login] error:', err)
    return { code: -1, message: err.message || '登录失败', data: null }
  }
}
