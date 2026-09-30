import React from 'react';
import {
  View, Text, TouchableOpacity, KeyboardAvoidingView,
  Platform, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAppTheme, makeStyles, cx } from '../ui/themeHelper';
import Input from '../ui/primitives/Input';
import SegmentedControl from '../ui/primitives/SegmentedControl';
import AmountInput from '../ui/primitives/AmountInput';
import PressableScale from '../ui/primitives/PressableScale';
import BottomSheet from '../ui/primitives/BottomSheet';
import CategoryPickerSheet from '../ui/components/CategoryPickerSheet';
import CategoryQuickGrid from '../ui/components/CategoryQuickGrid';
import DatePickerSheet from '../ui/components/DatePickerSheet';
import ConfirmDialog from '../ui/primitives/ConfirmDialog';
import Button from '../ui/primitives/Button';
import { useCategoryStore } from '../store/useCategoryStore';
import { useTransactionStore } from '../store/useTransactionStore';
import { useThemeStore } from '../store/useThemeStore';
import Toast from '../ui/primitives/Toast';
import * as Haptic from '../core/utils/haptics';
import { dayjs, dayStart } from '../core/utils/date';

/**
 * 手动记账表单（全屏 Modal）—— 固定三层单屏布局，零滚动
 * - 顶部：X 关闭 + 收支切换
 * - 常用分类宫格：最近使用 + 高频分类，一击直达；末位「更多」打开全量选择器
 * - 中部：金额显示 + 快捷金额 + pill 行（日期/备注/图片，点击各弹 Sheet）
 * - 底部：数字键盘固定（✓ = 保存，+ = 保存并继续），金额/分类未就绪时 ✓ 置灰
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

  // 分类全量选择 Sheet
  const [pickerVisible, setPickerVisible] = React.useState(false);

  // 日期滚轮 Sheet
  const [datePickerVisible, setDatePickerVisible] = React.useState(false);

  // 备注 Sheet / 附加图片 Sheet
  const [noteVisible, setNoteVisible] = React.useState(false);
  const [imageSheetVisible, setImageSheetVisible] = React.useState(false);

  // 关闭拦截确认框
  const [discardVisible, setDiscardVisible] = React.useState(false);

  React.useEffect(() => {
    loadCats(false);
  }, []);

  // 【修改 P1】编辑模式：按 editId 加载原记录回填表单。
  // 旧代码从不加载，表单是空白默认值，update 会把原记录的描述/日期/图片全部覆盖为空
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

  // 当 type 变了或分类列表来了 → 智能选默认分类
  React.useEffect(() => {
    if (categoryId) return;
    const pool = type === 'expense' ? expenseCats : incomeCats;
    if (pool.length === 0) return;
    // 最近使用优先
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
      // 保存成功：先排队返回上一页（导航收尾不依赖反馈组件，
      // 避免 Toast 等反馈层异常时把用户卡在表单页）
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
    // 【修改】编辑模式下没有"追加"语义，直接忽略，避免误新建重复记录
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
  // pill 行（日期 / 备注 / 图片）—— 收在金额与键盘之间，点击各弹对应 Sheet
  const middleSlot = (
    <View style={styles.middleWrap}>
      <View style={styles.pillRow}>
        <PressableScale style={styles.pill} onPress={() => setDatePickerVisible(true)}>
          <MaterialCommunityIcons name="calendar-outline" size={16} color={theme.primary} />
          <Text style={cx(styles.pillText, { color: theme.text700 })}>{datePillLabel(dateTs)}</Text>
        </PressableScale>
        <PressableScale style={styles.pill} onPress={() => setNoteVisible(true)}>
          <MaterialCommunityIcons name="text-long" size={16} color={desc.trim() ? theme.primary : theme.text500} />
          <Text
            numberOfLines={1}
            style={cx(styles.pillText, { color: desc.trim() ? theme.text900 : theme.text500 }, desc.trim() && { fontWeight: '700' })}
          >
            {desc.trim() ? truncate(desc.trim(), 8) : '备注'}
          </Text>
        </PressableScale>
        <PressableScale style={styles.pill} onPress={() => setImageSheetVisible(true)}>
          <MaterialCommunityIcons
            name={images.length ? 'image-multiple-outline' : 'image-plus'}
            size={16}
            color={images.length ? theme.primary : theme.text500}
          />
          <Text style={cx(styles.pillText, { color: images.length ? theme.text900 : theme.text500 }, images.length > 0 && { fontWeight: '700' })}>
            {images.length ? `图片 ${images.length}/3` : '图片'}
          </Text>
        </PressableScale>
      </View>
      {/* 未就绪提示：金额/分类缺一不可 */}
      {!canSave ? (
        <Text style={cx(styles.saveHint, { color: theme.text500 })}>
          {amountFen <= 0 ? '先输入金额' : '请选择一个分类'}
        </Text>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bgPage }} edges={['top']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
      >
        {/* 头部 */}
        <View style={[styles.header, { borderBottomColor: theme.divider }]}>
          <TouchableOpacity activeOpacity={0.7} style={styles.closeBtn} onPress={onClosePress} hitSlop={8}>
            <MaterialCommunityIcons name="close" size={24} color={theme.text900} />
          </TouchableOpacity>
          <Text style={cx(styles.title, { color: theme.text900 })}>
            {editId ? '编辑记录' : '记一笔'}
          </Text>
          <View style={{ width: 40 }} />
        </View>

        {/* 收入/支出 切换 */}
        <View style={{ paddingHorizontal: 24, paddingVertical: 10 }}>
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

        {/* 常用分类宫格：一击直达，末位「更多」进全量选择器 */}
        <CategoryQuickGrid
          type={type}
          selectedId={categoryId}
          onSelect={(cat) => setCategoryId(cat.id)}
          onMore={() => setPickerVisible(true)}
        />

        {/* 金额 + 快捷金额 + pill 行 + 键盘（flex:1 撑满，键盘贴底） */}
        <AmountInput
          valueFen={amountFen}
          onChangeFen={(fen) => setAmountFen(fen)}
          onAdd={doAddNext}
          onConfirm={() => doSave(true)}
          showAdd
          confirmDisabled={!canSave || loading}
          middle={middleSlot}
          containerStyle={{ flex: 1 }}
        />
      </KeyboardAvoidingView>

      {/* 备注 Sheet（替代内嵌输入框：避免系统键盘与数字键盘冲突、多行输入撑高页面） */}
      <BottomSheet visible={noteVisible} onClose={() => setNoteVisible(false)} title="备注">
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Input
            placeholder="例如：淘宝买 iQOO 5e 手机 8+256G 蓝色"
            value={desc}
            onChangeText={setDesc}
            multiline
            autoFocus
            maxLength={200}
            containerStyle={{ marginVertical: 4 }}
          />
          <Button
            size="full"
            variant="primary"
            style={{ marginTop: 8 }}
            onPress={() => setNoteVisible(false)}
          >
            完成
          </Button>
        </KeyboardAvoidingView>
      </BottomSheet>

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

// pill 行日期标签：今天 / 昨天 / MM-DD / YYYY-MM-DD
function datePillLabel(ts) {
  const d = dayjs(ts);
  const today = dayjs().startOf('day');
  if (d.isSame(today, 'day')) return '今天';
  if (d.isSame(today.subtract(1, 'day'), 'day')) return '昨天';
  if (d.year() === dayjs().year()) return d.format('MM-DD');
  return d.format('YYYY-MM-DD');
}

function truncate(str, n) {
  return str.length > n ? `${str.slice(0, n)}…` : str;
}

const useStyles = makeStyles((theme) => ({
  header: {
    height: 56, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, borderBottomWidth: 0.5,
    backgroundColor: theme.bgCard,
  },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title:    { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700' },

  // pill 行
  middleWrap: { paddingHorizontal: 16 },
  pillRow: { flexDirection: 'row', gap: 8 },
  pill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: theme.bgCard,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3 },
      android: { elevation: 1 },
    }),
  },
  pillText: { fontSize: 13, fontWeight: '600', maxWidth: '78%' },
  saveHint: { fontSize: 12, textAlign: 'center', marginTop: 8, marginBottom: 2 },

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
