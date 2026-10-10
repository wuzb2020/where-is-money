import React from 'react';
import { View, Text, Modal, ScrollView, Image, ActivityIndicator } from 'react-native';
import { useAppTheme, makeStyles } from '../themeHelper';
import Card from '../primitives/Card';
import Button from '../primitives/Button';
import Toast from '../primitives/Toast';
import OcrResultEditor from './OcrResultEditor';
import CategoryPickerSheet from './CategoryPickerSheet';
import DatePickerSheet from './DatePickerSheet';
import { recognizeAndParse } from '../../core/services/OcrService';
import { useTransactionStore } from '../../store/useTransactionStore';
import { useCategoryStore } from '../../store/useCategoryStore';
import { dayStart } from '../../core/utils/date';

/**
 * 悬浮球识别弹窗：拿到截图 URI 后自动 OCR，识别结果可编辑，保存即入库。
 * 识别失败也展示一条空记录供用户手填，保证「点击悬浮球必有可编辑表单」。
 *
 * Props:
 *  - visible: boolean
 *  - imageUri: string | null   （悬浮球截图路径）
 *  - onClose: () => void
 */
export default function FloatingBubbleRecognizeModal({ visible, imageUri, onClose }) {
  const { theme, insets } = useAppTheme();
  const styles = useStyles();
  const txStore = useTransactionStore();
  const categories = useCategoryStore((s) => s.categories);

  // image 对象结构对齐 OcrResultEditor 期望
  const [image, setImage] = React.useState(null);
  const [saving, setSaving] = React.useState(false);

  // 分类/日期选择器目标：{ parsedIdx }
  const [pickerTarget, setPickerTarget] = React.useState(null);
  const [pickerType, setPickerType] = React.useState('expense');
  const [dateTarget, setDateTarget] = React.useState(null);

  const categoriesMap = React.useMemo(() => {
    const m = {};
    for (const c of categories) m[c.id] = c;
    return m;
  }, [categories]);

  const defaultEmptyRecord = () => ({
    idStub: Math.random().toString(36).slice(2, 10),
    date: dayStart(),
    type: 'expense',
    categoryId: null,
    categoryName: '',
    amount: 0,
    description: '',
  });

  // 把 recognizeAndParse 的 parsed 归一化为 OcrResultEditor 的 parsed 结构
  const normalizeParsed = (parsed) => {
    const list = Array.isArray(parsed) && parsed.length
      ? parsed.map((p) => ({
          idStub: p.idStub || Math.random().toString(36).slice(2, 10),
          date: p.date || dayStart(),
          type: p.type || 'expense',
          categoryId: p.categoryId || null,
          categoryName: p.categoryName || '',
          amount: p.amount || 0,
          description: p.description || '',
        }))
      : [defaultEmptyRecord()];
    return list;
  };

  // visible + imageUri 变化时触发识别
  React.useEffect(() => {
    if (!visible || !imageUri) return;
    let cancelled = false;
    setImage({ uri: imageUri, status: 'processing', rawText: '', parsed: [], fromCache: false });
    (async () => {
      try {
        const { rawText, parsed, fromCache } = await recognizeAndParse(imageUri);
        if (cancelled) return;
        setImage({
          uri: imageUri,
          status: 'done',
          rawText,
          parsed: normalizeParsed(parsed),
          fromCache,
        });
      } catch (e) {
        if (cancelled) return;
        setImage({
          uri: imageUri,
          status: 'error',
          rawText: '',
          parsed: [defaultEmptyRecord()],
          fromCache: false,
          errorMsg: e?.message || '识别失败',
        });
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, imageUri]);

  // ---- 编辑回调 ----
  const updateParsed = (idx, patch) => {
    setImage((prev) => {
      if (!prev) return prev;
      const parsed = [...prev.parsed];
      parsed[idx] = { ...parsed[idx], ...patch };
      return { ...prev, parsed };
    });
  };

  const removeParsed = (idx) => {
    setImage((prev) => {
      if (!prev) return prev;
      const parsed = prev.parsed.filter((_, i) => i !== idx);
      return { ...prev, parsed: parsed.length ? parsed : [defaultEmptyRecord()] };
    });
  };

  const addParsed = () => {
    setImage((prev) => (prev ? { ...prev, parsed: [...prev.parsed, defaultEmptyRecord()] } : prev));
  };

  const onPickCategory = (idx) => {
    const p = image?.parsed?.[idx];
    setPickerType(p?.type || 'expense');
    setPickerTarget(idx);
  };

  const onPickDate = (idx) => setDateTarget(idx);

  const onRetry = () => {
    if (!imageUri) return;
    setImage({ uri: imageUri, status: 'processing', rawText: '', parsed: [], fromCache: false });
    (async () => {
      try {
        const { rawText, parsed } = await recognizeAndParse(imageUri);
        setImage({ uri: imageUri, status: 'done', rawText, parsed: normalizeParsed(parsed), fromCache: false });
      } catch (e) {
        setImage((prev) => (prev ? { ...prev, status: 'error', errorMsg: e?.message || '识别失败' } : prev));
      }
    })();
  };

  // ---- 保存 ----
  const onSave = async () => {
    const list = image?.parsed || [];
    const valid = list.filter((p) => p.amount > 0);
    if (valid.length === 0) {
      Toast.show({ type: 'error', message: '请至少填写一笔金额大于 0 的记录' });
      return;
    }
    setSaving(true);
    try {
      const txs = valid.map((p) => ({
        date: p.date,
        type: p.type,
        categoryId: p.categoryId,
        amount: p.amount,
        description: p.description,
        source: 'image',
        imagePaths: imageUri ? [imageUri] : [],
      }));
      await txStore.bulkCreate(txs);
      Toast.show({ type: 'success', message: `已保存 ${txs.length} 笔记录` });
      onClose();
    } catch (e) {
      Toast.show({ type: 'error', message: '保存失败：' + e.message });
    } finally {
      setSaving(false);
    }
  };

  const doneCount = image?.parsed?.filter((p) => p.amount > 0).length || 0;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={[styles.header, { backgroundColor: theme.bgCard, borderBottomColor: theme.divider }]}>
          <Text style={[styles.title, { color: theme.text900 }]}>识别当前屏幕账单</Text>
          <Button size="sm" variant="ghost" onPress={onClose}>关闭</Button>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: insets.bottom + 120 }}>
          {imageUri ? (
            <Image source={{ uri: imageUri }} style={styles.preview} resizeMode="contain" />
          ) : null}

          {image?.status === 'processing' && (
            <Card variant="flat" style={{ marginHorizontal: 16, marginTop: 12 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', paddingVertical: 12 }}>
                <ActivityIndicator size="small" color={theme.primary} />
                <Text style={{ color: theme.text700, marginLeft: 10 }}>正在识别屏幕内容…</Text>
              </View>
            </Card>
          )}

          {image && image.status !== 'processing' && (
            <OcrResultEditor
              image={image}
              index={0}
              totalCount={1}
              categoriesMap={categoriesMap}
              onChange={updateParsed}
              onRemove={removeParsed}
              onPickCategory={onPickCategory}
              onPickDate={onPickDate}
              onRetry={onRetry}
            />
          )}

          {image && image.status !== 'processing' && (
            <View style={{ paddingHorizontal: 16, marginTop: 8 }}>
              <Button size="full" variant="outline" onPress={addParsed}>
                <Text style={{ color: theme.primary, fontWeight: '700' }}>＋ 新增一笔</Text>
              </Button>
            </View>
          )}
        </ScrollView>

        <View style={[styles.footer, { backgroundColor: theme.bgCard, borderTopColor: theme.divider, paddingBottom: insets.bottom + 12 }]}>
          <Button
            size="full"
            variant="primary"
            onPress={onSave}
            disabled={saving || !image || image.status === 'processing'}
          >
            {saving ? '保存中…' : `保存 ${doneCount} 笔`}
          </Button>
        </View>
      </View>

      <CategoryPickerSheet
        visible={pickerTarget !== null}
        type={pickerType}
        onClose={() => setPickerTarget(null)}
        onSelect={(cat) => {
          if (pickerTarget !== null) {
            updateParsed(pickerTarget, { categoryId: cat.id, categoryName: cat.name, type: cat.type });
          }
          setPickerTarget(null);
        }}
      />

      <DatePickerSheet
        visible={dateTarget !== null}
        value={dateTarget !== null ? (image?.parsed?.[dateTarget]?.date || dayStart()) : dayStart()}
        onClose={() => setDateTarget(null)}
        onConfirm={(ts) => {
          if (dateTarget !== null) updateParsed(dateTarget, { date: ts });
          setDateTarget(null);
        }}
      />
    </Modal>
  );
}

const useStyles = makeStyles((theme) => ({
  container: { flex: 1, backgroundColor: theme.bgPage },
  header: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
  },
  title: { flex: 1, fontSize: 17, fontWeight: '700' },
  preview: { width: '100%', height: 220, backgroundColor: '#000', marginTop: 12 },
  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 16,
    paddingTop: 12,
    borderTopWidth: 0.5,
  },
}));
