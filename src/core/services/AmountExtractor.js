// 文本 → 金额抽取（12 条正则 + OCR 字符纠错）
import { yuanToFen } from '../utils/amount';

/** OCR 字符级纠错映射（金额数字常见识别错误） */
const CHAR_FIX = {
  'O': '0', 'o': '0', 'Q': '0', 'D': '0',
  'l': '1', 'I': '1', '|': '1',
  'Z': '2', 'z': '2',
  'B': '8', 'S': '5', 's': '5',
  'g': '9', 'q': '9',
  'Y': '¥', '￥': '¥',
  '，': ',', '。': '.', '、': '.',
};

function fixOcrChars(str) {
  if (!str) return '';
  return String(str).split('').map((c) => CHAR_FIX[c] || c).join('');
}

/** 金额抽取正则（按优先级） */
const AMOUNT_PATTERNS = [
  // ① ¥ / ￥ 前缀
  { regex: /[¥￥]\s*([\d,]+(?:\.\d{1,2})?)/g },
  // ② 金额： / 实付：/ 应付： / 支付：
  { regex: /(?:金额|实收|实付|应付|支付|到账|合计|共计|总计|消费|花费)[::]?\s*[¥￥]?\s*([\d,]+(?:\.\d{1,2})?)/g },
  // ③ RMB / CNY / 元 结尾
  { regex: /([\d,]+(?:\.\d{1,2})?)\s*(?:元|RMB|CNY|块)/gi },
  // ④ 普通 xxxx.xx （必须精确到分，即小数点后 2 位，避免误匹配年份/日期）
  { regex: /(?<![\d.])(\d{1,6}\.\d{2})(?![\d])/g },
  // ⑤ 纯整数（> 10 且 < 100万，作为兜底）
  // 【修改】后向断言排除 年/月/日/:/ /- 等日期上下文，避免把"2026年"里的年份 2026 误抽成金额
  { regex: /(?<![\d.])(\d{2,6})(?![\d.年月日号:/-])/g },
];

/**
 * 从文本中抽取所有可能的金额
 * @returns {Promise<{value: number /* 分 *\/, raw: string }[]>}
 */
export async function extractAllAmounts(text) {
  if (!text) return [];
  const fixed = fixOcrChars(text);
  const results = [];
  const seen = new Set(); // 去重

  for (const { regex } of AMOUNT_PATTERNS) {
    const regex_ = new RegExp(regex.source, regex.flags);
    let m;
    while ((m = regex_.exec(fixed)) !== null) {
      const raw = m[1] || m[0];
      // 去掉千分位逗号
      const numStr = String(raw).replace(/,/g, '').trim();
      const num = parseFloat(numStr);
      if (isNaN(num) || num <= 0 || num >= 1e9) continue;
      // 转分（整数）
      const fen = yuanToFen(num);
      if (fen <= 0) continue;
      const key = `${fen}_${raw.slice(0, 10)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      results.push({ value: fen, raw });
    }
    if (results.length > 0) break; // 高优先级模式命中就不往下找了
  }

  return results;
}

/** 抽取主金额（取识别到的最大的那个，通常账单的总金额最大） */
export async function extractPrimaryAmount(text) {
  const all = await extractAllAmounts(text);
  if (all.length === 0) return null;
  if (all.length === 1) return all[0];
  // 取最大
  return all.reduce((max, cur) => (cur.value > max.value ? cur : max));
}
