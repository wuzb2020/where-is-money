// 文件导入 Store：4 步流程（选文件→解析→预览勾选→结果）
import { create } from 'zustand';
import { Alert } from 'react-native'; // 【修改】重解析失败提示用 RN Alert（Hermes 无全局 alert，裸 alert 会 ReferenceError）
import { parseExcel, reparseWithMapping as reparseExcel, saveImportTemplate } from '../core/services/ExcelParser';
import { parseWord } from '../core/services/WordParser';
import { TransactionDao, CategoryDao } from '../core/db';
import { useTransactionStore } from './useTransactionStore';

export const useImportStore = create((set, get) => ({
  step: 'idle',            // idle | parsing | preview | importing | done
  fileInfo: null,          // { uri, name, size, type: 'excel'|'word' }
  totalRows: 0,            // 原始行数
  previewRows: [],         // 解析后的候选行
  selected: new Set(),     // 勾选的 index
  duplicates: new Set(),   // 可能重复的 index
  mapping: {},             // 当前列映射（Excel 用）
  headerSignature: '',
  header: [],              // 表头（预览列调整用）
  result: null,            // { ok, inserted, failed, failedReasons, skipDedup }

  setFile(fileInfo) {
    set({ fileInfo, step: 'parsing', result: null });
  },

  /** 启动解析 */
  async startParsing() {
    const { fileInfo } = get();
    if (!fileInfo) return;
    set({ step: 'parsing' });
    try {
      let parsed;
      if (fileInfo.type === 'excel') {
        parsed = await parseExcel(fileInfo.uri);
      } else {
        parsed = await parseWord(fileInfo.uri);
      }
      // 兜底分类（没 categoryId 的补上）
      const patchedRows = await Promise.all(parsed.previewRows.map(async (r) => {
        if (r.categoryId) return r;
        const cats = await CategoryDao.listByType(r.type);
        return { ...r, categoryId: cats[0]?.id || 1 };
      }));
      // 检测重复
      const dups = await TransactionDao.findDuplicates(patchedRows);
      set({
        step: 'preview',
        totalRows: parsed.totalRows || patchedRows.length,
        previewRows: patchedRows,
        selected: new Set(patchedRows.map((_, i) => i)), // 默认全选
        duplicates: dups,
        mapping: parsed.detectedMapping || {},
        headerSignature: parsed.headerSignature || '',
        header: parsed.header || [],
      });
    } catch (e) {
      set({
        step: 'done',
        result: { ok: false, inserted: 0, failed: 0, error: e.message },
      });
    }
  },

  /** 勾选切换 */
  toggleSelect(index) {
    const s = new Set(get().selected);
    if (s.has(index)) s.delete(index); else s.add(index);
    set({ selected: s });
  },
  selectAll() {
    set({ selected: new Set(get().previewRows.map((_, i) => i)) });
  },
  selectNone() { set({ selected: new Set() }); },
  /** 只选「非重复」的 */
  selectNonDuplicates() {
    const dups = get().duplicates;
    set({ selected: new Set(get().previewRows.map((_, i) => i).filter((i) => !dups.has(i))) });
  },

  /** 手动调整某行 */
  updateRow(index, patch) {
    const rows = [...get().previewRows];
    rows[index] = { ...rows[index], ...patch };
    set({ previewRows: rows });
  },

  /** Excel 手动调整列映射后重解析 */
  async reparseWithMapping(mapping) {
    const { fileInfo } = get();
    if (!fileInfo || fileInfo.type !== 'excel') return;
    set({ step: 'parsing' });
    try {
      const result = await reparseExcel(fileInfo.uri, mapping);
      const patched = await Promise.all(result.previewRows.map(async (r) => {
        if (r.categoryId) return r;
        const cats = await CategoryDao.listByType(r.type);
        return { ...r, categoryId: cats[0]?.id || 1 };
      }));
      set({
        step: 'preview',
        previewRows: patched,
        selected: new Set(patched.map((_, i) => i)),
        mapping,
        header: result.header,
      });
    } catch (e) {
      // 【修改】用 RN Alert 替代裸 alert()
      Alert.alert('重新解析失败', e.message || String(e));
      set({ step: 'preview' });
    }
  },

  /** 确认导入 */
  async doImport({ saveTemplate = false, skipDedup = false } = {}) {
    const { previewRows, selected, duplicates, fileInfo, mapping, headerSignature } = get();
    set({ step: 'importing' });
    const toInsert = [];
    const failed = [];
    // 【修改 P1】疑似重复的行单独计数为"跳过"，旧代码把它们塞进 failed，
    // 导致结果页把"跳过的重复"显示成"导入失败"，且 skippedDuplicates 恒为 0
    let dupSkipped = 0;
    for (const idx of selected) {
      const row = previewRows[idx];
      if (!row || row.amount <= 0 || !row.categoryId) {
        failed.push({ index: idx, reason: '金额或分类缺失' }); continue;
      }
      if (!skipDedup && duplicates.has(idx)) {
        dupSkipped++;
        continue;
      }
      toInsert.push({ ...row, fileImportId: fileInfo?.name || '' });
    }
    try {
      const txStore = useTransactionStore.getState();
      const insertedIds = await txStore.bulkCreate(toInsert);
      // 保存模板（用户确认了 mapping 就存下来）
      if (saveTemplate && headerSignature) {
        await saveImportTemplate(fileInfo?.type || 'excel', headerSignature, mapping);
      }
      set({
        step: 'done',
        result: {
          ok: true, inserted: insertedIds.length, insertedIds,
          failed: failed.length,
          failedReasons: failed.slice(0, 50), // 最多保留 50 条
          selectedCount: selected.size,
          skippedDuplicates: dupSkipped,
        },
      });
    } catch (e) {
      set({
        step: 'done',
        result: { ok: false, inserted: 0, failed: toInsert.length, error: e.message },
      });
    }
  },

  reset() {
    set({
      step: 'idle', fileInfo: null, totalRows: 0, previewRows: [],
      selected: new Set(), duplicates: new Set(), mapping: {},
      headerSignature: '', header: [], result: null,
    });
  },
}));
