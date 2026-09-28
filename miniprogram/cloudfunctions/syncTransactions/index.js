const cloud = require('wx-server-sdk')
cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV })
const db = cloud.database()

// 交易同步：幂等接收客户端变更（upsert / delete），返回该用户全量交易
exports.main = async (event) => {
  try {
    const openid = cloud.getWXContext().OPENID
    const txnsCol = db.collection('transactions')
    const changes = Array.isArray(event.changes) ? event.changes : []

    for (const change of changes) {
      const exist = await txnsCol
        .where({ _openid: openid, uuid: change.uuid })
        .limit(1)
        .get()

      if (change.op === 'delete') {
        if (exist.data.length > 0) {
          await txnsCol.doc(exist.data[0]._id).update({
            data: { deleted: true, updateTime: Date.now() }
          })
        }
        continue
      }

      if (!change.payload) continue
      const payload = change.payload

      if (exist.data.length > 0) {
        // LWW：updateTime 新者胜，旧推送忽略（幂等）
        const serverItem = exist.data[0]
        if ((payload.updateTime || 0) >= (serverItem.updateTime || 0)) {
          await txnsCol.doc(serverItem._id).update({
            data: {
              type: payload.type,
              categoryId: payload.categoryId,
              categoryName: payload.categoryName,
              categoryIcon: payload.categoryIcon,
              categoryColor: payload.categoryColor,
              amount: payload.amount,
              description: payload.description,
              date: payload.date,
              source: payload.source || 'manual',
              deleted: false,
              updateTime: payload.updateTime || Date.now()
            }
          })
        }
      } else {
        await txnsCol.add({
          data: {
            _openid: openid,
            uuid: payload.uuid,
            type: payload.type,
            categoryId: payload.categoryId,
            categoryName: payload.categoryName,
            categoryIcon: payload.categoryIcon,
            categoryColor: payload.categoryColor,
            amount: payload.amount,
            description: payload.description,
            date: payload.date,
            source: payload.source || 'manual',
            deleted: false,
            createTime: payload.createTime || Date.now(),
            updateTime: payload.updateTime || Date.now()
          }
        })
      }
    }

    // 拉取该用户全部未删除交易（个人记账数据量级可控）
    const MAX_LIMIT = 100
    const countRes = await txnsCol.where({ _openid: openid, deleted: db.command.neq(true) }).count()
    const total = countRes.total
    const batchTimes = Math.ceil(total / MAX_LIMIT)
    const tasks = []
    for (let i = 0; i < batchTimes; i++) {
      tasks.push(
        txnsCol
          .where({ _openid: openid, deleted: db.command.neq(true) })
          .skip(i * MAX_LIMIT)
          .limit(MAX_LIMIT)
          .get()
      )
    }
    const results = await Promise.all(tasks)
    const transactions = results.reduce((acc, r) => acc.concat(r.data), [])

    return {
      code: 0,
      message: 'success',
      data: {
        transactions,
        serverTime: Date.now()
      }
    }
  } catch (err) {
    console.error('[syncTransactions] error:', err)
    return { code: -1, message: err.message || '同步失败', data: null }
  }
}
