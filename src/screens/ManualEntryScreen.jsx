import React from 'react';
import {
  View, Text, TouchableOpacity, TextInput, KeyboardAvoidingView,
  Platform, ScrollView, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAppTheme, makeStyles, cx } from '../ui/themeHelper';
import SegmentedControl from '../ui/primitives/SegmentedControl';
import PressableScale from '../ui/primitives/PressableScale';
import BottomSheet from '../ui/primitives/BottomSheet';
import { AmountDisplay, AmountKeypad } from '../ui/primitives/AmountInput';
import CategoryPickerSheet from '../ui/components/CategoryPickerSheet';
import CategoryQuickGrid from '../ui/components/CategoryQuickGrid';
import DatePickerSheet from '../ui/components/DatePickerSheet';
import ConfirmDialog from '../ui/primitives/ConfirmDialog';
import { useCategoryStore } from '../store/useCategoryStore';
import { useTransactionStore } from '../store/useTransactionStore';
import { useThemeStore } from '../store/useThemeStore';
import Toast from '../ui/primitives/Toast';
import * as Haptic from '../core/utils/haptics';
import { dayjs, dayStart } from '../core/utils/date';

/**
 * 手动记账表单（全屏 Modal）—— 鲨鱼记账式单屏布局
 * 固定区（任何屏幕零滚动）+ 弹性分类宫格区（内容超高时仅宫格内滚动）：
 * ┌ ✕  记一笔          📅 今天▾ ┐  日期收进标题栏
 * │ [💸 支出 | 💰 收入]           │
 * │ 🍜外卖 🛒网购 🚗交通 🏠房租   │  宫格 4 列，flex:1 弹性
 * │ 🍽餐饮 👕购物 ⋯更多          │
 * │ 💬 添加备注…        📷 0/3   │  备注 + 图片入口一行
 * │ ¥ 38.50          先输入金额  │  金额大字 + 就绪提示
 * │ [¥10][¥20][¥50][¥100][¥500]  │
 * │  1   2   3   ⌫              │
 * │  4   5   6  清空             │  键盘贴底：✓保存 / + 继续
 * │  7   8   9   +              │
 * │  .   0  00  ✓保存           │
 * └─────────────────────────────┘
 */
export default function ManualEntryScreen({ navigation, route }) {
  const { theme, insets } = useAppTheme();
  const styles = useStyles();

  // 初始值（可能是跳转来的草稿，或从列表复制/编辑而来）
  const initial = route.params?.draft || {};
  const editId = route.params?.editId;

  const recentIds = useThemeStore((s) => s.recentCategoryIds);
  const useCategory = useThemeStore((s) => s.useCategory);
  const expenseCats = useCategoryStore((s) => s.expenseCategories());
  const incomeCats  = useCategoryStore((s) => s.incomeCategories());
  const categories  = useCategoryStore((s) => s.categories);
  const loadCats    = useCategoryStore((s) => s.load);
  const txStore     = useTransactionStore();

  const [type, setType] = React.useState(initial.type || 'expense');
  const [amountFen, setAmountFen] = React.useState(initial.amount || 0);
  const [categoryId, setCategoryId] = React.useState(null);
  const [dateTs, setDateTs] = React.useState(dayStart(initial.date || Date.now()));
  const [desc, setDesc] = React.useState(initial.description || '');
  const [images, setImages] = React.useState(initial.imagePaths || []);
  const [loading, setLoading] = React.useState(false);

  // 分类全量选择 Sheet / 日期滚轮 Sheet / 附加图片 Sheet
  const [pickerVisible, setPickerVisible] = React.useState(false);
  const [datePickerVisible, setDatePickerVisible] = React.useState(false);
  const [noteEditing, setNoteEditing] = React.useState(false); // 备注行内编辑态
  const [imageSheetVisible, setImageSheetVisible] = React.useState(false);

  // 关闭拦截确认框
  const [discardVisible, setDiscardVisible] = React.useState(false);

  React.useEffect(() => {
    loadCats(false);
  }, []);

  // 【修改 P1】编辑模式：按 editId 加载原记录回填表单。
  // 不加载则表单是空白默认值，update 会把原记录的描述/日期/图片全部覆盖为空
  React.useEffect(() => {
    if (!editId) return;
    let cancelled = false;
    (async () => {
      try {
        const t = await useTransactionStore.getState().getById(editId);
        if (cancelled || !t) return;
        setType(t.type);
        setAmountFen(t.amount);
        setCategoryId(t.categoryId);
        setDateTs(t.date);
        setDesc(t.description || '');
        setImages(t.imagePaths || []);
      } catch (e) {
        Toast.show({ type: 'error', message: '记录加载失败：' + e.message });
      }
    })();
    return () => { cancelled = true; };
  }, [editId]);

  // 当 type 变了或分类列表来了 → 智能选默认分类（最近使用优先）
  React.useEffect(() => {
    if (categoryId) return;
    const pool = type === 'expense' ? expenseCats : incomeCats;
    if (pool.length === 0) return;
    const recent = recentIds
      .map((id) => pool.find((c) => c.id === id))
      .filter(Boolean);
    const cat = recent[0] || pool[0];
    if (cat) setCategoryId(cat.id);
  }, [type, categories.length, recentIds.join(',')]);

  const selectedCat = React.useMemo(() => {
    const pool = type === 'expense' ? expenseCats : incomeCats;
    return pool.find((c) => c.id === categoryId);
  }, [type, categoryId, categories.length]);

  // 保存
  const canSave = amountFen > 0 && !!categoryId;
  const saveHint = amountFen <= 0 ? '先输入金额' : (!categoryId ? '请选择分类' : null);

  const doSave = async (closeAfter = true) => {
    if (!canSave) return;
    setLoading(true);
    await Haptic.notificationSuccess();
    try {
      useCategory(categoryId);
      const payload = {
        date: dayStart(dateTs), type, categoryId, amount: amountFen,
        description: desc.trim(), source: 'manual', imagePaths: images,
      };
      if (editId) {
        await txStore.update(editId, {
          ...payload,
          image_paths_json: images,
          category_id: categoryId,
        });
      } else {
        await txStore.create(payload);
      }
      // 保存成功：先排队返回上一页（导航收尾不依赖反馈组件，避免卡在表单页）
      if (closeAfter) {
        setTimeout(() => {
          try { navigation.goBack(); } catch (_) {}
        }, 200);
      }
      // Toast 挂在 App 根节点，表单页关闭不影响其显示
      Toast.show({
        type: 'success',
        message: editId ? '修改成功' : `已保存 ${selectedCat?.name || ''} ${formatAmountShort(amountFen)}`,
      });
    } catch (e) {
      // 保存失败：提示并停留在表单页，让用户可以重试
      Toast.show({ type: 'error', message: '保存失败：' + e.message });
    } finally {
      setLoading(false);
    }
  };

  // "+" 键：追加模式，保存本条不清空，继续下一条
  const doAddNext = async () => {
    if (!canSave) return;
    // 编辑模式下没有"追加"语义，直接忽略，避免误新建重复记录
    if (editId) return;
    setLoading(true);
    await Haptic.notificationSuccess();
    try {
      useCategory(categoryId);
      await txStore.create({
        date: dayStart(dateTs), type, categoryId, amount: amountFen,
        description: desc.trim(), source: 'manual', imagePaths: images,
      });
      // 不清空分类和类型，只清金额+描述
      setAmountFen(0);
      setDesc('');
      setImages([]);
      setDateTs(dayStart());
      Toast.show({ type: 'success', message: `已记账，继续写下一条～` });
    } finally {
      setLoading(false);
    }
  };

  // 选图（附加图片 Sheet 内触发）
  const pickImages = async () => {
    const remain = 3 - images.length;
    if (remain <= 0) {
      Toast.show({ type: 'info', message: '最多附加 3 张图片' });
      return;
    }
    try {
      const r = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsMultipleSelection: true,
        selectionLimit: remain,
        quality: 0.7,
      });
      if (r.canceled) return;
      setImages([...images, ...r.assets.map((a) => a.uri)]);
    } catch (e) {
      Toast.show({ type: 'error', message: e.message });
    }
  };

  // 关闭拦截：已输入内容时弹确认，避免误触丢失
  const onClosePress = () => {
    if (amountFen > 0 || desc.trim()) {
      setDiscardVisible(true);
    } else {
      navigation.goBack();
    }
  };

  // ============== RENDER ==============
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bgPage }} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* 头部：✕ | 标题 | 日期按钮（鲨鱼记账式收进标题栏） */}
        <View style={[styles.header, { borderBottomColor: theme.divider }]}>
          <TouchableOpacity activeOpacity={0.7} style={styles.closeBtn} onPress={onClosePress} hitSlop={8}>
            <MaterialCommunityIcons name="close" size={22} color={theme.text900} />
          </TouchableOpacity>
          <Text style={cx(styles.title, { color: theme.text900 })} numberOfLines={1}>
            {editId ? '编辑记录' : '记一笔'}
          </Text>
          <PressableScale
            style={[styles.dateBtn, { backgroundColor: theme.primaryBg }]}
            onPress={() => setDatePickerVisible(true)}
          >
            <MaterialCommunityIcons name="calendar-outline" size={14} color={theme.primary} />
            <Text style={[styles.dateBtnText, { color: theme.primary }]}>{datePillLabel(dateTs)}</Text>
            <MaterialCommunityIcons name="chevron-down" size={14} color={theme.primary} />
          </PressableScale>
        </View>

        {/* 收入/支出 切换 */}
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 4 }}>
          <SegmentedControl
            variant="income-expense"
            options={[
              { key: 'expense', label: '💸 支出', value: 'expense' },
              { key: 'income',  label: '💰 收入', value: 'income'  },
            ]}
            value={type}
            onChange={(v) => { setType(v); setCategoryId(null); }}
          />
        </View>

        {/* 常用分类宫格：弹性区（富余空间给更多行；超高时仅此区内部滚动）
            备注行内编辑时收缩宫格，防止系统键盘遮住输入行（Android adjustResize 只压缩 flex 区） */}
        <ScrollView
          style={[{ flex: 1 }, noteEditing && { flexGrow: 0, flexShrink: 1, maxHeight: 116 }]}
          contentContainerStyle={{ paddingBottom: 8 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <CategoryQuickGrid
            type={type}
            selectedId={categoryId}
            onSelect={(cat) => setCategoryId(cat.id)}
            onMore={() => setPickerVisible(true)}
          />
        </ScrollView>

        {/* 备注行：备注入口（左） + 图片入口（右），点击备注原地进入行内编辑（不弹层） */}
        <View style={[styles.noteRow, { borderTopColor: theme.divider, backgroundColor: theme.bgPage }]}>
          {noteEditing ? (
            <TextInput
              value={desc}
              onChangeText={setDesc}
              autoFocus
              onBlur={() => setNoteEditing(false)}
              onSubmitEditing={() => setNoteEditing(false)}
              returnKeyType="done"
              placeholder="添加备注…"
              placeholderTextColor={theme.text500}
              maxLength={200}
              style={[styles.noteInput, { color: theme.text900 }]}
            />
          ) : (
            <PressableScale style={styles.notePress} onPress={() => setNoteEditing(true)}>
              {/* 图标仅跟随内容状态，编辑/展示态保持一致 */}
              <MaterialCommunityIcons
                name={desc.trim() ? 'text-long' : 'tooltip-outline'}
                size={16}
                color={desc.trim() ? theme.primary : theme.text500}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.noteText,
                  { color: desc.trim() ? theme.text900 : theme.text500 },
                  desc.trim() && { fontWeight: '700' },
                ]}
              >
                {desc.trim() ? desc.trim() : '添加备注…'}
              </Text>
            </PressableScale>
          )}
          <PressableScale
            style={[styles.imgEntry, { backgroundColor: images.length ? theme.primaryBg : theme.bgCard }]}
            onPress={() => setImageSheetVisible(true)}
          >
            <MaterialCommunityIcons
              name={images.length ? 'image-multiple-outline' : 'image-plus'}
              size={16}
              color={images.length ? theme.primary : theme.text500}
            />
            <Text
              style={[
                styles.imgEntryText,
                { color: images.length ? theme.primary : theme.text500 },
              ]}
            >
              {images.length ? `${images.length}/3` : '图片'}
            </Text>
          </PressableScale>
        </View>

        {/* 金额大字 + 快捷金额 */}
        <AmountDisplay
          valueFen={amountFen}
          hint={saveHint}
          onChangeFen={(fen) => setAmountFen(fen)}
        />

        {/* 数字键盘贴底：✓保存 / + 保存并继续 */}
        <View style={{ paddingBottom: Math.max(insets.bottom, 8) }}>
          <AmountKeypad
            valueFen={amountFen}
            onChangeFen={(fen) => setAmountFen(fen)}
            onAdd={doAddNext}
            onConfirm={() => doSave(true)}
            showAdd
            confirmDisabled={!canSave || loading}
          />
        </View>
      </KeyboardAvoidingView>

      {/* 附加图片 Sheet */}
      <BottomSheet visible={imageSheetVisible} onClose={() => setImageSheetVisible(false)} title="附加图片（最多 3 张）">
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, paddingBottom: 8 }}>
          {images.map((u, i) => (
            <View key={i} style={{ position: 'relative' }}>
              <View style={{ width: 88, height: 88, borderRadius: 12, overflow: 'hidden', backgroundColor: theme.divider }}>
                <Image source={{ uri: u }} style={{ width: '100%', height: '100%' }} />
              </View>
              <PressableScale
                hitSlop={8}
                onPress={() => setImages(images.filter((_, idx) => idx !== i))}
                style={[styles.imgDel, { backgroundColor: theme.danger }]}
              >
                <MaterialCommunityIcons name="close" size={12} color="#fff" />
              </PressableScale>
            </View>
          ))}
          {images.length < 3 ? (
            <PressableScale
              onPress={pickImages}
              style={[styles.imgAdd, { borderColor: theme.primary, backgroundColor: theme.primaryBg }]}
            >
              <MaterialCommunityIcons name="plus" size={26} color={theme.primary} />
            </PressableScale>
          ) : null}
        </View>
      </BottomSheet>

      {/* 分类全量选择 Sheet */}
      <CategoryPickerSheet
        visible={pickerVisible}
        onClose={() => setPickerVisible(false)}
        type={type}
        onTypeChange={(t) => setType(t)}
        selectedId={categoryId}
        onSelect={(cat) => setCategoryId(cat.id)}
        onNewCategory={() => {
          setPickerVisible(false);
          navigation.navigate('CategoryManage');
        }}
      />

      {/* 日期滚轮选择器 */}
      <DatePickerSheet
        visible={datePickerVisible}
        value={dateTs}
        onClose={() => setDatePickerVisible(false)}
        onConfirm={(ts) => { setDateTs(ts); setDatePickerVisible(false); }}
      />

      {/* 关闭拦截：确认放弃未保存内容 */}
      <ConfirmDialog
        visible={discardVisible}
        icon="alert-circle-outline"
        iconColor={theme.warning}
        title={editId ? '放弃修改？' : '放弃这笔记录？'}
        message={editId ? '当前修改尚未保存，离开后将不会生效。' : '已填写的内容将不会被保存。'}
        confirmText={editId ? '放弃修改' : '放弃'}
        cancelText="继续填写"
        danger
        onCancel={() => setDiscardVisible(false)}
        onConfirm={() => { setDiscardVisible(false); navigation.goBack(); }}
      />
    </SafeAreaView>
  );
}

// 日期按钮标签：今天 / 昨天 / MM-DD / YYYY-MM-DD
function datePillLabel(ts) {
  const d = dayjs(ts);
  const today = dayjs().startOf('day');
  if (d.isSame(today, 'day')) return '今天';
  if (d.isSame(today.subtract(1, 'day'), 'day')) return '昨天';
  if (d.year() === dayjs().year()) return d.format('MM-DD');
  return d.format('YYYY-MM-DD');
}

function formatAmountShort(fen) {
  const y = fen / 100;
  if (y >= 10000) return `¥${(y/10000).toFixed(1)}w`;
  if (y >= 1000) return `¥${y.toFixed(0)}`;
  return `¥${y.toFixed(2)}`;
}

const useStyles = makeStyles((theme) => ({
  header: {
    height: 50, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, borderBottomWidth: 0.5,
    backgroundColor: theme.bgCard,
  },
  closeBtn: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center' },
  title:    { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '700' },
  dateBtn: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, height: 28,
    borderRadius: theme.radius.full, gap: 2,
    marginRight: 8,
  },
  dateBtnText: { fontSize: 12, fontWeight: '700' },

  // 备注行
  noteRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 16, paddingVertical: 6,
    borderTopWidth: 0.5, gap: 8,
  },
  notePress: {
    flex: 1, flexDirection: 'row', alignItems: 'center',
    gap: 6, paddingVertical: 6,
  },
  noteText: { fontSize: 13, flexShrink: 1 },
  noteInput: {
    flex: 1, fontSize: 13,
    paddingVertical: 6, paddingHorizontal: 0,
  },
  imgEntry: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: theme.radius.full, gap: 4,
  },
  imgEntryText: { fontSize: 12, fontWeight: '700' },

  // 附加图片 Sheet
  imgAdd: {
    width: 88, height: 88, borderRadius: 12,
    borderWidth: 1.5, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  imgDel: {
    position: 'absolute', top: -6, right: -6,
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#fff',
  },
}));
