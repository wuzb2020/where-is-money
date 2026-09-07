import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal, Alert,
  Dimensions, FlatList, Image, ActivityIndicator, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme, makeStyles, cx } from '../ui/themeHelper';
import Button from '../ui/primitives/Button';
import Chip from '../ui/primitives/Chip';
import Input from '../ui/primitives/Input'; // 【修改】日期编辑弹窗用
import OcrResultEditor from '../ui/components/OcrResultEditor';
import CategoryPickerSheet from '../ui/components/CategoryPickerSheet';
import DatePickerSheet from '../ui/components/DatePickerSheet';
import ProgressBar from '../ui/primitives/ProgressBar';
import Switch from '../ui/primitives/Switch';
import EmptyState from '../ui/primitives/EmptyState';
import Toast from '../ui/primitives/Toast';
import { useOcrStore } from '../store/useOcrStore';
import { useTransactionStore } from '../store/useTransactionStore';
import { useThemeStore } from '../store/useThemeStore';
import { useCategoryStore } from '../store/useCategoryStore';
import * as Haptic from '../core/utils/haptics';
import { dayjs } from '../core/utils/date'; // 【修改】日期解析用

/**
 * 图片识别流程页
 * - 顶部：图片轮播缩略图（可切换当前编辑）
 * - 中间：每张图的 N 条 parsed 可编辑卡
 * - 底部：进度 + 快速识别开关 + 保存全部按钮
 */
export default function OcrCaptureScreen({ navigation }) {
  const { theme, insets, width } = useAppTheme();
  const styles = useStyles();
  const ocrStore = useOcrStore();
  const txStore = useTransactionStore();
  const useCategory = useThemeStore((s) => s.useCategory);
  const quickOcr = useThemeStore((s) => s.quickOcr);
  const setQuickOcr = useThemeStore((s) => s.setQuickOcr);
  const categories = useCategoryStore((s) => s.categories);
  const loadCats = useCategoryStore((s) => s.load);

  const { images, currentIndex, totalCount, doneCount, running } = ocrStore;

  const categoriesMap = React.useMemo(() => {
    const m = {};
    for (const c of categories) m[c.id] = c;
    return m;
  }, [categories]);

  // 分类选择器：点击某个 parsed 的分类时弹
  const [pickerVisible, setPickerVisible] = React.useState(false);
  const [pickerTarget, setPickerTarget] = React.useState(null); // {imgIdx, parsedIdx, type}
  const [pickerType, setPickerType] = React.useState('expense');

  const [saving, setSaving] = React.useState(false);
  // 【修改 P1】自动保存重入守卫：effect 依赖多次变化时防止重复 bulkCreate 产生重复账单
  const autoSavingRef = React.useRef(false);

  // 进入页面自动启动识别
  React.useEffect(() => {
    loadCats(false);
    const t = setTimeout(() => ocrStore.startBatch(), 300);
    return () => clearTimeout(t);
  }, []);

  // 快速模式：全部识别完成后自动保存
  React.useEffect(() => {
    if (!quickOcr) return;
    if (running) return;
    if (totalCount === 0 || doneCount !== totalCount) return;
    const all = ocrStore.collectAllDone();
    if (all.length === 0) return;
    if (autoSavingRef.current) return;
    autoSavingRef.current = true;
    // 自动保存（无提示），但给撤销 Toast
    doSaveAll(true).finally(() => { autoSavingRef.current = false; });
  }, [doneCount, running, totalCount]);

  const currentImg = images[currentIndex];

  // 保存全部
  const doSaveAll = async (quiet = false) => {
    const all = ocrStore.collectAllDone();
    if (all.length === 0) {
      Toast.show({ type: 'warning', message: '还没有可保存的识别结果' });
      return;
    }
    // 【修改】手动连点也用 saving 拦住，避免重复入库
    if (saving) return;
    setSaving(true);
    try {
      for (const tx of all) useCategory(tx.categoryId);
      const insertedIds = await txStore.bulkCreate(all);
      const count = insertedIds.length;
      // 【修改 P1】快速模式保存后必须返回上一页；旧代码只 ocrStore.reset()，
      // 页面 images 被清空后停留在空白页，用户以为没保存成功会反复操作
      if (quiet) {
        ocrStore.reset();
        // 自动保存给 5 秒撤销窗口，误识别可一键回滚
        Toast.show({
          type: 'success',
          message: `快速识别已保存 ${count} 条`,
          actionLabel: '撤销',
          duration: 5000,
          onAction: async () => {
            for (const id of insertedIds) await txStore.remove(id);
            Toast.show({ type: 'info', message: `已撤销 ${count} 条记录` });
          },
        });
        navigation.goBack();
        return;
      }
      Toast.show({
        type: 'success',
        message: `成功保存 ${count} 条记录`,
        actionLabel: '查看',
        onAction: () => navigation.goBack(),
      });
      setTimeout(() => navigation.goBack(), 300);
    } catch (e) {
      Toast.show({ type: 'error', message: '保存失败：' + e.message });
    } finally {
      setSaving(false);
    }
  };

  // 修改分类时弹 picker（显式传图片下标，避免 currentIndex 状态未刷新导致串图）
  const openPickCategory = (imgIdx, parsedIdx) => {
    const cur = images[imgIdx];
    if (!cur || !cur.parsed[parsedIdx]) return;
    const tx = cur.parsed[parsedIdx];
    setPickerTarget({ imgIdx, parsedIdx });
    setPickerType(tx.type);
    setPickerVisible(true);
  };

  // 日期编辑：滚轮日期 Sheet，dateTarget 记录 {imgIdx, parsedIdx}
  const [dateTarget, setDateTarget] = React.useState(null);

  const openPickDate = (imgIdx, parsedIdx) => {
    const cur = images[imgIdx];
    if (!cur || !cur.parsed[parsedIdx]) return;
    setDateTarget({ imgIdx, parsedIdx });
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bgPage }} edges={['top']}>
      {/* Header */}
      <View style={[styles.header, { backgroundColor: theme.bgCard, borderBottomColor: theme.divider }]}>
        <TouchableOpacity activeOpacity={0.7} style={styles.iconBtn} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={theme.text900} />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[styles.title, { color: theme.text900 }]}>图片识别</Text>
          <Text style={[styles.sub, { color: theme.text500 }]}>
            共 {totalCount} 张 · 已识别 {doneCount} 张
          </Text>
        </View>
        <TouchableOpacity activeOpacity={0.7} style={styles.iconBtn} onPress={() => ocrStore.startBatch()}>
          <MaterialCommunityIcons name="refresh" size={20} color={running ? theme.primaryLight : theme.primary} />
        </TouchableOpacity>
      </View>

      {/* 横向图片缩略图（可点击切换） */}
      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={images}
        keyExtractor={(_, i) => String(i)}
        contentContainerStyle={{ paddingHorizontal: 12, paddingVertical: 12 }}
        ItemSeparatorComponent={() => <View style={{ width: 8 }} />}
        renderItem={({ item: img, index }) => {
          const statusColor =
            img.status === 'done'  ? theme.success :
            img.status === 'error' ? theme.danger  :
            img.status === 'processing' ? theme.warning : theme.text300;
          const active = index === currentIndex;
          return (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => { Haptic.impactLight(); ocrStore.setCurrentIndex(index); }}
            >
              <View style={[
                styles.thumbWrap,
                active && { borderColor: theme.primary, borderWidth: 2.5 },
              ]}>
                <Image source={{ uri: img.uri }} style={styles.thumbImg} />
                <View style={[styles.thumbIndex, { backgroundColor: active ? theme.primary : 'rgba(0,0,0,0.6)' }]}>
                  <Text style={{ color: '#fff', fontSize: 11, fontWeight: '700' }}>{index + 1}</Text>
                </View>
                <View style={[styles.statusDot, { backgroundColor: statusColor }]} />
                {img.status === 'processing' ? (
                  <View style={styles.processOverlay}>
                    <ActivityIndicator size="small" color="#fff" />
                  </View>
                ) : null}
              </View>
            </TouchableOpacity>
          );
        }}
      />

      {/* 进度条（reanimated 平滑动画） */}
      <View style={{ paddingHorizontal: 16 }}>
        <ProgressBar
          progress={totalCount ? doneCount / totalCount : 0}
          height={6}
        />
      </View>

      {running && doneCount < totalCount ? (
        <View style={{ alignItems: 'center', marginTop: 10 }}>
          <Chip label={`识别中… ${doneCount}/${totalCount}`} variant="primary" />
        </View>
      ) : null}

      {/* 识别结果编辑器 */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 180 }}
      >
        {images.map((img, i) => (
          <OcrResultEditor
            key={i}
            image={img}
            index={i}
            totalCount={totalCount}
            onChange={(parsedIdx, patch) => ocrStore.updateParsed(i, parsedIdx, patch)}
            onRemove={(parsedIdx) => ocrStore.removeParsed(i, parsedIdx)}
            onPickCategory={(parsedIdx) => {
              ocrStore.setCurrentIndex(i);
              openPickCategory(i, parsedIdx);
            }}
            onPickDate={(parsedIdx) => {
              ocrStore.setCurrentIndex(i);
              openPickDate(i, parsedIdx);
            }}
            categoriesMap={categoriesMap}
            onRetry={(idx) => ocrStore.retryImage(idx)}
          />
        ))}
        {doneCount === totalCount && totalCount > 0 && images.every((i) => i.parsed.length === 0) ? (
          <View style={{ paddingHorizontal: 16, paddingTop: 20 }}>
            <EmptyState
              variant="ocr-fail"
              actionLabel="改为手动输入"
              onAction={() => navigation.replace('ManualEntry')}
            />
          </View>
        ) : null}
      </ScrollView>

      {/* 底部操作区 */}
      <View style={[
        styles.footer, {
          backgroundColor: theme.bgCard,
          borderTopColor: theme.divider,
          paddingBottom: insets.bottom + 12,
        },
      ]}>
        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10 }}>
          <MaterialCommunityIcons name="flash-outline" size={16} color={quickOcr ? theme.primary : theme.text500} />
          <Text style={[styles.quickLabel, { color: theme.text700, marginLeft: 4, flex: 1 }]}>
            快速模式（识别完自动保存，1秒内可撤销）
          </Text>
          <Switch value={quickOcr} onValueChange={(v) => setQuickOcr(v)} />
        </View>

        <Button
          size="full"
          variant="primary"
          loading={saving}
          disabled={saving || doneCount === 0 || ocrStore.collectAllDone().length === 0}
          onPress={() => doSaveAll(false)}
        >
          {saving ? '保存中…' : `💾 保存全部 (${ocrStore.collectAllDone().length} 条)`}
        </Button>
      </View>

      {/* 分类选择器 */}
      <CategoryPickerSheet
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        type={pickerType}
        onTypeChange={(t) => {
          setPickerType(t);
          if (pickerTarget) {
            ocrStore.updateParsed(pickerTarget.imgIdx, pickerTarget.parsedIdx, { type: t });
          }
        }}
        onSelect={(cat) => {
          if (pickerTarget) {
            ocrStore.updateParsed(pickerTarget.imgIdx, pickerTarget.parsedIdx, { categoryId: cat.id });
          }
        }}
        onNewCategory={() => {
          setPickerVisible(false);
          navigation.navigate('CategoryManage');
        }}
      />

      {/* 日期时间滚轮选择器 */}
      <DatePickerSheet
        visible={dateTarget != null}
        value={
          dateTarget != null
            ? images[dateTarget.imgIdx]?.parsed?.[dateTarget.parsedIdx]?.date
            : undefined
        }
        onClose={() => setDateTarget(null)}
        onConfirm={(ts) => {
          if (dateTarget) {
            ocrStore.updateParsed(dateTarget.imgIdx, dateTarget.parsedIdx, { date: ts });
          }
          setDateTarget(null);
        }}
      />
    </SafeAreaView>
  );
}

const useStyles = makeStyles((theme) => ({
  header: {
    height: 60, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, borderBottomWidth: 0.5,
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title:  { fontSize: 17, fontWeight: '700' },
  sub:    { fontSize: 12, marginTop: 1 },
  thumbWrap: {
    width: 72, height: 72, borderRadius: 14, overflow: 'hidden',
    position: 'relative',
    borderWidth: 2, borderColor: 'transparent',
  },
  thumbImg: { width: '100%', height: '100%' },
  thumbIndex: {
    position: 'absolute', left: 4, top: 4,
    paddingHorizontal: 6, paddingVertical: 1,
    borderRadius: 6,
  },
  statusDot: {
    position: 'absolute', right: 4, bottom: 4,
    width: 10, height: 10, borderRadius: 5,
    borderWidth: 1.5, borderColor: '#fff',
  },
  processOverlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center', justifyContent: 'center',
  },
  progressTrack: {
    height: 4, borderRadius: 2, overflow: 'hidden',
  },
  progressFill: {
    height: 4, borderRadius: 2,
  },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: 0.5,
  },
  quickLabel: { fontSize: 12, fontWeight: '500' },
  switchTrack: {
    width: 50, height: 28, borderRadius: 14,
    padding: 2, justifyContent: 'center',
  },
  switchThumb: {
    width: 22, height: 22, borderRadius: 11, backgroundColor: '#fff',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.2, shadowRadius: 2,
    elevation: 2,
  },
}));
