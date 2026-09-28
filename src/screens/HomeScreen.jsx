import React from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Alert, Modal, Platform, RefreshControl,
  ActionSheetIOS, Share as RnShare,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme, makeStyles, cx, usePrimaryGradient } from '../ui/themeHelper';
import { useThemeStore } from '../store/useThemeStore';
import { useCategoryStore } from '../store/useCategoryStore';
import { useTransactionStore } from '../store/useTransactionStore';
import { useOcrStore } from '../store/useOcrStore';
import { useImportStore } from '../store/useImportStore';
import SummaryCards from '../ui/components/SummaryCards';
import DonutChartCard from '../ui/components/DonutChartCard';
import TransactionList from '../ui/components/TransactionList';
import Chip from '../ui/primitives/Chip';
import Toast from '../ui/primitives/Toast';
import Skeleton from '../ui/primitives/Skeleton';
import PressableScale from '../ui/primitives/PressableScale';
import MonthlyReportCard from '../ui/components/MonthlyReportCard';
import Button from '../ui/primitives/Button';
import { getDashboardData, getMonthlyReport } from '../core/services/AnalyticsService';
import { DATE_RANGE_PRESETS } from '../core/constants/categories';
import { getPresetRange, dayjs } from '../core/utils/date';
import { formatAmount } from '../core/utils/amount';
import * as Haptic from '../core/utils/haptics';

/**
 * 首页 Dashboard（核心页面）
 * - 顶部问候语 + 时间范围 Chip
 * - 三张汇总卡（收入/支出/结余）
 * - 甜甜圈图 + 图例（切换支出/收入）
 * - 最近交易列表 + 查看全部
 * - 底部三大按钮（拍照/手动/导入）
 * - 下拉刷新
 */
export default function HomeScreen({ navigation }) {
  const { theme, insets, width } = useAppTheme();
  const styles = useStyles();
  const primaryGradient = usePrimaryGradient();
  const loadCats = useCategoryStore((s) => s.load);

  // 时间范围（默认本月）
  const [preset, setPreset] = React.useState('month');
  const [range, setRange] = React.useState(() => getPresetRange('month'));
  const [label, setLabel] = React.useState(() => getPresetRange('month').label);

  // 饼图维度
  const [chartMode, setChartMode] = React.useState('expense');

  // 仪表盘数据
  const [dashboard, setDashboard] = React.useState(null);
  const [loading, setLoading] = React.useState(true);
  const [page, setPage] = React.useState(0);
  const [moreLoading, setMoreLoading] = React.useState(false);
  const [hasMore, setHasMore] = React.useState(false);
  const [recentList, setRecentList] = React.useState([]); // 【修改】首页列表独立查询，支持真正分页
  const PAGE = 15;

  // 月度报告弹窗
  const [showReport, setShowReport] = React.useState(false);
  const [monthlyReport, setMonthlyReport] = React.useState(null);

  const txStore = useTransactionStore();
  const ocrStore = useOcrStore();
  const importStore = useImportStore();

  // 拉取仪表盘
  const fetchDashboard = async (showSkeleton = true) => {
    if (showSkeleton) setLoading(true);
    try {
      await loadCats(false);
      const data = await getDashboardData(range);
      setDashboard(data);
      // 【修改 P1】列表独立查询：dashboard.recent 固定只有 5 条，旧 loadMore 改 page 也拿不到更多
      const list = await useTransactionStore.getState().query({
        start: range.start, end: range.end,
        limit: 5, sortBy: 'date', sortOrder: 'DESC',
      });
      setRecentList(list);
      setHasMore(list.length >= 5);
      setPage(0);
    } catch (e) {
      console.error(e);
      Toast.show({ type: 'error', message: '加载失败：' + e.message });
    } finally {
      setLoading(false);
    }
  };

  React.useEffect(() => {
    const r = getPresetRange(preset);
    setRange({ start: r.start, end: r.end });
    setLabel(r.label);
  }, [preset]);

  React.useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      fetchDashboard();
      checkMonthlyReport();
    });
    return unsubscribe;
  }, [navigation, range.start, range.end]);

  // 范围变化时刷新
  React.useEffect(() => { fetchDashboard(); setPage(0); }, [range.start, range.end]);

  // 月度报告：每月 1 号首次进入弹
  const checkMonthlyReport = async () => {
    const today = dayjs();
    if (today.date() !== 1) return;
    const key = `reported_${today.year()}_${today.month() + 1}`;
    const shown = await require('../core/db').SettingsDao.get(key, false);
    if (shown) return;
    const prev = today.subtract(1, 'month');
    try {
      const rpt = await getMonthlyReport(prev.year(), prev.month() + 1);
      if (rpt.txCount === 0) return;
      setMonthlyReport(rpt);
      setShowReport(true);
      await require('../core/db').SettingsDao.set(key, true);
    } catch (e) { /* noop */ }
  };

  // 【修改 P1】点击月报图标：先加载上月报告再弹窗；旧代码无条件 setShowReport(true)，
  // monthlyReport 为 null 时弹出空 Modal（白屏弹窗）
  const openMonthlyReport = async () => {
    try {
      const prev = dayjs().subtract(1, 'month');
      const rpt = await getMonthlyReport(prev.year(), prev.month() + 1);
      if (!rpt || rpt.txCount === 0) {
        Toast.show({ type: 'info', message: '上月暂无记账记录' });
        return;
      }
      setMonthlyReport(rpt);
      setShowReport(true);
    } catch (e) {
      Toast.show({ type: 'error', message: '月报加载失败：' + e.message });
    }
  };

  // 分页加载列表更多（真正按范围查 DB）
  const loadMore = async () => {
    if (moreLoading || !hasMore) return;
    setMoreLoading(true);
    try {
      const next = page + 1;
      const list = await useTransactionStore.getState().query({
        start: range.start, end: range.end,
        limit: 5 + next * PAGE, sortBy: 'date', sortOrder: 'DESC',
      });
      if (list.length > recentList.length) {
        setRecentList(list);
        setPage(next);
      }
      // 【修改】返回条数不再增长说明没有更多了，止住 onEndReached 死循环
      setHasMore(list.length > recentList.length);
    } catch (e) {
      Toast.show({ type: 'error', message: '加载更多失败：' + e.message });
    } finally {
      setMoreLoading(false);
    }
  };

  const recentRecords = recentList;

  // ========== 三大按钮操作 ==========

  const btnManual = async () => {
    await Haptic.impactMedium();
    navigation.navigate('ManualEntry', {});
  };

  const btnImage = async () => {
    // web 端不 await 触觉反馈，避免脱离用户点击的同步上下文导致文件选择器被浏览器拦截
    if (Platform.OS !== 'web') await Haptic.impactMedium();
    else Haptic.impactMedium();
    // 【修改】web 端 Alert 不渲染自定义按钮、Promise 永不 resolve 会卡死；web 无相机，直接走相册
    let choice;
    if (Platform.OS === 'ios') {
      choice = await new Promise((resolve) => {
        ActionSheetIOS.showActionSheetWithOptions(
          { options: ['取消', '拍照', '从相册选择（最多9张）'], cancelButtonIndex: 0 },
          (idx) => resolve(idx),
        );
      });
    } else if (Platform.OS === 'web') {
      choice = 2;
    } else {
      choice = await pickWithAlertFallback();
    }

    if (choice === 0) return;
    const isCamera = choice === 1;
    try {
      let result;
      if (isCamera) {
        await ImagePicker.requestCameraPermissionsAsync();
        result = await ImagePicker.launchCameraAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsMultipleSelection: false,
          quality: 0.8,
          presentationStyle: 0,
        });
      } else {
        // web 端无需请求权限，且必须在用户点击的同步上下文内触发文件选择器
        if (Platform.OS !== 'web') await ImagePicker.requestMediaLibraryPermissionsAsync();
        result = await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ImagePicker.MediaTypeOptions.Images,
          allowsMultipleSelection: true,
          selectionLimit: 9,
          quality: 0.8,
        });
      }
      if (result.canceled) return;
      const uris = result.assets.map((a) => a.uri);
      ocrStore.setImages(uris);
      navigation.navigate('OcrCapture');
    } catch (e) {
      Toast.show({ type: 'error', message: '打开图片失败：' + e.message });
    }
  };

  // Android ActionSheet fallback（用 Alert）
  function pickWithAlertFallback() {
    return new Promise((resolve) => {
      Alert.alert('选择方式', '', [
        { text: '取消', onPress: () => resolve(0), style: 'cancel' },
        { text: '拍照', onPress: () => resolve(1) },
        { text: '从相册选择（最多9张）', onPress: () => resolve(2) },
      ]);
    });
  }

  const btnImport = async () => {
    await Haptic.impactMedium();
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // xlsx
          'application/vnd.ms-excel', // xls
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // docx
          'application/msword', // doc
        ],
        copyToCacheDirectory: true,
      });
      if (res.canceled) return;
      const f = res.assets[0];
      const isExcel = /\.xlsx?$/i.test(f.name);
      const isWord  = /\.docx?$/i.test(f.name);
      if (!isExcel && !isWord) {
        Toast.show({ type: 'error', message: '仅支持 xlsx / xls / docx 格式' });
        return;
      }
      importStore.reset();
      importStore.setFile({ uri: f.uri, name: f.name, size: f.size, type: isExcel ? 'excel' : 'word' });
      navigation.navigate('FileImport');
    } catch (e) {
      Toast.show({ type: 'error', message: '选择文件失败：' + e.message });
    }
  };

  const openDetail = (tx) => navigation.navigate('TransactionDetail', { id: tx.id });

  // 删除一条记录：乐观删除 + Toast「撤销」（误删可恢复）
  const onDeleteTx = async (tx) => {
    const snapshot = {
      date: tx.date, type: tx.type, categoryId: tx.categoryId, amount: tx.amount,
      description: tx.description, source: tx.source, imagePaths: tx.imagePaths,
    };
    await txStore.remove(tx.id);
    Haptic.notificationError();
    fetchDashboard(false);
    Toast.show({
      type: 'info',
      message: `已删除 ${tx.categoryName || '记录'}`,
      actionLabel: '撤销',
      duration: 5000,
      onAction: async () => {
        await txStore.create(snapshot);
        fetchDashboard(false);
        Toast.show({ type: 'success', message: '已恢复该条记录' });
      },
    });
  };

  // 汇总卡点击：收入/支出 → 全部记录（带类型筛选）；结余 → 全部记录
  const onSummaryPress = (key) => {
    if (key === 'income') txStore.setFilter({ type: 'income' });
    else if (key === 'expense') txStore.setFilter({ type: 'expense' });
    else txStore.resetFilter();
    navigation.navigate('AllRecords');
  };

  const onDuplicateTx = async (tx) => {
    const newId = await txStore.create({
      date: Date.now(),
      type: tx.type,
      categoryId: tx.categoryId,
      amount: tx.amount,
      description: tx.description ? `${tx.description}（复制）` : '',
      source: 'manual',
      imagePaths: [],
    });
    Toast.show({
      type: 'success', message: '已复制一条新记录',
      actionLabel: '编辑', onAction: () => navigation.navigate('TransactionDetail', { id: newId }),
    });
    fetchDashboard(false);
  };

  const onEditTx = (tx) => navigation.navigate('TransactionDetail', { id: tx.id, mode: 'edit' });

  // ========================================================
  //                       RENDER
  // ========================================================

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bgPage }} edges={['top']}>
      {/* 顶部 Header（渐变背景） */}
      <LinearGradient colors={primaryGradient} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={cx(styles.headerBg, { paddingTop: insets.top })}
      >
        <View style={styles.headerRow}>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <View style={styles.logo}>
              <MaterialCommunityIcons name="wallet" size={22} color={theme.primary} />
            </View>
            <View style={{ marginLeft: 10 }}>
              <Text style={styles.hello}>
                {greetingText()} {theme.palette === 'warm' ? '🌤️' : '👋'}
              </Text>
              <Text style={styles.subDate}>{dayjs().format('M月D日 dddd')}</Text>
            </View>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <PressableScale onPress={openMonthlyReport} scaleTo={0.88} style={styles.iconBtn} hitSlop={6}>
              <MaterialCommunityIcons name="chart-pie" size={20} color="#fff" />
            </PressableScale>
            <PressableScale onPress={() => navigation.navigate('Settings')} scaleTo={0.88} style={[styles.iconBtn, { marginLeft: 4 }]} hitSlop={6}>
              <MaterialCommunityIcons name="cog-outline" size={20} color="#fff" />
            </PressableScale>
          </View>
        </View>
      </LinearGradient>

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingBottom: 150 }}
        refreshControl={
          <RefreshControl
            refreshing={loading}
            onRefresh={() => fetchDashboard(true)}
            tintColor={theme.primary}
            colors={[theme.primary]}
          />
        }
      >
        {/* 汇总三卡（盖在渐变上，用负 marginTop 浮出来） */}
        <View style={styles.raiseCards}>
          {loading && !dashboard ? (
            <Skeleton variant="summary" />
          ) : dashboard ? (
            <SummaryCards
              income={dashboard.summaryCards.income}
              expense={dashboard.summaryCards.expense}
              balance={dashboard.summaryCards.balance}
              onCardPress={onSummaryPress}
            />
          ) : null}
        </View>

        {/* 时间范围筛选 Chips */}
        <View style={styles.rangeBar}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 4 }}>
            {DATE_RANGE_PRESETS.map((p) => (
              <Chip
                key={p.key}
                label={p.label}
                size="sm"
                variant={preset === p.key ? 'primary' : 'outline'}
                onPress={() => { Haptic.selectionClick(); setPreset(p.key); }}
                style={{ marginRight: 8 }}
              />
            ))}
            <Chip
              label={label}
              size="sm"
              icon={<MaterialCommunityIcons name="calendar-range" size={12} color={preset === 'custom' ? '#fff' : theme.primary} />}
              variant={preset === 'custom' ? 'primary' : 'outline'}
              onPress={() => { Haptic.selectionClick(); openCustomDate(); }}
            />
          </ScrollView>
        </View>

        {/* 饼图卡片 */}
        {loading && !dashboard ? (
          <View style={{ paddingHorizontal: 16, marginTop: 16 }}>
            <Skeleton variant="chart" />
          </View>
        ) : dashboard ? (
          <DonutChartCard
            expenseData={dashboard.expenseByCategory}
            incomeData={dashboard.incomeByCategory}
            mode={chartMode}
            onModeChange={(m) => { Haptic.selectionClick(); setChartMode(m); }}
            total={dashboard.total}
            onLegendItemPress={(item) => {
              // 点击图例：跳全部记录页并按该分类筛选
              useTransactionStore.getState().setFilter({ categoryId: item.categoryId });
              navigation.navigate('AllRecords', { categoryId: item.categoryId });
            }}
          />
        ) : null}

        {/* 最近记录列表 */}
        <View style={{ marginTop: 16 }}>
          <View style={styles.listHeader}>
            <Text style={cx(styles.listTitle, { color: theme.text900 })}>最近交易</Text>
            <TouchableOpacity activeOpacity={0.6} onPress={() => navigation.navigate('AllRecords')}>
              <Text style={cx(styles.seeAll, { color: theme.primary })}>查看全部 →</Text>
            </TouchableOpacity>
          </View>
          <TransactionList
            transactions={recentRecords}
            total={dashboard?.total}
            loading={loading}
            loadingMore={moreLoading}
            onRefresh={() => fetchDashboard(true)}
            onLoadMore={loadMore}
            onItemPress={openDetail}
            onItemEdit={onEditTx}
            onItemDelete={onDeleteTx}
            onItemDuplicate={onDuplicateTx}
            emptyVariant={dashboard?.total === 0 ? 'empty' : 'no-data'}
            showViewAll={false}
          />
        </View>
      </ScrollView>

      {/* 底部三大按钮（悬浮停靠栏：卡片延伸至屏幕底边，内容避开 Home 指示条） */}
      <View pointerEvents="box-none" style={styles.bottomBtnsWrap}>
        <View style={[
          styles.bottomBtns,
          { backgroundColor: theme.bgCard, paddingBottom: Math.max(insets.bottom, 10) },
        ]}>
          <BottomBigBtn
            icon="image-outline"
            label="拍照 / 相册"
            sub="图片识别"
            onPress={btnImage}
            gradient={['#6366F1', '#8B5CF6']}
          />
          <BottomBigBtn
            icon="pencil-outline"
            label="手动记账"
            sub="3秒快速记"
            onPress={btnManual}
            gradient={['#059669', '#34D399']}
          />
          <BottomBigBtn
            icon="file-upload-outline"
            label="导入文件"
            sub="Excel/Word"
            onPress={btnImport}
            gradient={['#DC2626', '#F87171']}
          />
        </View>
      </View>

      {/* 月度报告 Modal */}
      <Modal transparent visible={showReport} animationType="fade" onRequestClose={() => setShowReport(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(15,23,42,0.6)', alignItems: 'center', justifyContent: 'center' }}>
          {monthlyReport ? (
            <MonthlyReportCard
              report={monthlyReport}
              onClose={() => setShowReport(false)}
              onSave={async () => {
                // 简化：用系统分享代替保存
                const msg = generateReportPlainText(monthlyReport);
                try {
                  await RnShare.share({ message: msg, title: `${monthlyReport.month}月账单报告` });
                } catch {
                  Toast.show({ type: 'info', message: '报告内容已复制，可粘贴保存' });
                }
              }}
            />
          ) : null}
        </View>
      </Modal>
    </SafeAreaView>
  );

  // --- helpers ---
  function greetingText() {
    const h = dayjs().hour();
    if (h < 6)  return '夜深了';
    if (h < 11) return '早上好';
    if (h < 14) return '中午好';
    if (h < 18) return '下午好';
    if (h < 22) return '晚上好';
    return '夜深了';
  }

  function openCustomDate() {
    Alert.alert(
      '自定义时间范围',
      '请输入开始和结束日期（YYYY-MM-DD，用空格分开）',
      [
        { text: '取消', style: 'cancel' },
        {
          text: '使用最近90天',
          onPress: () => {
            const r = {
              start: dayjs().subtract(89, 'day').startOf('day').valueOf(),
              end: dayjs().add(1, 'day').startOf('day').valueOf(),
              label: '最近90天',
            };
            setRange({ start: r.start, end: r.end }); setLabel(r.label); setPreset('custom');
          },
        },
      ],
    );
  }
}

/** 底部大按钮组件（子项）：按压缩放反馈 */
function BottomBigBtn({ icon, label, sub, onPress, gradient }) {
  const { theme } = useAppTheme();
  return (
    <PressableScale
      onPress={onPress}
      scaleTo={0.9}
      haptic="medium"
      style={{ flex: 1, alignItems: 'center', marginHorizontal: 6 }}
    >
      <LinearGradient
        colors={gradient}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{
          width: 56, height: 56, borderRadius: 18,
          alignItems: 'center', justifyContent: 'center',
          shadowColor: gradient[0],
          shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10,
          elevation: 4,
          marginBottom: 6,
        }}
      >
        <MaterialCommunityIcons name={icon} size={26} color="#fff" />
      </LinearGradient>
      <Text style={{ color: theme.text900, fontSize: 13, fontWeight: '700' }}>{label}</Text>
      <Text style={{ color: theme.text500, fontSize: 10, marginTop: 1 }}>{sub}</Text>
    </PressableScale>
  );
}

function generateReportPlainText(rpt) {
  return `【${rpt.year}年${rpt.month}月 账单报告】
💰 本月收入：${formatAmount(rpt.income)}（${rpt.incomeDelta.trend} ${rpt.incomeDelta.percent}%）
💸 本月支出：${formatAmount(rpt.expense)}（${rpt.expenseDelta.trend} ${rpt.expenseDelta.percent}%）
💵 本月结余：${formatAmount(rpt.balance)}
📒 共记账 ${rpt.txCount} 笔
`;
}

const useStyles = makeStyles((theme) => ({
  headerBg: {
    position: 'absolute', width: '100%',
    height: 220, left: 0, top: 0,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    paddingTop: 8,
    backgroundColor: 'transparent',
  },
  logo: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
  },
  hello:   { color: '#fff', fontSize: 17, fontWeight: '800' },
  subDate: { color: 'rgba(255,255,255,0.8)', fontSize: 12, marginTop: 2 },
  iconBtn: {
    width: 40, height: 40, borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
  },
  raiseCards: {
    marginTop: 108,    // 让卡片盖在顶部渐变背景下沿
  },
  rangeBar: {
    marginTop: 16,
  },
  listHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, marginBottom: 8,
  },
  listTitle: { fontSize: 16, fontWeight: '800' },
  seeAll:    { fontSize: 13, fontWeight: '700' },
  bottomBtnsWrap: {
    position: 'absolute', left: 0, right: 0, bottom: 0,
    paddingHorizontal: 10,
  },
  bottomBtns: {
    flexDirection: 'row',
    paddingTop: 10,
    paddingBottom: 10, // 内联会按安全区 insets.bottom 覆盖
    paddingHorizontal: 8,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 }, shadowOpacity: 0.06, shadowRadius: 10,
    elevation: 8,
  },
}));
