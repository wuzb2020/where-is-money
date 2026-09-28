/**
 * 记账实体类（Transaction Entry）
 *
 * 一条「收支记录」的领域模型，是 OCR 解析、手动录入、批量导入的统一输出。
 * 金额单位统一为「分」（整数），与 DB transactions.amount 一致。
 *
 * 设计要点：
 * - 字段与 DB transactions 表一一对应（date/type/categoryId/amount/description/source/imagePaths）
 * - 提供 fromParsed / createEmpty / fromRow 等工厂方法，保证新建记录字段完整
 * - validate() 在保存前兜底，避免 NOT NULL / 金额<=0 等约束错误
 * - toDao() 输出纯对象给 TransactionDao.create/bulkCreate
 * - toPlain() 输出可序列化纯对象（zustand state 必须可序列化，不能直接存 class 实例）
 * - patch() 返回新的不可变实例，配合 React/zustand 状态更新
 */

export const TX_TYPE = Object.freeze({
  INCOME: 'income',
  EXPENSE: 'expense',
});

export const TX_SOURCE = Object.freeze({
  MANUAL: 'manual',
  IMAGE: 'image',
  FILE_IMPORT: 'file_import',
});

function safeNumber(v) {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function clampFen(v) {
  const n = Math.round(safeNumber(v));
  if (!Number.isFinite(n) || n < 0) return 0;
  if (n > 1e11) return 0; // 超过 10 亿元视为异常
  return n;
}

export default class TransactionEntry {
  /**
   * @param {Object} data
   * @param {number} [data.id]           DB 主键（新建时无）
   * @param {number} data.date            交易时间戳（ms）
   * @param {'income'|'expense'} data.type
   * @param {number} data.categoryId      分类 ID
   * @param {number} data.amount          金额（分）
   * @param {string} [data.description]   描述摘要
   * @param {string} [data.source]        来源：manual | image | file_import
   * @param {string[]} [data.imagePaths]  关联图片本地路径
   * @param {string} [data.categoryName]  仅展示用，不入 DB
   */
  constructor(data = {}) {
    this.id = data.id != null ? safeNumber(data.id) : null;
    this.date = safeNumber(data.date) || Date.now();
    this.type = data.type === TX_TYPE.INCOME ? TX_TYPE.INCOME : TX_TYPE.EXPENSE;
    this.categoryId = safeNumber(data.categoryId) || 0;
    this.amount = clampFen(data.amount);
    this.description = data.description != null ? String(data.description) : '';
    this.source = data.source || TX_SOURCE.MANUAL;
    this.imagePaths = Array.isArray(data.imagePaths) ? data.imagePaths.filter(Boolean) : [];
    // 展示字段（不入 DB，OCR 结果编辑页用）
    this.categoryName = data.categoryName || '';
  }

  // ---------- 工厂方法 ----------

  /** 从 OCR 解析出的 parsed 对象构造 */
  static fromParsed(parsed = {}) {
    return new TransactionEntry({
      date: parsed.date,
      type: parsed.type,
      categoryId: parsed.categoryId,
      amount: parsed.amount,
      description: parsed.description,
      source: parsed.source || TX_SOURCE.IMAGE,
      imagePaths: parsed.imagePaths,
      categoryName: parsed.categoryName,
    });
  }

  /** 手动新建一条空记录 */
  static createEmpty(type = TX_TYPE.EXPENSE, categoryId = 0) {
    return new TransactionEntry({
      date: Date.now(),
      type,
      categoryId,
      amount: 0,
      description: '',
      source: TX_SOURCE.MANUAL,
      imagePaths: [],
    });
  }

  /** 从 DB 读出的行构造（兼容 snake_case 与 camelCase） */
  static fromRow(row = {}) {
    return new TransactionEntry({
      id: row.id,
      date: row.date,
      type: row.type,
      categoryId: row.category_id ?? row.categoryId,
      amount: row.amount,
      description: row.description,
      source: row.source,
      imagePaths: row.image_paths_json
        ? (Array.isArray(row.image_paths_json) ? row.image_paths_json : JSON.parse(row.image_paths_json))
        : (row.imagePaths || []),
    });
  }

  // ---------- 派生属性 ----------

  /** 金额（元），用于展示 */
  get amountYuan() {
    return this.amount / 100;
  }

  get isIncome() { return this.type === TX_TYPE.INCOME; }
  get isExpense() { return this.type === TX_TYPE.EXPENSE; }

  // ---------- 校验 ----------

  /**
   * 校验是否可入库
   * @returns {{valid:boolean, errors:string[]}}
   */
  validate() {
    const errors = [];
    if (!this.date || this.date <= 0) errors.push('date 无效');
    if (this.amount <= 0) errors.push('amount 必须大于 0');
    if (!this.categoryId) errors.push('categoryId 不能为空');
    if (this.type !== TX_TYPE.INCOME && this.type !== TX_TYPE.EXPENSE) {
      errors.push('type 必须为 income 或 expense');
    }
    return { valid: errors.length === 0, errors };
  }

  // ---------- 转换 ----------

  /** 转成 TransactionDao.create / bulkCreate 期望的纯对象（去掉展示字段与 id） */
  toDao() {
    return {
      date: this.date,
      type: this.type,
      categoryId: this.categoryId,
      amount: this.amount,
      description: this.description,
      source: this.source,
      imagePaths: [...this.imagePaths],
    };
  }

  /** 转成可序列化纯对象（zustand state 必须可序列化，不能存 class 实例） */
  toPlain() {
    return {
      id: this.id,
      date: this.date,
      type: this.type,
      categoryId: this.categoryId,
      amount: this.amount,
      description: this.description,
      source: this.source,
      imagePaths: [...this.imagePaths],
      categoryName: this.categoryName,
    };
  }

  // ---------- 不可变更新 ----------

  /** 合并 patch 并返回新实例（不修改原实例） */
  patch(patch = {}) {
    return new TransactionEntry({ ...this.toPlain(), ...patch });
  }

  /** 深拷贝 */
  clone() {
    return new TransactionEntry(this.toPlain());
  }
}
