// 文本 → 日期抽取（8 种格式兼容）
import { DATE_PATTERNS } from '../constants/dateFormats';
import { dayjs } from '../utils/date';

/**
 * 从文本中抽取日期
 * @param {string} text 原文
 * @param {number} referenceTs 参考时间（今天），默认 now
 * @returns {Promise<number|null>} 时间戳 ms，抽不到返回 null
 */
export async function extractBestDate(text, referenceTs = Date.now()) {
  if (!text) return null;
  const ref = dayjs(referenceTs);
  const year = ref.year();
  const month = ref.month() + 1;
  const day = ref.date();

  const candidates = []; // { ts, matchScore }

  for (const pattern of DATE_PATTERNS) {
    const regex = new RegExp(pattern.regex.source, pattern.regex.flags);
    let m;
    while ((m = regex.exec(text)) !== null) {
      try {
        const parsed = pattern.parse(m, year, month, day);
        if (!parsed) continue;
        // 月份范围检查
        if (parsed.month < 1 || parsed.month > 12) continue;
        if (parsed.day < 1 || parsed.day > 31) continue;
        const d = dayjs(new Date(
          parsed.year, parsed.month - 1, parsed.day,
          parsed.hour || 0, parsed.minute || 0, 0,
        ));
        if (!d.isValid()) continue;
        // 【修改】校验真实日期：new Date(2026, 1, 31) 会进位成 3 月 3 日但 isValid 仍为 true，
        // 必须反查月/日一致，否则 2 月 31 日这类日期会静默偏移
        if (d.year() !== parsed.year || d.month() + 1 !== parsed.month || d.date() !== parsed.day) continue;
        const ts = d.valueOf();
        // 与 referenceTs 的天数差（越小越可能是正确的）
        const dayDiff = Math.abs(d.startOf('day').diff(ref.startOf('day'), 'day'));
        candidates.push({ ts, dayDiff });
      } catch { /* 忽略坏格式 */ }
    }
    if (candidates.length > 0) break;
  }

  if (candidates.length === 0) return null;
  // 选与参考日期天数差最小的（最"近"的日期）
  candidates.sort((a, b) => a.dayDiff - b.dayDiff);
  return candidates[0].ts;
}
