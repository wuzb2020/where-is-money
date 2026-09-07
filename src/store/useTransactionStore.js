// 交易 Store：CRUD + 查询筛选状态
import { create } from 'zustand';
import { TransactionDao } from '../core/db';
import { persistImageToLocal } from '../core/utils/storage';

export const useTransactionStore = create((set, get) => ({
  // 查询状态（全部记录页用）
  filter: {
    keyword: '',
    type: 'all',       // all / income / expense
    categoryId: null,
    sortBy: 'date',
    sortOrder: 'DESC',
  },
  setFilter: (patch) => set((s) => ({ filter: { ...s.filter, ...patch } })),
  resetFilter: () => set({
    filter: { keyword: '', type: 'all', categoryId: null, sortBy: 'date', sortOrder: 'DESC' },
  }),

  // 查询交易列表（DB 直查，不缓存 list 以免内存太大）
  async query(opts) {
    return TransactionDao.query(opts);
  },

  async getById(id) {
    return TransactionDao.getById(id);
  },

  /** 新增一笔（持久化图片） */
  async create(tx) {
    // 持久化图片到本地目录，防止临时目录被清
    const imagePaths = [];
    if (tx.imagePaths && tx.imagePaths.length) {
      const idStub = Math.random().toString(36).slice(2, 10);
      for (let i = 0; i < tx.imagePaths.length; i++) {
        const p = await persistImageToLocal(tx.imagePaths[i], idStub);
        imagePaths.push(p);
      }
    }
    const id = await TransactionDao.create({ ...tx, imagePaths });
    return id;
  },

  async bulkCreate(txs) {
    return TransactionDao.bulkCreate(txs);
  },

  async update(id, patch) {
    const formatted = { ...patch };
    if (formatted.imagePaths) formatted.image_paths_json = formatted.imagePaths;
    return TransactionDao.update(id, formatted);
  },

  async remove(id) {
    return TransactionDao.remove(id);
  },

  async clearAll() {
    return TransactionDao.clearAll();
  },

  async findDuplicates(candidates) {
    return TransactionDao.findDuplicates(candidates);
  },

  async sumByRange(start, end) {
    return TransactionDao.sumByRange(start, end);
  },
  async sumByCategoryAndRange(start, end, type) {
    return TransactionDao.sumByCategoryAndRange(start, end, type);
  },
  async count() {
    return TransactionDao.count();
  },
  async listAllForExport() {
    return TransactionDao.listAllForExport();
  },
}));
