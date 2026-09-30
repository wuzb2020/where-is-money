// 文本 → 类型（收入/支出）判断 + 分类匹配
import { INCOME_KEYWORDS, EXPENSE_KEYWORDS, PLATFORM_CATEGORY_KEYWORDS } from '../constants/keywords';
import { CategoryDao } from '../db';

/**
 * OCR 文本归一化：Tesseract 常在汉字之间插入空格（如"还 款 成 功"），
 * 导致关键词 includes 失配。连续折叠汉字之间的空白。
 */
function normalizeText(text) {
  let out = text;
  let prev;
  do {
    prev = out;
    out = out.replace(/([\u4e00-\u9fa5])\s+(?=[\u4e00-\u9fa5])/g, '$1');
  } while (out !== prev);
  return out;
}

/**
 * 判断收支类型
 * @returns {Promise<'income'|'expense'>} 默认 expense
 */
export async function classifyType(text) {
  if (!text) return 'expense';
  const norm = normalizeText(text);
  let score = 0;
  for (const kw of INCOME_KEYWORDS) {
    if (norm.includes(kw)) score += 1;
  }
  for (const kw of EXPENSE_KEYWORDS) {
    if (norm.includes(kw)) score -= 1;
  }
  // PLATFORM 命中默认算支出（大部分平台都是消费）
  for (const item of PLATFORM_CATEGORY_KEYWORDS) {
    for (const kw of item.platform) {
      if (norm.includes(kw)) { score -= 0.5; break; }
    }
  }
  return score > 0 ? 'income' : 'expense';
}

/**
 * 匹配分类（先从平台关键词精确命中，再从分类 keywords 模糊命中）
 * @returns {Promise<{categoryId:number|null, categoryName: string}>}
 */
export async function matchCategory(text, type = 'expense') {
  if (!text) return { categoryId: null, categoryName: '' };
  const norm = normalizeText(text);

  // Step 1: 平台关键词 → 分类名
  let matchedName = null;
  for (const item of PLATFORM_CATEGORY_KEYWORDS) {
    for (const kw of item.platform) {
      if (norm.includes(kw)) { matchedName = item.category; break; }
    }
    if (matchedName) break;
  }

  // Step 2: 分类库关键词加权匹配
  if (!matchedName) {
    const categories = await CategoryDao.listByType(type);
    let best = null; let bestScore = 0;
    for (const cat of categories) {
      let score = 0;
      // 分类名直接包含
      if (norm.includes(cat.name)) score += 3;
      // 关键词命中
      for (const kw of cat.keywords || []) {
        if (norm.includes(kw)) score += 1;
      }
      if (score > bestScore) { bestScore = score; best = cat; }
    }
    if (best && bestScore >= 1) {
      return { categoryId: best.id, categoryName: best.name };
    }
  }

  // Step 3: matchedName 查库拿 ID
  if (matchedName) {
    const cat = await CategoryDao.getByNameAndType(matchedName, type);
    if (cat) return { categoryId: cat.id, categoryName: cat.name };
  }

  return { categoryId: null, categoryName: matchedName || '' };
}

/** 批量辅助：抽取类型+分类一步到位 */
export async function classifyTypeAndCategory(text) {
  const type = await classifyType(text);
  const cat = await matchCategory(text, type);
  return { type, categoryId: cat.categoryId, categoryName: cat.categoryName };
}
