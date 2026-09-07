import React from 'react';
import { View, Text, ScrollView, Alert, Image, TouchableOpacity, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme, makeStyles, cx } from '../ui/themeHelper';
import Button from '../ui/primitives/Button';
import Card from '../ui/primitives/Card';
import Input from '../ui/primitives/Input';
import SegmentedControl from '../ui/primitives/SegmentedControl';
import Chip from '../ui/primitives/Chip';
import CategoryPickerSheet from '../ui/components/CategoryPickerSheet';
import DatePickerSheet from '../ui/components/DatePickerSheet';
import ImageViewer from '../ui/components/ImageViewer';
import AnimatedNumber from '../ui/primitives/AnimatedNumber';
import Toast from '../ui/primitives/Toast';
import { useTransactionStore } from '../store/useTransactionStore';
import { useCategoryStore } from '../store/useCategoryStore';
import * as Haptic from '../core/utils/haptics';
import { formatDateTime, dayjs } from '../core/utils/date';
import { formatAmount, yuanToFen, fenToYuan } from '../core/utils/amount';

/**
 * 交易详情页
 * mode: view（默认）| edit
 * 展示所有字段 + 关联图片（可点大图）+ 编辑/删除按钮
 */
export default function TransactionDetailScreen({ navigation, route }) {
  const { theme, insets } = useAppTheme();
  const styles = useStyles();
  const id = route.params?.id;
  const initMode = route.params?.mode || 'view';

  const txStore = useTransactionStore();
  const categories = useCategoryStore((s) => s.categories);
  const loadCats = useCategoryStore((s) => s.load);

  const [tx, setTx] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [mode, setMode] = React.useState(initMode);
  const [saving, setSaving] = React.useState(false);

  // 编辑模式的临时状态
  const [draft, setDraft] = React.useState(null);
  const [catPicker, setCatPicker] = React.useState(false);
  const [dateModal, setDateModal] = React.useState(false);

  const [imgViewer, setImgViewer] = React.useState(null); // 当前查看的图片 URI

  // 【修改】编辑态金额用独立字符串态，避免受控 value 强制 toFixed(2) 回写导致小数点输不进去
  const [amtText, setAmtText] = React.useState('');

  // 【修改 P0】useMemo 必须在所有 early return 之前调用，
  // 旧代码放在 if(loading)return 之后，loading 由 true→false 时 hooks 数量变化，React 直接报错白屏
  const categoriesMap = React.useMemo(() => {
    const m = {}; for (const c of categories) m[c.id] = c; return m;
  }, [categories]);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadCats(false);
        // 【修改】id 缺失时直接结束 loading，避免 getById(undefined) 后永久卡白屏
        if (id == null) { setLoading(false); return; }
        const t = await txStore.getById(id);
        if (cancelled) return;
        if (!t) { setLoading(false); return; }
        setTx(t);
        setDraft({ ...t });
        setAmtText(String(fenToYuan(t.amount)));
      } catch (e) {
        Toast.show({ type: 'error', message: '记录加载失败：' + e.message });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [id]);

  if (loading) return null;
  if (!tx) return (
    <SafeAreaView style={{ flex: 1 }}>
      <Text style={{ padding: 24 }}>记录不存在或已删除</Text>
    </SafeAreaView>
  );

  const cat = categoriesMap[mode === 'edit' ? draft.categoryId : tx.categoryId];
  const isIncome = (mode === 'edit' ? draft.type : tx.type) === 'income';
  const amountFen = mode === 'edit' ? draft.amount : tx.amount;

  const onDelete = async () => {
    // 乐观删除 + Toast「撤销」：先返回，用户可在 5 秒内恢复
    const snapshot = {
      date: tx.date, type: tx.type, categoryId: tx.categoryId, amount: tx.amount,
      description: tx.description, source: tx.source, imagePaths: tx.imagePaths,
    };
    await txStore.remove(tx.id);
    Haptic.notificationError();
    navigation.goBack();
    Toast.show({
      type: 'info',
      message: '已删除该记录',
      actionLabel: '撤销',
      duration: 5000,
      onAction: async () => {
        await txStore.create(snapshot);
        Toast.show({ type: 'success', message: '已恢复该条记录' });
      },
    });
  };

  const doSave = async () => {
    if (!draft.amount || !draft.categoryId) return;
    setSaving(true);
    await Haptic.notificationSuccess();
    try {
      await txStore.update(tx.id, {
        date: draft.date, type: draft.type, category_id: draft.categoryId,
        amount: draft.amount, description: draft.description,
        image_paths_json: draft.imagePaths || [],
      });
      Toast.show({ type: 'success', message: '修改已保存' });
      const fresh = await txStore.getById(id);
      setTx(fresh);
      setMode('view');
    } catch (e) {
      Toast.show({ type: 'error', message: e.message });
    } finally {
      setSaving(false);
    }
  };

  const sourceBadge = {
    manual: { label: '手动输入', icon: 'pencil-outline', bg: theme.infoBg, color: theme.info },
    image:  { label: '图片识别', icon: 'image-outline',  bg: theme.successBg, color: theme.success },
    file:   { label: '文件导入', icon: 'file-document-outline', bg: theme.warningBg, color: theme.warning },
  }[mode === 'edit' ? draft.source : tx.source];

  const Section = ({ title, children }) => (
    <Card variant="flat" style={{ marginHorizontal: 16, marginTop: 12 }}>
      <Text style={[styles.sectionTitle, { color: theme.text500 }]}>{title}</Text>
      {children}
    </Card>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bgPage }} edges={['top']}>
      <View style={[styles.header, { backgroundColor: theme.bgCard, borderBottomColor: theme.divider }]}>
        <TouchableOpacity activeOpacity={0.7} style={styles.iconBtn} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={theme.text900} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text900 }]}>{mode === 'edit' ? '编辑记录' : '记录详情'}</Text>
        <TouchableOpacity activeOpacity={0.7} style={styles.iconBtn}
          onPress={() => {
            // 【修改】进入编辑态时同步金额字符串
            if (mode !== 'edit') setAmtText(String(fenToYuan(tx.amount)));
            setMode(mode === 'edit' ? 'view' : 'edit');
          }}
        >
          <MaterialCommunityIcons
            name={mode === 'edit' ? 'close' : 'pencil'}
            size={20}
            color={mode === 'edit' ? theme.danger : theme.primary}
          />
        </TouchableOpacity>
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 180 }}>
        {/* 顶部大金额卡片 */}
        <View style={{ alignItems: 'center', paddingTop: 28 }}>
          <View style={[styles.catBadge, { backgroundColor: (cat?.color || theme.primary) + '22' }]}>
            <MaterialCommunityIcons name={cat?.icon || 'circle'} size={20} color={cat?.color || theme.primary} />
            <Text style={[styles.catBadgeText, { color: cat?.color || theme.primary }]}>
              {cat?.name || '未分类'}
            </Text>
          </View>
          <AnimatedNumber
            style={[styles.bigAmount, { color: isIncome ? theme.success : theme.danger }]}
            numberOfLines={1}
            adjustsFontSizeToFit
            value={amountFen}
            format={(v) => `${isIncome ? '+' : '-'}${formatAmount(Math.round(v))}`}
          />
          <Text style={[styles.dateText, { color: theme.text500 }]}>
            {formatDateTime(mode === 'edit' ? draft.date : tx.date)}
          </Text>
          <Chip
            label={sourceBadge.label}
            icon={<MaterialCommunityIcons name={sourceBadge.icon} size={12} color={sourceBadge.color} />}
            size="sm"
            variant="default"
            style={{ marginTop: 8, backgroundColor: sourceBadge.bg, borderColor: sourceBadge.color }}
            textStyle={{ color: sourceBadge.color }}
          />
        </View>

        {mode === 'view' ? (
          <>
            <Section title="基本信息">
              <Row label="类型" value={isIncome ? '💰 收入' : '💸 支出'} valueColor={isIncome ? theme.success : theme.danger} />
              <Row label="分类" value={cat?.name || '未分类'} />
              <Row label="金额" value={formatAmount(amountFen)} valueColor={isIncome ? theme.success : theme.danger} bold />
              <Row label="日期" value={formatDateTime(mode === 'edit' ? draft.date : tx.date)} />
            </Section>
            <Section title="描述">
              <Text style={{ color: theme.text900, fontSize: 14, lineHeight: 22 }}>
                {tx.description || '（无）'}
              </Text>
            </Section>
            {tx.imagePaths && tx.imagePaths.length > 0 ? (
              <Section title={`凭证图片（${tx.imagePaths.length}张）`}>
                <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
                  {tx.imagePaths.map((u, i) => (
                    <TouchableOpacity activeOpacity={0.8} key={i} onPress={() => setImgViewer(u)}>
                      <Image source={{ uri: u }} style={styles.imgThumb} />
                    </TouchableOpacity>
                  ))}
                </View>
              </Section>
            ) : null}
            <Section title="元数据">
              <Row label="ID" value={`#${tx.id}`} />
              <Row label="创建时间" value={formatDateTime(tx.createdAt)} />
              <Row label="更新时间" value={formatDateTime(tx.updatedAt)} />
              {tx.fileImportId ? <Row label="来源批次" value={tx.fileImportId} /> : null}
            </Section>
          </>
        ) : (
          // ===== 编辑态 =====
          <View style={{ paddingHorizontal: 16, marginTop: 12, gap: 12 }}>
            <SegmentedControl
              variant="income-expense"
              options={[
                { key: 'expense', label: '💸 支出', value: 'expense' },
                { key: 'income',  label: '💰 收入', value: 'income'  },
              ]}
              value={draft.type}
              onChange={(v) => setDraft({ ...draft, type: v, categoryId: null })}
            />

            <Input
              label="金额（元）"
              keyboardType="decimal-pad"
              // 【修改】编辑时用本地字符串态，失焦/保存时才转分；旧代码 value 强制 toFixed(2)，小数点永远输不进去
              value={amtText}
              onChangeText={(t) => {
                setAmtText(t);
                const n = parseFloat(t);
                setDraft({ ...draft, amount: isNaN(n) ? 0 : yuanToFen(n) });
              }}
            />

            <TouchableOpacity activeOpacity={0.7}
              style={[styles.catRow, { backgroundColor: theme.bgCard }]}
              onPress={() => setCatPicker(true)}
            >
              <Text style={{ color: theme.text500, fontWeight: '600' }}>分类</Text>
              <View style={[styles.chipInline, { backgroundColor: (cat?.color || theme.primary) + '22' }]}>
                <MaterialCommunityIcons name={cat?.icon || 'circle'} size={14} color={cat?.color || theme.primary} />
                <Text style={{ color: cat?.color || theme.primary, marginLeft: 4, fontSize: 13, fontWeight: '700' }}>
                  {cat?.name || '点击选择'}
                </Text>
                <MaterialCommunityIcons name="chevron-right" size={16} color={theme.text500} />
              </View>
            </TouchableOpacity>

            <TouchableOpacity activeOpacity={0.7}
              style={[styles.catRow, { backgroundColor: theme.bgCard }]}
              onPress={() => setDateModal(true)}
            >
              <Text style={{ color: theme.text500, fontWeight: '600' }}>日期时间</Text>
              <Text style={{ color: theme.text900, fontWeight: '700' }}>{formatDateTime(draft.date)}</Text>
            </TouchableOpacity>

            <Input
              label="描述"
              value={draft.description}
              onChangeText={(t) => setDraft({ ...draft, description: t })}
              multiline
            />
          </View>
        )}
      </ScrollView>

      {/* 底部操作 */}
      <View style={[
        styles.footer, {
          backgroundColor: theme.bgCard, borderTopColor: theme.divider,
          paddingBottom: insets.bottom + 12,
        },
      ]}>
        {mode === 'view' ? (
          <>
            <Button size="full" variant="outline" onPress={onDelete} style={{ borderColor: theme.danger }}>
              <Text style={{ color: theme.danger, fontWeight: '700' }}>🗑 删除此记录</Text>
            </Button>
            <View style={{ height: 10 }} />
            <Button size="full" variant="primary" onPress={() => { setAmtText(String(fenToYuan(tx.amount))); setMode('edit'); }}>✍️ 编辑</Button>
          </>
        ) : (
          <>
            <Button size="full" variant="ghost" onPress={() => { setDraft({ ...tx }); setAmtText(String(fenToYuan(tx.amount))); setMode('view'); }}>
              取消编辑
            </Button>
            <View style={{ height: 8 }} />
            <Button
              size="full"
              variant="primary"
              disabled={!draft.amount || !draft.categoryId}
              loading={saving}
              onPress={doSave}
            >
              💾 保存修改
            </Button>
          </>
        )}
      </View>

      {/* 分类选择器 */}
      <CategoryPickerSheet
        visible={catPicker}
        onClose={() => setCatPicker(false)}
        type={draft.type}
        onTypeChange={(t) => setDraft({ ...draft, type: t, categoryId: null })}
        selectedId={draft.categoryId}
        onSelect={(c) => setDraft({ ...draft, categoryId: c.id })}
      />

      {/* 日期时间滚轮选择器 */}
      <DatePickerSheet
        visible={dateModal}
        value={draft?.date}
        onClose={() => setDateModal(false)}
        onConfirm={(ts) => { setDraft({ ...draft, date: ts }); setDateModal(false); }}
      />

      {/* 全屏图片查看器（双指缩放/双击/下滑关闭） */}
      <ImageViewer uri={imgViewer} onClose={() => setImgViewer(null)} />
    </SafeAreaView>
  );
}

function Row({ label, value, valueColor, bold }) {
  const { theme } = useAppTheme();
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 10, borderBottomWidth: 0.5, borderBottomColor: theme.divider }}>
      <Text style={{ flex: 1, color: theme.text500, fontSize: 14 }}>{label}</Text>
      <Text style={{ color: valueColor || theme.text900, fontSize: 14, fontWeight: bold ? '800' : '500', maxWidth: '60%', textAlign: 'right' }}>
        {value}
      </Text>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  header: {
    height: 56, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, borderBottomWidth: 0.5,
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title:   { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700' },

  catBadge: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999, gap: 6,
  },
  catBadgeText: { fontSize: 13, fontWeight: '700', marginLeft: 4 },
  bigAmount: { fontSize: 44, fontWeight: '900', marginTop: 12, letterSpacing: 0.5 },
  dateText:  { fontSize: 13, marginTop: 6 },
  sectionTitle: { fontSize: 12, fontWeight: '700', marginBottom: 4 },
  imgThumb: { width: 92, height: 92, borderRadius: 12, backgroundColor: theme.divider },
  footer: {
    paddingHorizontal: 16,
    paddingTop: 14,
    borderTopWidth: 0.5,
  },
  catRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 14, paddingVertical: 14,
    borderRadius: 12, justifyContent: 'space-between',
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.04, shadowRadius: 3, elevation: 1,
  },
  chipInline: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 10, paddingVertical: 6,
    borderRadius: 10, gap: 4,
  },
}));
