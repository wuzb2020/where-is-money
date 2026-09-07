// OCR 识别流 Store：多图队列 + 进度 + 预览列表
import { create } from 'zustand';
import { recognizeAndParse } from '../core/services/OcrService';
import { CategoryDao } from '../core/db';

export const useOcrStore = create((set, get) => ({
  images: [],              // [{uri, status:'pending'|'processing'|'done'|'error', rawText, parsed:[], fromCache}]
  currentIndex: 0,         // 当前正在编辑的图片 index
  totalCount: 0,
  doneCount: 0,
  running: false,

  /** 初始化一批图片（进入识别页时调用） */
  setImages(uris) {
    set({
      images: uris.map((uri) => ({ uri, status: 'pending', rawText: '', parsed: [], fromCache: false })),
      currentIndex: 0,
      totalCount: uris.length,
      doneCount: 0,
      running: false,
    });
  },

  setCurrentIndex(i) { set({ currentIndex: i }); },

  /** 启动批量识别（并发=1 串行，避免低端机 OOM） */
  async startBatch() {
    if (get().running) return;
    set({ running: true });
    const imgs = [...get().images];
    for (let i = 0; i < imgs.length; i++) {
      if (imgs[i].status === 'done' || imgs[i].status === 'processing') continue;
      imgs[i].status = 'processing';
      set({ images: [...imgs] });
      try {
        const { rawText, parsed, fromCache } = await recognizeAndParse(imgs[i].uri);
        // 如果解析结果没有分类 → 兜底用该类型第一个分类
        const patchedParsed = await Promise.all(parsed.map(async (p) => {
          if (p.categoryId) return p;
          const cats = await CategoryDao.listByType(p.type);
          return { ...p, categoryId: cats[0]?.id || 1 };
        }));
        imgs[i] = { ...imgs[i], status: 'done', rawText, parsed: patchedParsed, fromCache: !!fromCache };
      } catch (e) {
        imgs[i] = { ...imgs[i], status: 'error', errorMsg: e.message };
      }
      set({
        images: [...imgs],
        doneCount: imgs.filter((x) => x.status === 'done').length,
      });
    }
    set({ running: false });
  },

  /** 单张重试：把 error/done 的图重置后重新识别（不动其他图） */
  async retryImage(index) {
    const imgs = [...get().images];
    if (!imgs[index]) return;
    imgs[index] = { ...imgs[index], status: 'processing', errorMsg: '' };
    set({ images: [...imgs] });
    try {
      const { rawText, parsed, fromCache } = await recognizeAndParse(imgs[index].uri);
      const patchedParsed = await Promise.all(parsed.map(async (p) => {
        if (p.categoryId) return p;
        const cats = await CategoryDao.listByType(p.type);
        return { ...p, categoryId: cats[0]?.id || 1 };
      }));
      const next = [...get().images];
      next[index] = { ...next[index], status: 'done', rawText, parsed: patchedParsed, fromCache: !!fromCache, errorMsg: '' };
      set({ images: next, doneCount: next.filter((x) => x.status === 'done').length });
    } catch (e) {
      const next = [...get().images];
      next[index] = { ...next[index], status: 'error', errorMsg: e.message };
      set({ images: next, doneCount: next.filter((x) => x.status === 'done').length });
    }
  },

  /** 手动编辑某张图的某条 parsed 记录 */
  updateParsed(imageIdx, parsedIdx, patch) {
    const imgs = [...get().images];
    if (!imgs[imageIdx]) return;
    const parsed = [...imgs[imageIdx].parsed];
    if (!parsed[parsedIdx]) return;
    parsed[parsedIdx] = { ...parsed[parsedIdx], ...patch };
    imgs[imageIdx] = { ...imgs[imageIdx], parsed };
    set({ images: imgs });
  },

  /** 删除某张图的某条 parsed */
  removeParsed(imageIdx, parsedIdx) {
    const imgs = [...get().images];
    if (!imgs[imageIdx]) return;
    const parsed = [...imgs[imageIdx].parsed];
    parsed.splice(parsedIdx, 1);
    imgs[imageIdx] = { ...imgs[imageIdx], parsed };
    set({ images: imgs });
  },

  /** 取出所有 status=done 的 parsed 数组，用于保存 */
  collectAllDone() {
    const all = [];
    for (const img of get().images) {
      if (img.status !== 'done') continue;
      for (const p of img.parsed) {
        if (p.amount > 0) {
          all.push({
            ...p,
            imagePaths: [img.uri, ...(p.imagePaths || []).filter((x) => x !== img.uri)],
          });
        }
      }
    }
    return all;
  },

  reset() {
    set({ images: [], currentIndex: 0, totalCount: 0, doneCount: 0, running: false });
  },
}));
