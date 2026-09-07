// Excel 解析器（SheetJS xlsx）：自动列匹配 + 模板学习
import * as FileSystem from 'expo-file-system';
import { ImportTemplateDao, CategoryDao } from '../db';
import { extractBestDate } from './DateExtractor';
import { classifyType, matchCategory } from './CategoryMatcher';
import { yuanToFen } from '../utils/amount';
import { dayjs } from '../utils/date';

/** 列模糊匹配关键词 */
const COLUMN_KEYWORDS = {
  date:        ['日期', '时间', '日', 'date', 'time', '交易时间', '发生时间', '记账日期'],
  type:        ['类型', '收支', '收入支出', '方向', 'type', 'kind'],
  amount:      ['金额', '钱', '元', 'amount', 'price', '总价', '发生额', '数值'],
  category:    ['分类', '来源', '类别', 'category', '一级分类', '二级分类'],
  description: ['备注', '说明', '描述', '摘要', '详情', 'note', 'remark', '项目'],
  incomeOnly:  ['收入金额', '收入', '进账'],
  expenseOnly: ['支出金额', '支出', '花费'],
};

/** 列匹配：根据表头文字猜测列的含义 */
function detectColumnMapping(headerRow) {
  const mapping = {}; // { date: colIndex, amount: colIndex, ... }
  const headers = (headerRow || []).map((h) => String(h || '').trim());
  headers.forEach((h, i) => {
    const lower = h.toLowerCase();
    // 【修改 P1】「收入金额/支出金额」双列必须优先于通用「金额」判断，
    // 否则表头含「金额」二字会先命中 amount 组，双列模式永远不生效
    if (COLUMN_KEYWORDS.incomeOnly.some((kw) => lower.includes(kw.toLowerCase()))) {
      mapping.incomeOnly = i; return;
    }
    if (COLUMN_KEYWORDS.expenseOnly.some((kw) => lower.includes(kw.toLowerCase()))) {
      mapping.expenseOnly = i; return;
    }
    for (const [key, kws] of Object.entries(COLUMN_KEYWORDS)) {
      if (key === 'incomeOnly' || key === 'expenseOnly') continue;
      if (kws.some((kw) => lower.includes(kw.toLowerCase()))) {
        mapping[key] = i;
        break;
      }
    }
  });

  // 收入/支出分开两列 → 双列金额模式
  if (mapping.incomeOnly != null && mapping.expenseOnly != null) {
    mapping._dualAmount = true;
  }

  return mapping;
}

/** 表头指纹（签名）：用于模板匹配学习 */
function hashHeader(headerRow) {
  const headers = (headerRow || []).map((h) => String(h || '').trim());
  // 简单 hash：用 | 拼接后 base64 前 24 字符
  const s = headers.join('|');
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = ((hash << 5) - hash + s.charCodeAt(i)) | 0;
  return `h_${Math.abs(hash).toString(36)}_${headers.length}`;
}

/** 根据列映射 + 行数据 → 解析为一条交易候选 */
async function rowToCandidate(row, mapping) {
  const getVal = (idx) => (idx != null && row[idx] !== undefined ? row[idx] : null);

  // 解析日期
  let date = Date.now();
  const dateVal = getVal(mapping.date);
  if (dateVal != null && dateVal !== '') {
    if (dateVal instanceof Date) {
      date = dateVal.getTime();
    } else if (typeof dateVal === 'number') {
      // Excel 序列日期
      date = excelSerialToDate(dateVal).getTime();
    } else {
      const ts = await extractBestDate(String(dateVal));
      if (ts) date = ts;
    }
  }

  // 解析类型 + 金额
  let type = 'expense';
  let amount = 0;
  if (mapping._dualAmount) {
    const income = numOrZero(getVal(mapping.incomeOnly));
    const expense = numOrZero(getVal(mapping.expenseOnly));
    if (income > 0 && expense === 0) { type = 'income'; amount = income; }
    else if (expense > 0 && income === 0) { type = 'expense'; amount = expense; }
    else if (income > expense) { type = 'income'; amount = income; }
    else { type = 'expense'; amount = expense; }
  } else {
    amount = numOrZero(getVal(mapping.amount));
    // 类型列
    const typeRaw = getVal(mapping.type);
    if (typeRaw != null) {
      const s = String(typeRaw);
      if (/收入|进|入|in|\+/.test(s)) type = 'income';
      else if (/支出|出|花|消|out|\-/.test(s)) type = 'expense';
    } else {
      // 金额正负判断
      if (amount < 0) { amount = Math.abs(amount); type = 'expense'; }
    }
  }
  if (amount <= 0) return null; // 跳过空金额行
  const amountFen = yuanToFen(amount);

  // 分类
  let categoryId = null;
  const catName = String(getVal(mapping.category) || '').trim();
  if (catName) {
    const cat = await CategoryDao.getByNameAndType(catName, type);
    if (cat) categoryId = cat.id;
  }

  // 描述 → 全文本喂给分类匹配兜底
  const description = String(getVal(mapping.description) || '').trim();
  const fullText = [catName, description].filter(Boolean).join(' ');
  if (!categoryId && fullText) {
    const matched = await matchCategory(fullText, type);
    if (matched.categoryId) categoryId = matched.categoryId;
  }
  // 还没有分类 → 用该类型第一个分类
  if (!categoryId) {
    const list = await CategoryDao.listByType(type);
    if (list[0]) categoryId = list[0].id;
  }

  return {
    date,
    type,
    categoryId,
    amount: amountFen,
    description: description.slice(0, 100),
    source: 'file',
    imagePaths: [],
    _raw: row, // 保留原始行，预览失败时显示
  };
}

function numOrZero(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  // 去掉 ¥ , 空格
  const s = String(v).replace(/[¥￥,\s]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? 0 : n;
}

/** Excel 序列日期 → JS Date */
function excelSerialToDate(serial) {
  // Excel 1900 日期系统（2 月有 29 日的 bug，这里兼容）
  const utcDays = Math.floor(serial - 25569);
  const utcValue = utcDays * 86400;
  const dateInfo = new Date(utcValue * 1000);
  const fractionalDay = serial - Math.floor(serial) + 0.0000001;
  let totalSeconds = Math.floor(86400 * fractionalDay);
  const seconds = totalSeconds % 60; totalSeconds -= seconds;
  const hours = Math.floor(totalSeconds / (60 * 60));
  const minutes = Math.floor(totalSeconds / 60) % 60;
  return new Date(dateInfo.getFullYear(), dateInfo.getMonth(), dateInfo.getDate(), hours, minutes, seconds);
}

/** 主入口：解析 Excel 文件 */
export async function parseExcel(fileUri) {
  // 动态引入 xlsx（体积大，避免启动时加载）
  const XLSX = await import(/* webpackIgnore: true */ 'xlsx');
  const base64 = await FileSystem.readAsStringAsync(fileUri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const wb = XLSX.read(base64, { type: 'base64', cellDates: true });
  // 找第一个有数据的 Sheet
  const sheetName = wb.SheetNames.find((n) => {
    const ws = wb.Sheets[n];
    return ws && Object.keys(ws).some((k) => k.startsWith('A') || k.startsWith('B'));
  }) || wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  if (!rows || rows.length < 2) {
    return { previewRows: [], headerSignature: '', detectedMapping: {}, suggestedTemplateId: null, totalRows: 0 };
  }

  // 找表头行（第一个非空行）
  let headerRowIdx = 0;
  while (headerRowIdx < rows.length && rows[headerRowIdx].every((c) => !c || String(c).trim() === '')) {
    headerRowIdx++;
  }
  // 【修改】整表全空时 rows[headerRowIdx] 为 undefined，直接 .every 会抛 TypeError
  if (!rows[headerRowIdx]) {
    return { previewRows: [], headerSignature: '', detectedMapping: {}, suggestedTemplateId: null, totalRows: 0, header: [] };
  }
  const headerRow = rows[headerRowIdx];
  // 【修改】保留原始 Excel 行号（过滤空行后下标会错位，导致预览行号对不上）
  const dataRows = rows.slice(headerRowIdx + 1)
    .map((r, i) => ({ row: r, rowNum: headerRowIdx + 2 + i }))
    .filter((x) => x.row.some((c) => c != null && c !== ''));

  const headerSignature = hashHeader(headerRow);

  // 模板匹配
  const existingTemplate = await ImportTemplateDao.findBySignature(headerSignature);
  let mapping = existingTemplate ? existingTemplate.mapping : detectColumnMapping(headerRow);

  // 批量解析
  const previewRows = [];
  for (const { row, rowNum } of dataRows) {
    const candidate = await rowToCandidate(row, mapping);
    if (candidate) {
      candidate._rowNum = rowNum;
      previewRows.push(candidate);
    }
  }

  return {
    previewRows,
    headerSignature,
    detectedMapping: mapping,
    suggestedTemplateId: existingTemplate?.id || null,
    totalRows: dataRows.length,
    header: headerRow,
  };
}

/** 用户手动调整了列映射后，重新解析预览 */
export async function reparseWithMapping(fileUri, mapping) {
  // 【修改】复用 parseExcel 的文件读取/表头定位（含空表防护与正确行号），仅替换 mapping 重跑行解析
  const XLSX = await import(/* webpackIgnore: true */ 'xlsx');
  const base64 = await FileSystem.readAsStringAsync(fileUri, { encoding: FileSystem.EncodingType.Base64 });
  const wb = XLSX.read(base64, { type: 'base64', cellDates: true });
  const sheetName = wb.SheetNames[0];
  const ws = wb.Sheets[sheetName];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: '' });
  let headerRowIdx = 0;
  while (headerRowIdx < rows.length && rows[headerRowIdx].every((c) => !c || String(c).trim() === '')) headerRowIdx++;
  if (!rows[headerRowIdx]) {
    return { previewRows: [], headerSignature: '', header: [] };
  }
  const headerRow = rows[headerRowIdx];
  const dataRows = rows.slice(headerRowIdx + 1)
    .map((r, i) => ({ row: r, rowNum: headerRowIdx + 2 + i }))
    .filter((x) => x.row.some((c) => c != null && c !== ''));
  const previewRows = [];
  for (const { row, rowNum } of dataRows) {
    const candidate = await rowToCandidate(row, mapping);
    if (candidate) {
      candidate._rowNum = rowNum;
      previewRows.push(candidate);
    }
  }
  return { previewRows, headerSignature: hashHeader(headerRow), header: headerRow };
}

/** 保存模板（用户认可后调用） */
export async function saveImportTemplate(fileType, headerSignature, mapping) {
  await ImportTemplateDao.save(fileType, headerSignature, mapping);
}
