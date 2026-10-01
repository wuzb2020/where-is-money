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

/**
 * 还款/借贷上下文的金额片段修复
 * OCR 常把超大字号的小数点识别成空格/逗号，导致 "254.83" 被拆成 "254" + "83"。
 * 约定：在还款上下文里，单个空格/逗号后跟 1~2 位数字即视为小数部分。
 */
function repayAmountFromRaw(raw) {
  let s = String(raw).trim();
  // 去掉标点两侧空格："254 . 83" → "254.83"
  s = s.replace(/\s*([.,，．])\s*/g, '$1');
  // 标准千分位：1,288.50
  if (/^\d{1,3}(?:,\d{3})+(?:\.\d{1,2})?$/.test(s)) return parseFloat(s.replace(/,/g, ''));
  // 正常数字/小数：254.83
  if (/^-?\d+(?:\.\d+)?$/.test(s)) return parseFloat(s);
  // OCR 用逗号/中文逗号顶替小数点：254,83 / 254，83
  if (/^\d{1,6}[,，]\d{1,2}$/.test(s)) return parseFloat(s.replace(/[,，]/g, '.'));
  // 空格分隔的被拆小数：254 83
  const parts = s.split(/\s+/);
  if (parts.length === 2 && /^\d{1,6}$/.test(parts[0]) && /^\d{1,2}$/.test(parts[1])) {
    return parseFloat(`${parts[0]}.${parts[1]}`);
  }
  const stripped = s.replace(/[^\d.]/g, '');
  return stripped ? parseFloat(stripped) : NaN;
}

/** 金额抽取正则（按优先级） */
const AMOUNT_PATTERNS = [
  // ① ¥ / ￥ 前缀
  { regex: /[¥￥]\s*([\d,]+(?:\.\d{1,2})?)/g },
  // ②-a 还款/借贷上下文——金额在【前】、"还款成功/已还款/还款"等在【后】
  // （花呗还款、信用卡还款等页面金额无 ¥ 无 元；片段内允许空格/逗号/点号噪声）
  {
    regex: /(\d[\d,，．.\s]{0,12}?\d|\d)(?!\s*[.,，．]\s*\d)\s*(?:还款成功|已还款|还款|已还|应还款?|待还款?)/g,
    normalize: repayAmountFromRaw,
  },
  // ②-b 还款/借贷上下文——"应还/待还/借款金额"等在【前】、金额在【后】
  // 尾部 (?!\s*[年月]) 防止把"自动还款-2026年09月账单"里的年份误当金额；
  // (?!\s*[a-zA-Z]) 防止"还款至 7m"这类 OCR 残片（数字后直接跟字母）
  {
    name: 'repay-after',
    regex: /(?:本期)?(?:应还款?|待还款?|已还款?|还款成功|还款|借款(?:金额)?|借钱)[^0-9¥￥]{0,6}[¥￥]?\s*(\d[\d,，．.\s]{0,12}?\d|\d)(?![\d])(?!\s*[.,，．]\s*\d)(?!\s*[年月])(?!\s*[a-zA-Z])/g,
    normalize: repayAmountFromRaw,
  },
  // ③ 金额： / 实付：/ 应付： / 支付：
  { regex: /(?:金额|实收|实付|应付|支付|到账|合计|共计|总计|消费|花费)[::]?\s*[¥￥]?\s*([\d,]+(?:\.\d{1,2})?)/g },
  // ③ RMB / CNY / 元 结尾
  { regex: /([\d,]+(?:\.\d{1,2})?)\s*(?:元|RMB|CNY|块)/gi },
  // ④ 普通 xxxx.xx （必须精确到分，即小数点后 2 位，避免误匹配年份/日期）
  { regex: /(?<![\d.])(\d{1,6}\.\d{2})(?![\d])/g },
  // ⑤ 纯整数（> 10 且 < 100万，作为兜底）
  // 【修改】后向断言排除 年/月/日/:/ /- 等日期上下文，避免把"2026年"里的年份 2026 误抽成金额；
  // 空格间隔的"2026 年"也一并排除（(?!\s*[年月日号])）
  {
    name: 'plain-int',
    regex: /(?<![\d.])(\d{2,6})(?![\d.年月日号:/-])(?!\s*[年月日号])/g,
  },
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

  // 预计算每行起点：整数兜底模式要按「所在行」过滤日期/时间/银行卡碎片
  const lineStarts = [0];
  for (let i = 0; i < fixed.length; i++) {
    if (fixed[i] === '\n') lineStarts.push(i + 1);
  }
  function lineOf(pos) {
    let lo = 0; let hi = lineStarts.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (lineStarts[mid] <= pos) lo = mid; else hi = mid - 1;
    }
    const start = lineStarts[lo];
    const endIdx = fixed.indexOf('\n', start);
    return fixed.slice(start, endIdx < 0 ? fixed.length : endIdx);
  }
  /** 纯整数兜底时判定是否为日期/时间/银行卡号等假金额 */
  function isFalsePositiveInteger(raw, pos) {
    const line = lineOf(pos);
    // 时间行：10:31:05 / 09:05
    if (/[:：]/.test(line)) return true;
    // 日期行：2026-09-09 / 2026/9/9
    if (/\d{4}\s*[-/]\s*\d{1,2}/.test(line)) return true;
    // 银行卡尾号："(1189)" 且同行有「卡」
    if (/卡/.test(line) && new RegExp(`\\(\\s*${raw}\\s*\\)`).test(line)) return true;
    return false;
  }

  for (const { regex, normalize, name } of AMOUNT_PATTERNS) {
    const regex_ = new RegExp(regex.source, regex.flags);
    let m;
    while ((m = regex_.exec(fixed)) !== null) {
      const raw = m[1] || m[0];
      // 纯整数兜底：按所在行排除日期/时间/卡号碎片
      if (name === 'plain-int' && isFalsePositiveInteger(String(raw).trim(), m.index)) {
        continue;
      }
      // 支持上下文专用的数字修复（如还款金额被 OCR 拆开的小数）；否则按普通千分位数字解析
      const num = normalize
        ? normalize(raw)
        : parseFloat(String(raw).replace(/,/g, '').trim());
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

/**
 * 判定整数候选 intRaw 是否为小数候选 decimalRaw「丢失小数点」后的噪声：
 * "17.05" 去标点 → "1705" === intRaw（多策略拼接文本中 1705 假金额的典型来源）
 */
export function isDecimalDroppedNoise(decimalRaw, intRaw) {
  if (!decimalRaw || !/\./.test(decimalRaw)) return false;
  const compact = String(decimalRaw).replace(/[.,\s]/g, '');
  return compact === String(intRaw).trim();
}

/**
 * 跨识别策略的金额投票合并（解决多策略文本各自提取时的噪声金额）
 * @param {Array<Array<{value:number, raw:string}>>} perStrategy 每个策略文本抽取出的候选（按策略顺序）
 * @returns {Array<{value:number, raw:string}>}
 *
 * 规则：
 *  1) 同金额值聚类；整数候选若与某小数候选构成「丢小数点」关系，并入小数簇（代表取小数）
 *  2) 簇票数 = 覆盖的策略数；有候选得 2 票以上时，票数>=2 的簇胜出
 *     （独立的一票簇予以保留，避免丢掉同图的其他真实金额；噪声因已并入高票簇被代表替换）
 *  3) 所有簇都只有一票（策略间互不重合）→ 退回第一个策略的候选
 *  4) 单策略输入 → 原样返回
 */
export function mergeAmountsByVote(perStrategy) {
  const groups = perStrategy;
  if (!groups || groups.length === 0) return [];
  if (groups.length === 1) return groups[0] ? [...groups[0]] : [];

  // 簇：{ rep:{value,raw}, votes:Set<strategyIdx>, isDecimal:boolean }
  const clusters = [];

  const findCluster = (cand, strategyIdx) => {
    for (const cl of clusters) {
      if (cl.rep.value === cand.value) return cl;
      // 整数候选 → 已有的小数簇（丢小数点噪声）
      if (!cand.raw.includes('.') && cl.rep.raw.includes('.')
        && isDecimalDroppedNoise(cl.rep.raw, cand.raw)) {
        return cl;
      }
      // 小数候选 → 已有的整数簇：小数更可信，替换代表并升级为小数簇
      if (cand.raw.includes('.') && !cl.rep.raw.includes('.')
        && isDecimalDroppedNoise(cand.raw, cl.rep.raw)) {
        cl.rep = cand;
        return cl;
      }
    }
    return null;
  };

  groups.forEach((cands, sIdx) => {
    for (const cand of (cands || [])) {
      let cl = findCluster(cand, sIdx);
      if (!cl) {
        cl = { rep: cand, votes: new Set() };
        clusters.push(cl);
      }
      cl.votes.add(sIdx);
    }
  });

  const maxVotes = Math.max(...clusters.map((cl) => cl.votes.size));
  if (maxVotes < 2) {
    // 策略间无共识：信任第一个策略的结果
    return groups[0] ? [...groups[0]] : [];
  }
  // 高票簇 + 低票簇全部保留：低票簇若是高票簇的丢小数点噪声，聚类阶段已被并入不会独立存在
  return clusters.map((cl) => cl.rep);
}
