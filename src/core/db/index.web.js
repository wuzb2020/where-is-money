// Web 平台数据层（Metro 在 web 构建时自动优先加载 .web.js）
// 用 localStorage 模拟 SQLite，接口与 src/core/db/index.js（原生 expo-sqlite）完全一致。
// 注意：Web 仅用于快速预览 UI/交互；正式数据请用手机 App（原生 SQLite 持久化）。

import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from '../constants/categories';
import { categoryColors } from '../constants/theme';

const LS_KEYS = {
  categories: 'qqn_db_categories',
  transactions: 'qqn_db_transactions',
  ocrCache: 'qqn_db_ocr_cache',
  templates: 'qqn_db_templates',
  settings: 'qqn_db_settings',
  seq: 'qqn_db_seq',
};

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}
function nextId() {
  const seq = read(LS_KEYS.seq, { categories: 0, transactions: 0, ocr: 0, tpl: 0 });
  return seq;
}
function bumpId(kind) {
  const seq = nextId();
  seq[kind] = (seq[kind] || 0) + 1;
  write(LS_KEYS.seq, seq);
  return seq[kind];
}

let _ready = false;

export async function getDB() {
  if (_ready) return { web: true };
  // seed 默认分类
  const cats = read(LS_KEYS.categories, []);
  if (cats.length === 0) {
    const now = Date.now();
    const seeded = [];
    DEFAULT_EXPENSE_CATEGORIES.forEach((c, i) => {
      seeded.push({
        id: bumpId('categories'), type: 'expense', name: c.name, icon: c.icon,
        colorIndex: c.colorIndex, sortOrder: i, keywords: c.keywords, isDefault: true,
        createdAt: now, updatedAt: now,
      });
    });
    DEFAULT_INCOME_CATEGORIES.forEach((c, i) => {
      seeded.push({
        id: bumpId('categories'), type: 'income', name: c.name, icon: c.icon,
        colorIndex: c.colorIndex, sortOrder: i, keywords: c.keywords, isDefault: true,
        createdAt: now, updatedAt: now,
      });
    });
    write(LS_KEYS.categories, seeded);
  }
  _ready = true;
  return { web: true };
}

function decorateCategory(c) {
  return {
    ...c,
    color: categoryColors[(c.colorIndex ?? 0) % categoryColors.length],
  };
}
function decorateTx(t) {
  const cats = read(LS_KEYS.categories, []);
  const cat = cats.find((c) => c.id === t.categoryId);
  return {
    ...t,
    categoryName: cat?.name || '未分类',
    categoryIcon: cat?.icon || 'dots-horizontal',
    categoryColor: cat ? categoryColors[(cat.colorIndex ?? 0) % categoryColors.length] : '#94A3B8',
    imagePaths: t.imagePaths || [],
  };
}

// ============================================
// 分类 DAO
// ============================================
export const CategoryDao = {
  async listAll() {
    // 【修改】排序与原生 ORDER BY type DESC（income>expense 收入在前）→ sort_order → id 对齐；
    // 旧比较器恒返回 ±1 不满足反对称性，次级排序是死代码且顺序相反
    return read(LS_KEYS.categories, [])
      .map(decorateCategory)
      .sort((a, b) =>
        a.type === b.type
          ? (a.sortOrder - b.sortOrder) || (a.id - b.id)
          : a.type === 'income' ? -1 : 1);
  },
  async listByType(type) {
    return read(LS_KEYS.categories, [])
      .filter((c) => c.type === type)
      .map(decorateCategory)
      .sort((a, b) => a.sortOrder - b.sortOrder || a.id - b.id);
  },
  async getById(id) {
    const c = read(LS_KEYS.categories, []).find((x) => x.id === id);
    return c ? decorateCategory(c) : null;
  },
  async getByNameAndType(name, type) {
    const c = read(LS_KEYS.categories, []).find((x) => x.name === name && x.type === type);
    return c ? decorateCategory(c) : null;
  },
  async create(cat) {
    const cats = read(LS_KEYS.categories, []);
    const now = Date.now();
    const id = bumpId('categories');
    cats.push({
      id, type: cat.type, name: cat.name, icon: cat.icon || 'dots-horizontal',
      colorIndex: cat.color_index ?? cat.colorIndex ?? 0,
      // 【修改】默认 sortOrder 与原生一致用 999（新建分类排末尾），旧代码用 cats.length
      sortOrder: cat.sort_order ?? cat.sortOrder ?? 999,
      keywords: cat.keywords || [], isDefault: false,
      createdAt: now, updatedAt: now,
    });
    write(LS_KEYS.categories, cats);
    return id;
  },
  async update(id, patch) {
    const cats = read(LS_KEYS.categories, []);
    const idx = cats.findIndex((c) => c.id === id);
    if (idx < 0) return;
    // 【修改】同时兼容 snake_case 与 UI 直传的 keywords 数组/colorIndex/sortOrder
    const map = {
      name: 'name', icon: 'icon',
      color_index: 'colorIndex', colorIndex: 'colorIndex',
      sort_order: 'sortOrder', sortOrder: 'sortOrder',
      keywords_json: 'keywords', keywords: 'keywords',
    };
    for (const [k, target] of Object.entries(map)) {
      if (patch[k] !== undefined) cats[idx][target] = patch[k];
    }
    cats[idx].updatedAt = Date.now();
    write(LS_KEYS.categories, cats);
  },
  async remove(id) {
    const cats = read(LS_KEYS.categories, []).filter((c) => !(c.id === id && !c.isDefault));
    write(LS_KEYS.categories, cats);
  },
};

// ============================================
// 交易 DAO
// ============================================
export const TransactionDao = {
  async create(tx) {
    const list = read(LS_KEYS.transactions, []);
    const now = Date.now();
    const id = bumpId('transactions');
    list.push({
      id, date: tx.date, type: tx.type, categoryId: tx.categoryId,
      amount: tx.amount, description: tx.description || '',
      source: tx.source || 'manual', imagePaths: tx.imagePaths || [],
      fileImportId: tx.fileImportId || null, createdAt: now, updatedAt: now,
    });
    write(LS_KEYS.transactions, list);
    return id;
  },
  async bulkCreate(txs) {
    if (!txs || txs.length === 0) return [];
    const list = read(LS_KEYS.transactions, []);
    const now = Date.now();
    const seq = read(LS_KEYS.seq, {});
    // 【修改】先在内存构造完整批次，最后一次性写入，避免中途异常留下半批数据（对齐原生事务语义）
    const batch = txs.map((tx) => {
      seq.transactions = (seq.transactions || 0) + 1;
      return {
        id: seq.transactions,
        date: tx.date, type: tx.type, categoryId: tx.categoryId,
        amount: tx.amount, description: tx.description || '',
        source: tx.source || 'file', imagePaths: tx.imagePaths || [],
        fileImportId: tx.fileImportId || null, createdAt: now, updatedAt: now,
      };
    });
    write(LS_KEYS.seq, seq);
    write(LS_KEYS.transactions, list.concat(batch));
    return batch.map((b) => b.id);
  },
  async update(id, patch) {
    const list = read(LS_KEYS.transactions, []);
    const idx = list.findIndex((t) => t.id === id);
    if (idx < 0) return;
    // 【修改】同时兼容 image_paths_json 与 imagePaths 两种键
    const map = {
      date: 'date', type: 'type', category_id: 'categoryId', categoryId: 'categoryId',
      amount: 'amount', description: 'description',
      image_paths_json: 'imagePaths', imagePaths: 'imagePaths',
    };
    for (const [k, v] of Object.entries(patch)) {
      if (map[k]) list[idx][map[k]] = v;
    }
    list[idx].updatedAt = Date.now();
    write(LS_KEYS.transactions, list);
  },
  async remove(id) {
    write(LS_KEYS.transactions, read(LS_KEYS.transactions, []).filter((t) => t.id !== id));
  },
  async clearAll() {
    write(LS_KEYS.transactions, []);
  },
  async getById(id) {
    const t = read(LS_KEYS.transactions, []).find((x) => x.id === id);
    return t ? decorateTx(t) : null;
  },
  async query({ start, end, type, categoryId, keyword, sortBy = 'date', sortOrder = 'DESC', limit, offset } = {}) {
    let list = read(LS_KEYS.transactions, []).map(decorateTx);
    if (start != null) list = list.filter((t) => t.date >= start);
    if (end != null) list = list.filter((t) => t.date < end);
    if (type) list = list.filter((t) => t.type === type);
    if (categoryId) list = list.filter((t) => t.categoryId === categoryId);
    if (keyword) {
      const kw = keyword.toLowerCase();
      list = list.filter((t) =>
        (t.description || '').toLowerCase().includes(kw) ||
        (t.categoryName || '').toLowerCase().includes(kw));
    }
    // 【修改】排序字段/方向白名单，与原生 DAO 对齐
    const SORT_COLS = { date: 'date', amount: 'amount', created_at: 'createdAt' };
    const col = SORT_COLS[sortBy] || 'date';
    const dir = String(sortOrder).toUpperCase() === 'ASC' ? 1 : -1;
    list.sort((a, b) => (a[col] > b[col] ? dir : a[col] < b[col] ? -dir : (b.id - a.id) * dir));
    // 【修改】支持 offset 分页（旧代码吞掉 offset，两端分页行为不一致）
    const offsetN = Number(offset);
    const startIdx = Number.isFinite(offsetN) && offsetN > 0 ? Math.floor(offsetN) : 0;
    if (limit != null) {
      const limitN = Number(limit);
      const endIdx = startIdx + (Number.isFinite(limitN) && limitN > 0 ? Math.floor(limitN) : list.length);
      list = list.slice(startIdx, endIdx);
    }
    return list;
  },
  async count(filter = {}) {
    // 【修改】支持与 query 相同的筛选条件，分页 total 口径才正确
    let list = read(LS_KEYS.transactions, []);
    if (filter.start != null) list = list.filter((t) => t.date >= filter.start);
    if (filter.end != null) list = list.filter((t) => t.date < filter.end);
    if (filter.type) list = list.filter((t) => t.type === filter.type);
    if (filter.categoryId) list = list.filter((t) => t.categoryId === filter.categoryId);
    if (filter.keyword) {
      const kw = filter.keyword.toLowerCase();
      list = list.filter((t) => (t.description || '').toLowerCase().includes(kw));
    }
    return list.length;
  },
  async sumByRange(start, end) {
    const list = read(LS_KEYS.transactions, []).filter((t) => t.date >= start && t.date < end);
    let income = 0, expense = 0;
    for (const t of list) {
      if (t.type === 'income') income += Number(t.amount) || 0;
      else expense += Number(t.amount) || 0;
    }
    return { income, expense };
  },
  async sumByCategoryAndRange(start, end, type) {
    const list = read(LS_KEYS.transactions, []).filter(
      (t) => t.date >= start && t.date < end && t.type === type,
    ).map(decorateTx);
    const map = new Map();
    for (const t of list) {
      const key = t.categoryId;
      if (!map.has(key)) {
        map.set(key, {
          categoryId: t.categoryId, categoryName: t.categoryName,
          categoryIcon: t.categoryIcon, color: t.categoryColor, amount: 0,
        });
      }
      map.get(key).amount += Number(t.amount) || 0;
    }
    const rows = Array.from(map.values()).sort((a, b) => b.amount - a.amount);
    const total = rows.reduce((s, r) => s + r.amount, 0);
    return rows.map((r) => ({ ...r, percent: total ? Math.round((r.amount / total) * 100) : 0 }));
  },
  async sumByDateBucket(start, end) {
    const list = read(LS_KEYS.transactions, []).filter((t) => t.date >= start && t.date < end);
    const map = new Map();
    for (const r of list) {
      const d = new Date(r.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!map.has(key)) map.set(key, { date: key, income: 0, expense: 0 });
      const b = map.get(key);
      if (r.type === 'income') b.income += Number(r.amount) || 0;
      else b.expense += Number(r.amount) || 0;
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  },
  async listAllForExport() {
    return read(LS_KEYS.transactions, []).map(decorateTx).sort((a, b) => b.date - a.date);
  },
  async findDuplicates(candidates) {
    const dups = new Set();
    const list = read(LS_KEYS.transactions, []);
    candidates.forEach((c, i) => {
      const dayStart = new Date(c.date); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = dayStart.getTime() + 86400000;
      const hit = list.some((t) =>
        t.date >= dayStart.getTime() && t.date < dayEnd &&
        t.type === c.type && t.categoryId === c.categoryId && t.amount === c.amount);
      if (hit) dups.add(i);
    });
    return dups;
  },
};

// ============================================
// OCR 缓存 DAO
// ============================================
export const OcrCacheDao = {
  async getByHash(hash) {
    const list = read(LS_KEYS.ocrCache, []);
    const row = list.find((x) => x.imageHash === hash);
    if (!row) return null;
    row.hitCount = (row.hitCount || 0) + 1;
    write(LS_KEYS.ocrCache, list);
    return { id: row.id, rawText: row.rawText || '', parsedResult: row.parsedResult || [], hitCount: row.hitCount };
  },
  async put(hash, rawText, parsedResult) {
    const list = read(LS_KEYS.ocrCache, []);
    const idx = list.findIndex((x) => x.imageHash === hash);
    const now = Date.now();
    if (idx >= 0) {
      list[idx] = { ...list[idx], rawText, parsedResult, updatedAt: now };
    } else {
      list.push({ id: bumpId('ocr'), imageHash: hash, rawText, parsedResult, hitCount: 1, createdAt: now, updatedAt: now });
    }
    write(LS_KEYS.ocrCache, list);
  },
};

// ============================================
// 导入模板 DAO
// ============================================
export const ImportTemplateDao = {
  async findBySignature(sig) {
    const list = read(LS_KEYS.templates, []);
    const row = list.find((x) => x.headerSignature === sig);
    if (!row) return null;
    row.useCount = (row.useCount || 0) + 1;
    write(LS_KEYS.templates, list);
    return { id: row.id, fileType: row.fileType, mapping: row.mapping || {}, useCount: row.useCount };
  },
  async save(fileType, sig, mapping) {
    const list = read(LS_KEYS.templates, []);
    const idx = list.findIndex((x) => x.headerSignature === sig);
    const now = Date.now();
    if (idx >= 0) {
      list[idx] = { ...list[idx], mapping, updatedAt: now };
    } else {
      list.push({ id: bumpId('tpl'), fileType, headerSignature: sig, mapping, useCount: 1, createdAt: now, updatedAt: now });
    }
    write(LS_KEYS.templates, list);
  },
};

// ============================================
// 设置 KV DAO
// ============================================
export const SettingsDao = {
  async get(key, defaultValue = null) {
    const all = read(LS_KEYS.settings, {});
    return key in all ? all[key] : defaultValue;
  },
  async set(key, value) {
    const all = read(LS_KEYS.settings, {});
    all[key] = value;
    write(LS_KEYS.settings, all);
  },
};
