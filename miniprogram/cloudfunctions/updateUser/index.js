const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()
const _ = db.command

// 保存微信头像/昵称
exports.main = async (event) => {
  try {
    const openid = cloud.getWXContext().OPENID
    const users = db.collection('users')
    const updateData = {
      nickname: event.nickname || '',
      avatar: event.avatar || '',
      updateTime: db.serverDate()
    }

    const found = await users.where({ _openid: openid }).limit(1).get()
    if (found.data.length === 0) {
      await users.add({ data: { ...updateData, createTime: db.serverDate() } })
    } else {
      await users.doc(found.data[0]._id).update({ data: updateData })
    }

    return { code: 0, message: 'success', data: { user: updateData } }
  } catch (err) {
    console.error('[updateUser] error:', err)
    return { code: -1, message: err.message || '保存失败', data: null }
  }
}
