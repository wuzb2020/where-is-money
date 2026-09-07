// SQLite 数据库封装 + 建表 + 所有 DAO 方法
// expo-sqlite 14.x 异步 API：openDatabaseAsync / execAsync / runAsync / getAllAsync / getFirstAsync

import * as SQLite from 'expo-sqlite';
import { DEFAULT_EXPENSE_CATEGORIES, DEFAULT_INCOME_CATEGORIES } from '../constants/categories';
import { categoryColors } from '../constants/theme';

const DB_NAME = 'qianqunale_accounting.db';

// 【修改】删除旧版 WebSQL 回调风格的 executeSql 死代码（async 连接对象上没有 db.transaction 方法）

// 全局单例：缓存初始化 Promise，避免并发调用重复 open / 拿到未建表的坏句柄
let _dbPromise = null;

export function getDB() {
  if (!_dbPromise) {
    _dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync(DB_NAME);
      await initSchema(db);
      await seedDefaults(db);
      return db;
    })();
    // 初始化失败时允许下次重试
    _dbPromise.catch(() => { _dbPromise = null; });
  }
  return _dbPromise;
}

/** 建表 */
async function initSchema(db) {
  const statements = [
    `CREATE TABLE IF NOT EXISTS categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL CHECK(type IN ('income','expense')),
      name TEXT NOT NULL,
      icon TEXT NOT NULL DEFAULT 'dots-horizontal',
      color_index INTEGER DEFAULT 0,
      sort_order INTEGER DEFAULT 0,
      keywords_json TEXT DEFAULT '[]',
      is_default INTEGER DEFAULT 0,
      created_at INTEGER,
      updated_at INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS transactions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      date INTEGER NOT NULL,
      type TEXT NOT NULL CHECK(type IN ('income','expense')),
      category_id INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      description TEXT DEFAULT '',
      source TEXT NOT NULL CHECK(source IN ('manual','image','file')),
      image_paths_json TEXT DEFAULT '[]',
      file_import_id TEXT DEFAULT NULL,
      created_at INTEGER,
      updated_at INTEGER,
      FOREIGN KEY (category_id) REFERENCES categories(id)
    )`,
    `CREATE INDEX IF NOT EXISTS idx_tx_date ON transactions(date)`,
    `CREATE INDEX IF NOT EXISTS idx_tx_type ON transactions(type)`,
    `CREATE INDEX IF NOT EXISTS idx_tx_cat ON transactions(category_id)`,
    `CREATE TABLE IF NOT EXISTS ocr_cache (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      image_hash TEXT UNIQUE NOT NULL,
      raw_text TEXT DEFAULT '',
      parsed_result_json TEXT DEFAULT '[]',
      hit_count INTEGER DEFAULT 0,
      created_at INTEGER,
      updated_at INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS import_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_type TEXT NOT NULL,
      header_signature TEXT UNIQUE NOT NULL,
      mapping_json TEXT NOT NULL,
      use_count INTEGER DEFAULT 0,
      created_at INTEGER,
      updated_at INTEGER
    )`,
    `CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value_json TEXT
    )`,
  ];
  for (const sql of statements) {
    await db.execAsync(sql);
  }
}

/** 首启动写入默认分类 + Mock 数据 */
async function seedDefaults(db) {
  const now = Date.now();
  // 【修改 P0】getFirstAsync 直接返回行对象 {count: N}（或 null），
  // 旧代码按 WebSQL 形态解构 {rows:[{count}]} 必抛 TypeError，导致原生端首启动崩溃
  const row = await db.getFirstAsync(`SELECT COUNT(*) as count FROM categories`);
  if ((row?.count ?? 0) === 0) {
    // 写入支出分类
    for (let i = 0; i < DEFAULT_EXPENSE_CATEGORIES.length; i++) {
      const c = DEFAULT_EXPENSE_CATEGORIES[i];
      await db.runAsync(
        `INSERT INTO categories(type,name,icon,color_index,sort_order,keywords_json,is_default,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?)`,
        ['expense', c.name, c.icon, c.colorIndex, i, JSON.stringify(c.keywords), 1, now, now],
      );
    }
    // 写入收入分类
    for (let i = 0; i < DEFAULT_INCOME_CATEGORIES.length; i++) {
      const c = DEFAULT_INCOME_CATEGORIES[i];
      await db.runAsync(
        `INSERT INTO categories(type,name,icon,color_index,sort_order,keywords_json,is_default,created_at,updated_at)
         VALUES(?,?,?,?,?,?,?,?,?)`,
        ['income', c.name, c.icon, c.colorIndex, i, JSON.stringify(c.keywords), 1, now, now],
      );
    }
  }
}

// ============================================
// 分类 DAO
// ============================================

export const CategoryDao = {
  async listAll() {
    const db = await getDB();
    const rows = await db.getAllAsync(
      `SELECT * FROM categories ORDER BY type DESC, sort_order ASC, id ASC`,
    );
    return rows.map(normalizeCategory);
  },

  async listByType(type) {
    const db = await getDB();
    const rows = await db.getAllAsync(
      `SELECT * FROM categories WHERE type=? ORDER BY sort_order ASC, id ASC`,
      [type],
    );
    return rows.map(normalizeCategory);
  },

  async getById(id) {
    const db = await getDB();
    const row = await db.getFirstAsync(`SELECT * FROM categories WHERE id=?`, [id]);
    return row ? normalizeCategory(row) : null;
  },

  async getByNameAndType(name, type) {
    const db = await getDB();
    const row = await db.getFirstAsync(
      `SELECT * FROM categories WHERE name=? AND type=? LIMIT 1`, [name, type],
    );
    return row ? normalizeCategory(row) : null;
  },

  async create(cat) {
    const db = await getDB();
    const now = Date.now();
    const result = await db.runAsync(
      `INSERT INTO categories(type,name,icon,color_index,sort_order,keywords_json,is_default,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?)`,
      [cat.type, cat.name, cat.icon || 'dots-horizontal', cat.color_index || 0,
        cat.sort_order || 999, JSON.stringify(cat.keywords || []), 0, now, now],
    );
    return result.lastInsertRowId;
  },

  async update(id, patch) {
    const db = await getDB();
    // 【修改】白名单同时兼容 snake_case（keywords_json）与 UI 直接传的数组（keywords）
    const colMap = {
      name: 'name', icon: 'icon',
      color_index: 'color_index', colorIndex: 'color_index',
      sort_order: 'sort_order', sortOrder: 'sort_order',
      keywords_json: 'keywords_json', keywords: 'keywords_json',
    };
    const sets = []; const params = [];
    for (const [k, col] of Object.entries(colMap)) {
      if (patch[k] !== undefined && !sets.includes(`${col}=?`)) {
        sets.push(`${col}=?`);
        params.push(col === 'keywords_json' ? JSON.stringify(patch[k]) : patch[k]);
      }
    }
    if (sets.length === 0) return;
    sets.push(`updated_at=?`); params.push(Date.now());
    params.push(id);
    await db.runAsync(`UPDATE categories SET ${sets.join(',')} WHERE id=?`, params);
  },

  async remove(id) {
    const db = await getDB();
    await db.runAsync(`DELETE FROM categories WHERE id=? AND is_default=0`, [id]);
  },
};

function normalizeCategory(row) {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    icon: row.icon,
    colorIndex: row.color_index ?? 0,
    color: categoryColors[(row.color_index ?? 0) % categoryColors.length],
    sortOrder: row.sort_order ?? 0,
    keywords: safeParse(row.keywords_json, []),
    isDefault: !!row.is_default,
  };
}

// ============================================
// 交易 DAO
// ============================================

export const TransactionDao = {
  async create(tx) {
    const db = await getDB();
    const now = Date.now();
    const result = await db.runAsync(
      `INSERT INTO transactions(date,type,category_id,amount,description,source,image_paths_json,file_import_id,created_at,updated_at)
       VALUES(?,?,?,?,?,?,?,?,?,?)`,
      [
        tx.date, tx.type, tx.categoryId, tx.amount,
        tx.description || '', tx.source || 'manual',
        JSON.stringify(tx.imagePaths || []),
        tx.fileImportId || null,
        now, now,
      ],
    );
    return result.lastInsertRowId;
  },

  /** 批量插入（文件导入用，事务性）；返回插入记录的 id 数组（用于撤销） */
  async bulkCreate(txs) {
    const db = await getDB();
    if (!txs || txs.length === 0) return [];
    const now = Date.now();
    const ids = [];
    await db.withTransactionAsync(async () => {
      for (const tx of txs) {
        const result = await db.runAsync(
          `INSERT INTO transactions(date,type,category_id,amount,description,source,image_paths_json,file_import_id,created_at,updated_at)
           VALUES(?,?,?,?,?,?,?,?,?,?)`,
          [
            tx.date, tx.type, tx.categoryId, tx.amount,
            tx.description || '', tx.source || 'file',
            JSON.stringify(tx.imagePaths || []),
            tx.fileImportId || null,
            now, now,
          ],
        );
        ids.push(result.lastInsertRowId);
      }
    });
    return ids;
  },

  async update(id, patch) {
    const db = await getDB();
    const allowed = ['date', 'type', 'category_id', 'amount', 'description', 'image_paths_json'];
    const sets = []; const params = [];
    for (const k of allowed) {
      if (patch[k] !== undefined) {
        sets.push(`${k}=?`);
        params.push(k === 'image_paths_json' ? JSON.stringify(patch[k]) : patch[k]);
      }
    }
    if (sets.length === 0) return;
    sets.push(`updated_at=?`); params.push(Date.now());
    params.push(id);
    await db.runAsync(`UPDATE transactions SET ${sets.join(',')} WHERE id=?`, params);
  },

  async remove(id) {
    const db = await getDB();
    await db.runAsync(`DELETE FROM transactions WHERE id=?`, [id]);
  },

  async clearAll() {
    const db = await getDB();
    await db.runAsync(`DELETE FROM transactions`);
  },

  async getById(id) {
    const db = await getDB();
    const row = await db.getFirstAsync(
      `SELECT t.*, c.name as category_name, c.icon as category_icon, c.color_index as category_color_index
       FROM transactions t LEFT JOIN categories c ON t.category_id=c.id WHERE t.id=?`, [id],
    );
    return row ? normalizeTx(row) : null;
  },

  /** 范围查询 + 可选筛选 */
  async query({ start, end, type, categoryId, keyword, sortBy = 'date', sortOrder = 'DESC', limit, offset } = {}) {
    const db = await getDB();
    const where = []; const params = [];
    if (start != null) { where.push(`t.date >= ?`); params.push(start); }
    if (end != null)   { where.push(`t.date < ?`);  params.push(end); }
    if (type)          { where.push(`t.type = ?`);  params.push(type); }
    if (categoryId)    { where.push(`t.category_id = ?`); params.push(categoryId); }
    if (keyword) {
      where.push(`(t.description LIKE ? OR c.name LIKE ?)`);
      params.push(`%${keyword}%`, `%${keyword}%`);
    }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    // 【修改】排序字段/方向白名单 + limit/offset 数值化，杜绝 SQL 注入与非法标识符
    const SORT_COLS = { date: 't.date', amount: 't.amount', created_at: 't.created_at' };
    const orderCol = SORT_COLS[sortBy] || 't.date';
    const orderDir = String(sortOrder).toUpperCase() === 'ASC' ? 'ASC' : 'DESC';
    const orderSql = `ORDER BY ${orderCol} ${orderDir}, t.id DESC`;
    const limitN = Number(limit);
    const offsetN = Number(offset);
    let limitSql = '';
    if (Number.isFinite(limitN) && limitN > 0) {
      limitSql = `LIMIT ${Math.floor(limitN)}`;
      if (Number.isFinite(offsetN) && offsetN > 0) limitSql += ` OFFSET ${Math.floor(offsetN)}`;
    }
    const sql = `
      SELECT t.*, c.name as category_name, c.icon as category_icon, c.color_index as category_color_index
      FROM transactions t LEFT JOIN categories c ON t.category_id=c.id
      ${whereSql} ${orderSql} ${limitSql}
    `;
    const rows = await db.getAllAsync(sql, params);
    return rows.map(normalizeTx);
  },

  /** 计数（可带与 query 相同的筛选条件，分页用） */
  async count(filter = {}) {
    const db = await getDB();
    const where = []; const params = [];
    if (filter.start != null) { where.push(`date >= ?`); params.push(filter.start); }
    if (filter.end != null)   { where.push(`date < ?`);  params.push(filter.end); }
    if (filter.type)          { where.push(`type = ?`);  params.push(filter.type); }
    if (filter.categoryId)    { where.push(`category_id = ?`); params.push(filter.categoryId); }
    if (filter.keyword)       { where.push(`description LIKE ?`); params.push(`%${filter.keyword}%`); }
    const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';
    const row = await db.getFirstAsync(`SELECT COUNT(*) as c FROM transactions ${whereSql}`, params);
    return row?.c || 0;
  },

  /** 范围查询的收支合计 */
  async sumByRange(start, end) {
    const db = await getDB();
    const rows = await db.getAllAsync(
      `SELECT type, SUM(amount) as total FROM transactions
       WHERE date >= ? AND date < ? GROUP BY type`, [start, end],
    );
    let income = 0, expense = 0;
    for (const r of rows) {
      if (r.type === 'income') income = Number(r.total) || 0;
      if (r.type === 'expense') expense = Number(r.total) || 0;
    }
    return { income, expense };
  },

  /** 范围查询 + 按分类聚合（饼图用） */
  async sumByCategoryAndRange(start, end, type) {
    const db = await getDB();
    const rows = await db.getAllAsync(
      `SELECT c.id as category_id, c.name as category_name, c.icon as category_icon,
              c.color_index as category_color_index, SUM(t.amount) as total
       FROM transactions t LEFT JOIN categories c ON t.category_id=c.id
       WHERE t.date >= ? AND t.date < ? AND t.type=?
       GROUP BY t.category_id ORDER BY total DESC`,
      [start, end, type],
    );
    const total = rows.reduce((s, r) => s + (Number(r.total) || 0), 0);
    return rows.map((r) => ({
      categoryId: r.category_id,
      categoryName: r.category_name || '未分类',
      categoryIcon: r.category_icon || 'dots-horizontal',
      // 【修改】分类已删除时用灰色
      color: r.category_color_index == null
        ? '#94A3B8'
        : categoryColors[r.category_color_index % categoryColors.length],
      amount: Number(r.total) || 0,
      percent: total ? Math.round((Number(r.total) / total) * 100) : 0,
    }));
  },

  /** 按日桶聚合（趋势折线图用） */
  async sumByDateBucket(start, end) {
    const db = await getDB();
    const rows = await db.getAllAsync(
      `SELECT date, type, amount FROM transactions WHERE date >= ? AND date < ?`,
      [start, end],
    );
    const map = new Map(); // YYYY-MM-DD => { date, income, expense }
    for (const r of rows) {
      const d = new Date(r.date);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      if (!map.has(key)) map.set(key, { date: key, income: 0, expense: 0 });
      const bucket = map.get(key);
      if (r.type === 'income') bucket.income += Number(r.amount);
      else bucket.expense += Number(r.amount);
    }
    return Array.from(map.values()).sort((a, b) => a.date.localeCompare(b.date));
  },

  /** 列出所有记录（导出用） */
  async listAllForExport() {
    const db = await getDB();
    const rows = await db.getAllAsync(
      `SELECT t.*, c.name as category_name FROM transactions t
       LEFT JOIN categories c ON t.category_id=c.id ORDER BY t.date DESC`,
    );
    return rows.map(normalizeTx);
  },

  /**
   * 重复检测（文件导入前用）：
   * 相同日期（同一天）+ 金额 + 分类 + 类型 → 视为可能重复
   */
  async findDuplicates(candidates) {
    const db = await getDB();
    const dups = new Set();
    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      const dayStart = new Date(c.date); dayStart.setHours(0,0,0,0);
      const dayEnd = dayStart.getTime() + 86400000;
      const row = await db.getFirstAsync(
        `SELECT id FROM transactions WHERE date>=? AND date<? AND type=? AND category_id=? AND amount=? LIMIT 1`,
        [dayStart.getTime(), dayEnd, c.type, c.categoryId, c.amount],
      );
      if (row) dups.add(i);
    }
    return dups;
  },
};

function normalizeTx(row) {
  // 【修改】分类被删除时（LEFT JOIN 为空，color_index 为 null）统一用灰色，与 web 端一致
  const color = row.category_color_index == null
    ? '#94A3B8'
    : categoryColors[row.category_color_index % categoryColors.length];
  return {
    id: row.id,
    date: row.date,
    type: row.type,
    categoryId: row.category_id,
    categoryName: row.category_name || '未分类',
    categoryIcon: row.category_icon || 'dots-horizontal',
    categoryColor: color,
    amount: Number(row.amount) || 0,
    description: row.description || '',
    source: row.source || 'manual',
    imagePaths: safeParse(row.image_paths_json, []),
    fileImportId: row.file_import_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// ============================================
// OCR 缓存 DAO
// ============================================

export const OcrCacheDao = {
  async getByHash(hash) {
    const db = await getDB();
    const row = await db.getFirstAsync(`SELECT * FROM ocr_cache WHERE image_hash=?`, [hash]);
    if (!row) return null;
    await db.runAsync(`UPDATE ocr_cache SET hit_count=hit_count+1, updated_at=? WHERE id=?`,
      [Date.now(), row.id]);
    return {
      id: row.id,
      rawText: row.raw_text || '',
      parsedResult: safeParse(row.parsed_result_json, []),
      hitCount: row.hit_count + 1,
    };
  },

  async put(hash, rawText, parsedResult) {
    const db = await getDB();
    const now = Date.now();
    await db.runAsync(
      `INSERT INTO ocr_cache(image_hash,raw_text,parsed_result_json,hit_count,created_at,updated_at)
       VALUES(?,?,?,?,?,?)
       ON CONFLICT(image_hash) DO UPDATE SET
         raw_text=excluded.raw_text,
         parsed_result_json=excluded.parsed_result_json,
         updated_at=excluded.updated_at`,
      [hash, rawText, JSON.stringify(parsedResult), 1, now, now],
    );
  },
};

// ============================================
// 导入模板 DAO
// ============================================

export const ImportTemplateDao = {
  async findBySignature(headerSignature) {
    const db = await getDB();
    const row = await db.getFirstAsync(
      `SELECT * FROM import_templates WHERE header_signature=?`, [headerSignature],
    );
    if (!row) return null;
    await db.runAsync(`UPDATE import_templates SET use_count=use_count+1, updated_at=? WHERE id=?`,
      [Date.now(), row.id]);
    return {
      id: row.id,
      fileType: row.file_type,
      mapping: safeParse(row.mapping_json, {}),
      useCount: row.use_count + 1,
    };
  },

  async save(fileType, headerSignature, mapping) {
    const db = await getDB();
    const now = Date.now();
    await db.runAsync(
      `INSERT INTO import_templates(file_type,header_signature,mapping_json,use_count,created_at,updated_at)
       VALUES(?,?,?,?,?,?)
       ON CONFLICT(header_signature) DO UPDATE SET
         mapping_json=excluded.mapping_json,
         updated_at=excluded.updated_at`,
      [fileType, headerSignature, JSON.stringify(mapping), 1, now, now],
    );
  },
};

// ============================================
// 设置 KV DAO
// ============================================

export const SettingsDao = {
  async get(key, defaultValue = null) {
    const db = await getDB();
    const row = await db.getFirstAsync(`SELECT value_json FROM settings WHERE key=?`, [key]);
    if (!row) return defaultValue;
    return safeParse(row.value_json, defaultValue);
  },
  async set(key, value) {
    const db = await getDB();
    await db.runAsync(
      `INSERT INTO settings(key,value_json) VALUES(?,?)
       ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json`,
      [key, JSON.stringify(value)],
    );
  },
};

// ============================================
// Helpers
// ============================================
function safeParse(str, fallback) {
  if (!str) return fallback;
  try { return JSON.parse(str); } catch { return fallback; }
}
