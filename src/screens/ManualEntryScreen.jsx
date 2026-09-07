import React from 'react';
import {
  View, Text, TouchableOpacity, KeyboardAvoidingView,
  Platform, ScrollView, Modal, Alert, Image,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useAppTheme, makeStyles, cx } from '../ui/themeHelper';
import Button from '../ui/primitives/Button';
import Input from '../ui/primitives/Input';
import SegmentedControl from '../ui/primitives/SegmentedControl';
import AmountInput from '../ui/primitives/AmountInput';
import CategoryPickerSheet from '../ui/components/CategoryPickerSheet';
import DatePickerSheet from '../ui/components/DatePickerSheet';
import ConfirmDialog from '../ui/primitives/ConfirmDialog';
import { useCategoryStore } from '../store/useCategoryStore';
import { useTransactionStore } from '../store/useTransactionStore';
import { useThemeStore } from '../store/useThemeStore';
import Toast from '../ui/primitives/Toast';
import * as Haptic from '../core/utils/haptics';
import { dayjs } from '../core/utils/date';
import { formatDateTime } from '../core/utils/date';
import { yuanToFen } from '../core/utils/amount';

/**
 * 手动记账表单（全屏 Modal）
 * - 顶部：X 关闭 + 收支切换
 * - 大号金额显示 + 快捷金额 + 自定义数字键盘
 * - 分类（默认上次用的）
 * - 日期（默认现在）
 * - 描述（可选）
 * - 附加图片（最多3张）
 * - 底部大按钮：保存
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
  const [dateTs, setDateTs] = React.useState(initial.date || Date.now());
  const [desc, setDesc] = React.useState(initial.description || '');
  const [images, setImages] = React.useState(initial.imagePaths || []);
  const [loading, setLoading] = React.useState(false);

  // 选择分类 Sheet
  const [pickerVisible, setPickerVisible] = React.useState(false);
  const [pickerMode, setPickerMode] = React.useState('category'); // category / date

  // 日期选择滚轮 Sheet
  const [datePickerVisible, setDatePickerVisible] = React.useState(false);

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
        date: dateTs, type, categoryId, amount: amountFen,
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

  // "追加"模式：保存本条不清空，继续下一条
  const doAddNext = async () => {
    if (!canSave) return;
    // 【修改】编辑模式下没有"追加"语义，直接忽略，避免误新建重复记录
    if (editId) return;
    setLoading(true);
    await Haptic.notificationSuccess();
    try {
      useCategory(categoryId);
      await txStore.create({
        date: dateTs, type, categoryId, amount: amountFen,
        description: desc.trim(), source: 'manual', imagePaths: images,
      });
      // 不清空分类和类型，只清金额+描述
      setAmountFen(0);
      setDesc('');
      setImages([]);
      setDateTs(Date.now());
      Toast.show({ type: 'success', message: `已记账，继续写下一条～` });
    } finally {
      setLoading(false);
    }
  };

  // 选图
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

        {/* 收入/支出 切换（在 header 下） */}
        <View style={{ paddingHorizontal: 24, paddingVertical: 12 }}>
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

        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingBottom: 40 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* 大金额数字键盘 */}
          <AmountInput
            valueFen={amountFen}
            onChangeFen={(fen) => setAmountFen(fen)}
            onAdd={doAddNext}
            onConfirm={() => doSave(true)}
            showAdd
          />

          {/* 分类 + 日期 + 描述 */}
          <View style={{ paddingHorizontal: 24, marginTop: 20, gap: 10 }}>
            {/* 分类行 */}
            <TouchableOpacity
              activeOpacity={0.7}
              style={[styles.fieldRow, { backgroundColor: theme.bgCard }]}
              onPress={() => setPickerVisible(true)}
            >
              <View style={styles.fieldIcon}><MaterialCommunityIcons name="tag-multiple-outline" size={18} color={theme.primary} /></View>
              <Text style={[styles.fieldLabel, { color: theme.text500 }]}>分类</Text>
              <View style={{ flex: 1, alignItems: 'flex-end', flexDirection: 'row', justifyContent: 'flex-end' }}>
                <View style={[styles.chipInline, { backgroundColor: (selectedCat?.color || theme.primary) + '22' }]}>
                  <MaterialCommunityIcons name={selectedCat?.icon || 'circle'} size={14} color={selectedCat?.color || theme.primary} />
                  <Text style={[styles.chipInlineText, { color: selectedCat?.color || theme.primary }]}>
                    {selectedCat?.name || '请选择'}
                  </Text>
                </View>
              </View>
              <MaterialCommunityIcons name="chevron-right" size={18} color={theme.text500} />
            </TouchableOpacity>

            {/* 日期行 */}
            <TouchableOpacity
              activeOpacity={0.7}
              style={[styles.fieldRow, { backgroundColor: theme.bgCard }]}
              onPress={() => setDatePickerVisible(true)}
            >
              <View style={styles.fieldIcon}><MaterialCommunityIcons name="calendar-clock-outline" size={18} color={theme.primary} /></View>
              <Text style={[styles.fieldLabel, { color: theme.text500 }]}>日期</Text>
              <Text style={[styles.fieldValueRight, { color: theme.text900, flex: 1, textAlign: 'right' }]}>
                {formatDateTime(dateTs)}
              </Text>
              <MaterialCommunityIcons name="chevron-right" size={18} color={theme.text500} />
            </TouchableOpacity>

            {/* 描述行 */}
            <View style={[styles.fieldRow, { paddingVertical: 10, backgroundColor: theme.bgCard, alignItems: 'flex-start' }]}>
              <View style={[styles.fieldIcon, { marginTop: 4 }]}><MaterialCommunityIcons name="text-long" size={18} color={theme.primary} /></View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.fieldLabel, { color: theme.text500, marginBottom: 4 }]}>描述</Text>
                <Input
                  placeholder={type === 'expense' ? '例如：淘宝买 iQOO 5e 手机 8+256G 蓝色' : '例如：8月绩效奖金'}
                  value={desc}
                  onChangeText={setDesc}
                  multiline
                  containerStyle={{ marginVertical: 0 }}
                />
              </View>
            </View>

            {/* 附加图片 */}
            <View style={[styles.fieldRow, { backgroundColor: theme.bgCard, alignItems: 'flex-start' }]}>
              <View style={[styles.fieldIcon, { marginTop: 4 }]}>
                <MaterialCommunityIcons name="image-plus-outline" size={18} color={theme.primary} />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={[styles.fieldLabel, { color: theme.text500, marginBottom: 8 }]}>
                  附加图片（可选，最多 3 张）
                </Text>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                  {images.map((u, i) => (
                    <View key={i} style={{ position: 'relative' }}>
                      <View style={{ width: 72, height: 72, borderRadius: 10, overflow: 'hidden', backgroundColor: theme.divider }}>
                        <Image source={{ uri: u }} style={{ width: '100%', height: '100%' }} />
                      </View>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        hitSlop={8}
                        onPress={() => setImages(images.filter((_, idx) => idx !== i))}
                        style={[styles.imgDel, { backgroundColor: theme.danger }]}
                      >
                        <MaterialCommunityIcons name="close" size={12} color="#fff" />
                      </TouchableOpacity>
                    </View>
                  ))}
                  {images.length < 3 ? (
                    <TouchableOpacity activeOpacity={0.6} onPress={pickImages}
                      style={[styles.imgAdd, { borderColor: theme.primary, backgroundColor: theme.primaryBg }]}
                    >
                      <MaterialCommunityIcons name="plus" size={22} color={theme.primary} />
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </View>
          </View>
        </ScrollView>

        {/* 底部大按钮 */}
        <View style={[styles.footer, { paddingBottom: insets.bottom + 12, backgroundColor: theme.bgCard, borderTopColor: theme.divider }]}>
          {!canSave && !loading ? (
            <Text style={[styles.saveHint, { color: theme.text500 }]}>
              {amountFen <= 0 ? '先输入金额' : '请选择一个分类'}
            </Text>
          ) : null}
          <Button
            size="full"
            variant="primary"
            disabled={!canSave || loading}
            loading={loading}
            onPress={() => doSave(true)}
          >
            {loading ? '保存中…' : `保存 ${canSave ? formatAmountShort(amountFen) : ''}`}
          </Button>
          <Button
            size="full"
            variant="ghost"
            style={{ marginTop: 6 }}
            disabled={!canSave || loading}
            onPress={doAddNext}
          >
            ➕ 保存并继续添加
          </Button>
        </View>
      </KeyboardAvoidingView>

      {/* 分类选择 Sheet */}
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

      {/* 日期时间滚轮选择器 */}
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

function formatAmountShort(fen) {
  const y = fen / 100;
  if (y >= 10000) return `¥${(y/10000).toFixed(1)}w`;
  if (y >= 1000) return `¥${y.toFixed(0)}`;
  return `¥${y.toFixed(2)}`;
}

const useStyles = makeStyles((theme) => ({
  header: {
    height: 56, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, borderBottomWidth: 0.5,
    backgroundColor: theme.bgCard,
  },
  closeBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  title:    { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700' },
  fieldRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 14,
    borderRadius: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3,
    elevation: 1,
  },
  fieldIcon: {
    width: 34, height: 34, borderRadius: 10,
    backgroundColor: theme.primaryBg,
    alignItems: 'center', justifyContent: 'center',
  },
  fieldLabel: { fontSize: 14, fontWeight: '600' },
  fieldValueRight: { fontSize: 14, fontWeight: '600' },
  chipInline: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 5,
    borderRadius: 10, gap: 4,
  },
  chipInlineText: { fontSize: 13, fontWeight: '700', marginLeft: 4 },
  imgAdd: {
    width: 72, height: 72, borderRadius: 10,
    borderWidth: 1.5, borderStyle: 'dashed',
    alignItems: 'center', justifyContent: 'center',
  },
  imgDel: {
    position: 'absolute', top: -6, right: -6,
    width: 20, height: 20, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: '#fff',
  },
  footer: {
    paddingHorizontal: 16, paddingTop: 12,
    borderTopWidth: 0.5,
  },
  saveHint: { fontSize: 12, textAlign: 'center', marginBottom: 6 },
  dateSheet: {
    width: '100%',
    borderTopLeftRadius: theme.radius.sheet,
    borderTopRightRadius: theme.radius.sheet,
    paddingTop: 8,
  },
  sheetHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: 'center', marginVertical: 6 },
  dateSheetTitle: { textAlign: 'center', fontSize: 16, fontWeight: '700', marginBottom: 6 },
  quickChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
}));
