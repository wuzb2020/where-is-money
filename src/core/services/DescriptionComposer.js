// OCR 长文本 → 30字以内的描述摘要（自动去冗余）
import { PLATFORM_CATEGORY_KEYWORDS } from '../constants/keywords';

// 需要移除的冗余词
const NOISE_WORDS = [
  /订单号\s*[:：]?\s*\w+/g,
  /单号\s*[:：]?\s*\w+/g,
  /流水号\s*[:：]?\s*\w+/g,
  /交易号\s*[:：]?\s*\w+/g,
  /商户单号\s*[:：]?\s*\w+/g,
  /付款方|收款方|支付方式|付款时间|创建时间|支付时间|交易时间/g,
  /支付宝|微信支付|中国银联|招商银行|工商银行|建设银行|农业银行/g,
  /扫码支付|付款成功|支付成功|交易成功|订单完成/g,
  /本次订单|本订单|订单详情|消费详情/g,
];

// 从 PLATFORM 反推平台短语
function detectPlatform(text) {
  for (const item of PLATFORM_CATEGORY_KEYWORDS) {
    for (const kw of item.platform) {
      if (text.includes(kw)) return kw;
    }
  }
  return null;
}

/** 提取"商品名"（取中文名词短语，最可能位于金额附近） */
function extractProductNoun(text, amountRawCandidates) {
  // 【修改】旧代码只传 Math.round(amountFen/100)（如 ¥38.50→"39"、¥2,999→"2999"），
  // 在原文里永远 indexOf 不到 → 商品名提取始终失效。改为用金额原文（raw）/元值字符串多重尝试
  const candidates = (Array.isArray(amountRawCandidates) ? amountRawCandidates : [amountRawCandidates])
    .filter(Boolean)
    .map((x) => String(x));
  let idx = -1;
  for (const raw of candidates) {
    idx = text.indexOf(raw);
    if (idx >= 0) break;
  }
  const context = idx >= 0
    ? text.slice(Math.max(0, idx - 50), idx + 20)
    : text.slice(0, 80);
  // 提取中文 + 数字 + 英文字母组合（连续≥2字的名词）
  const matches = context.match(/[\u4e00-\u9fa5A-Za-z0-9+\-]{2,}/g);
  if (!matches) return null;
  // 过滤纯数字/日期和过短的
  const filtered = matches.filter((s) =>
    !/^\d+$/.test(s) &&
    !/^\d{1,2}[-\/月]\d{1,2}/.test(s) &&
    s.length >= 2,
  );
  if (filtered.length === 0) return null;
  // 取最长的那个（通常是商品名）
  filtered.sort((a, b) => b.length - a.length);
  return filtered[0].slice(0, 20);
}

/**
 * 生成精简描述
 * @param amountRaw 金额在原文中的写法（如 "2,999.00" / "￥38.5"），由 AmountExtractor 透传
 */
export async function composeDescription(text, amountFen, categoryName, amountRaw) {
  if (!text) return '';
  let clean = text;
  for (const noise of NOISE_WORDS) clean = clean.replace(noise, '');
  // 去多余空白
  clean = clean.replace(/\s+/g, ' ').trim();

  const platform = detectPlatform(text);
  // 【修改】优先用金额原文定位；兜底用元值（去尾零），提高命中率
  const yuanStr = amountFen ? String(amountFen / 100) : null;
  const product = extractProductNoun(text, [amountRaw, yuanStr]);

  // 拼模板
  const parts = [];
  if (platform) parts.push(platform);
  if (categoryName && categoryName !== '其他' && categoryName !== platform && !parts.includes(categoryName)) {
    parts.push(categoryName);
  }
  if (product && !parts.some((p) => product.includes(p) || p.includes(product))) {
    parts.push(product);
  }
  if (parts.length === 0) {
    // 兜底：取 clean 的前 30 字
    return clean.replace(/[¥￥¥\d.,]/g, '').trim().slice(0, 30);
  }

  let result = parts.join(' ');
  if (result.length > 30) result = result.slice(0, 29) + '…';
  return result;
}
