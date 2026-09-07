// 导出服务：Excel / JSON 备份
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { TransactionDao, CategoryDao } from '../db';
import { formatDateTime, dayjs } from '../utils/date';
import { fenToYuan, formatAmount } from '../utils/amount';
import { PATHS, ensureDirs } from '../utils/storage';

/** 导出所有记录为 Excel 文件（xlsx） */
export async function exportToExcel() {
  await ensureDirs();
  const XLSX = await import(/* webpackIgnore: true */ 'xlsx');
  const records = await TransactionDao.listAllForExport();

  const rows = records.map((r) => ({
    '日期': formatDateTime(r.date),
    '类型': r.type === 'income' ? '收入' : '支出',
    '分类': r.categoryName,
    '金额(元)': fenToYuan(r.amount),
    '描述': r.description,
    '来源': r.source === 'manual' ? '手动' : r.source === 'image' ? '图片识别' : '文件导入',
    '记录ID': r.id,
  }));
  rows.unshift({
    '日期': `导出时间：${formatDateTime(Date.now())}`,
    '类型': '', '分类': '', '金额(元)': '', '描述': `共 ${records.length} 条记录`,
    '来源': '', '记录ID': '',
  });

  const ws = XLSX.utils.json_to_sheet(rows, { skipHeader: false });
  ws['!cols'] = [{ wch: 20 }, { wch: 8 }, { wch: 10 }, { wch: 12 }, { wch: 40 }, { wch: 12 }, { wch: 10 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, '账单明细');
  const base64 = XLSX.write(wb, { type: 'base64', bookType: 'xlsx' });

  const filename = `账单导出_${dayjs().format('YYYYMMDD_HHmm')}.xlsx`;
  const path = `${PATHS.EXPORTS}${filename}`;
  await FileSystem.writeAsStringAsync(path, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return { path, filename };
}

/** JSON 备份（全表） */
export async function exportBackupJson() {
  await ensureDirs();
  const tx = await TransactionDao.listAllForExport();
  const cats = await CategoryDao.listAll();
  const payload = {
    version: 1,
    exportedAt: Date.now(),
    app: 'qianqunale-accounting',
    categories: cats,
    transactions: tx,
  };
  const filename = `记账备份_${dayjs().format('YYYYMMDD_HHmm')}.json`;
  const path = `${PATHS.BACKUPS}${filename}`;
  await FileSystem.writeAsStringAsync(path, JSON.stringify(payload, null, 2));
  return { path, filename, size: payload.transactions.length };
}

/** 从 JSON 恢复备份（可选：合并 / 覆盖） */
export async function importBackupJson(fileUri, mode = 'merge' /* | 'overwrite' */) {
  const raw = await FileSystem.readAsStringAsync(fileUri);
  // 【修改】备份文件损坏时给友好错误，不抛裸 SyntaxError
  let payload;
  try {
    payload = JSON.parse(raw);
  } catch (e) {
    throw new Error('备份文件解析失败：文件已损坏或不是有效的 JSON（' + e.message + '）');
  }
  if (!payload || payload.app !== 'qianqunale-accounting' || !Array.isArray(payload.transactions)) {
    throw new Error('无效的备份文件（缺少 app 标识或交易数据）');
  }

  if (mode === 'overwrite') await TransactionDao.clearAll();

  // 恢复分类（ID 映射，避免自增冲突）
  const idMap = {};
  for (const cat of payload.categories || []) {
    // 先按 name+type 找
    const existing = await CategoryDao.getByNameAndType(cat.name, cat.type);
    if (existing) {
      idMap[cat.id] = existing.id;
    } else {
      const newId = await CategoryDao.create({
        type: cat.type, name: cat.name, icon: cat.icon,
        color_index: cat.colorIndex ?? 0, keywords: cat.keywords || [],
      });
      idMap[cat.id] = newId;
    }
  }

  // 【修改】兜底分类必须按记录类型取（旧代码固定回退 id=1 的支出分类，
  // 收入记录找不到分类时会被错挂到支出分类下，造成类型/分类交叉错误）
  const fallbackCat = {};
  const getFallback = async (type) => {
    if (fallbackCat[type] == null) {
      const list = await CategoryDao.listByType(type);
      fallbackCat[type] = list[0]?.id || null;
    }
    return fallbackCat[type];
  };

  // 恢复交易（批量）
  const mappedTxs = [];
  for (const t of payload.transactions) {
    const type = t.type === 'income' ? 'income' : 'expense';
    const mappedCat = idMap[t.categoryId] ?? (await getFallback(type));
    if (!mappedCat) continue; // 该类型连默认分类都没有，跳过避免 NOT NULL 崩溃
    mappedTxs.push({
      date: t.date,
      type,
      categoryId: mappedCat,
      amount: t.amount,
      description: t.description || '',
      source: t.source || 'file',
      imagePaths: t.imagePaths || [],
    });
  }
  const insertedIds = await TransactionDao.bulkCreate(mappedTxs);
  return { inserted: insertedIds.length, insertedIds, total: payload.transactions.length };
}

/** 分享文件（使用系统分享面板） */
export async function shareFile(localPath, mimeType = 'application/octet-stream') {
  const canShare = await Sharing.isAvailableAsync();
  if (!canShare) {
    // 不支持分享时，返回路径让用户自己去目录找
    return { ok: false, path: localPath, reason: '当前设备不支持分享' };
  }
  try {
    await Sharing.shareAsync(localPath, {
      mimeType,
      dialogTitle: '分享账单文件',
      UTI: mimeType === 'application/json' ? 'public.json' : 'com.microsoft.excel.xlsx',
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, path: localPath, reason: e.message };
  }
}
