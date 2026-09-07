// 分类 Store：加载全部、缓存列表
import { create } from 'zustand';
import { CategoryDao } from '../core/db';

export const useCategoryStore = create((set, get) => ({
  categories: [],        // 全部分类
  loading: true,
  error: null,
  lastUpdated: 0,

  expenseCategories: () => get().categories.filter((c) => c.type === 'expense'),
  incomeCategories: () => get().categories.filter((c) => c.type === 'income'),

  getById: (id) => get().categories.find((c) => c.id === id),
  getByName: (name, type) => get().categories.find((c) => c.name === name && c.type === type),

  async load(force = false) {
    const now = Date.now();
    if (!force && get().lastUpdated > 0 && now - get().lastUpdated < 60_000) return;
    set({ loading: true, error: null });
    try {
      const list = await CategoryDao.listAll();
      set({ categories: list, lastUpdated: now });
    } catch (e) {
      set({ error: e.message });
    } finally {
      set({ loading: false });
    }
  },

  async create(data) {
    const id = await CategoryDao.create(data);
    await get().load(true);
    return id;
  },
  async update(id, patch) {
    await CategoryDao.update(id, patch);
    await get().load(true);
  },
  async remove(id) {
    await CategoryDao.remove(id);
    await get().load(true);
  },
}));
