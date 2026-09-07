import React from 'react';
import {
  View, Text, TextInput, TouchableOpacity, Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme, makeStyles, cx } from '../ui/themeHelper';
import Chip from '../ui/primitives/Chip';
import SegmentedControl from '../ui/primitives/SegmentedControl';
import Button from '../ui/primitives/Button';
import Card from '../ui/primitives/Card';
import TransactionList from '../ui/components/TransactionList';
import { useTransactionStore } from '../store/useTransactionStore';
import { useCategoryStore } from '../store/useCategoryStore';
import Toast from '../ui/primitives/Toast';
import CategoryPickerSheet from '../ui/components/CategoryPickerSheet';
import { getPresetRange } from '../core/utils/date';
import { dayjs } from '../core/utils/date';
import * as Haptic from '../core/utils/haptics';

/**
 * 全部记录页：
 * - 顶部搜索框
 * - 筛选栏：类型 Chip + 分类 Chip + 排序 + 日期范围 Chip
 * - 列表（支持删除/编辑/复制，复用 TransactionList）
 */
export default function AllRecordsScreen({ navigation, route }) {
  const { theme, insets, width } = useAppTheme();
  const styles = useStyles();

  const txStore = useTransactionStore();
  const { filter, setFilter, resetFilter } = txStore;
  const categories = useCategoryStore((s) => s.categories);
  const cat = categories.find((c) => c.id === filter.categoryId);

  const [rangeKey, setRangeKey] = React.useState('month');
  const [loading, setLoading] = React.useState(true);
  const [moreLoading, setMoreLoading] = React.useState(false);
  const [records, setRecords] = React.useState([]);
  const [total, setTotal] = React.useState(0);
  const [page, setPage] = React.useState(0);
  const PAGE = 20;

  // 分类筛选的 sheet
  const [catPicker, setCatPicker] = React.useState(false);

  React.useEffect(() => {
    // 进入时应用路由带的筛选
    if (route.params?.categoryId) {
      setFilter({ categoryId: route.params.categoryId });
    }
  }, [route.params?.categoryId]);

  const fetchData = async (resetPage = true) => {
    const p = resetPage ? 0 : page;
    if (resetPage) setLoading(true); else setMoreLoading(true);
    try {
      const r = getPresetRange(rangeKey);
      const { start, end } = r;
      const kw = filter.keyword.trim();
      // 【修改 P1】查询条件与计数条件必须一致，抽成同一对象
      const qFilter = {
        start, end,
        type: filter.type === 'all' ? null : filter.type,
        categoryId: filter.categoryId || null,
        keyword: kw || null,
      };
      const res = await txStore.query({
        ...qFilter,
        sortBy: filter.sortBy,
        sortOrder: filter.sortOrder,
        limit: (p + 1) * PAGE + 5,
      });
      // 【修改 P1】旧代码 count() 无参数统计全表，筛选下 total 恒等于全表数，
      // 导致 TransactionList 的 hasMore(length<total) 永远为 true，onEndReached 反复触发死循环
      const cnt = await txStore.count(qFilter);
      setRecords(res);
      setTotal(cnt);
      setPage(p + 1);
    } catch (e) {
      Toast.show({ type: 'error', message: e.message });
    } finally {
      setLoading(false);
      setMoreLoading(false);
    }
  };

  React.useEffect(() => { fetchData(true); }, [rangeKey, filter.type, filter.categoryId, filter.sortBy, filter.sortOrder]);

  // 防抖搜索
  React.useEffect(() => {
    const t = setTimeout(() => fetchData(true), 250);
    return () => clearTimeout(t);
  }, [filter.keyword]);

  const openDetail = (tx) => navigation.navigate('TransactionDetail', { id: tx.id });
  const onEdit = (tx) => navigation.navigate('ManualEntry', { editId: tx.id });
  const onDelete = async (tx) => {
    // 乐观删除 + Toast「撤销」（误删可恢复）
    const snapshot = {
      date: tx.date, type: tx.type, categoryId: tx.categoryId, amount: tx.amount,
      description: tx.description, source: tx.source, imagePaths: tx.imagePaths,
    };
    await txStore.remove(tx.id);
    Haptic.notificationError();
    fetchData(true);
    Toast.show({
      type: 'info',
      message: `已删除 ${tx.categoryName || '记录'}`,
      actionLabel: '撤销',
      duration: 5000,
      onAction: async () => {
        await txStore.create(snapshot);
        fetchData(true);
        Toast.show({ type: 'success', message: '已恢复该条记录' });
      },
    });
  };
  const onDuplicate = async (tx) => {
    await txStore.create({
      date: Date.now(),
      type: tx.type, categoryId: tx.categoryId, amount: tx.amount,
      description: tx.description ? tx.description + '（复制）' : '',
      source: 'manual', imagePaths: [],
    });
    Toast.show({ type: 'success', message: '已复制一条新记录' });
    fetchData(true);
  };

  const header = (
    <Card variant="flat" style={{ marginHorizontal: 16, marginTop: 12, marginBottom: 12, padding: 14, gap: 12 }}>
      {/* 搜索框 */}
      <View style={[styles.searchBox, { backgroundColor: theme.inputBg }]}>
        <MaterialCommunityIcons name="magnify" size={18} color={theme.text500} />
        <TextInput
          value={filter.keyword}
          onChangeText={(t) => setFilter({ keyword: t })}
          placeholder="搜索描述、分类…"
          placeholderTextColor={theme.text500}
          style={{ flex: 1, marginLeft: 8, color: theme.text900, fontSize: 14, paddingVertical: 0 }}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        {filter.keyword ? (
          <TouchableOpacity activeOpacity={0.6} onPress={() => setFilter({ keyword: '' })}>
            <MaterialCommunityIcons name="close-circle" size={16} color={theme.text500} />
          </TouchableOpacity>
        ) : null}
      </View>

      {/* 类型筛选 */}
      <SegmentedControl
        options={[
          { key: 'all',     label: '全部', value: 'all' },
          { key: 'income',  label: '收入', value: 'income' },
          { key: 'expense', label: '支出', value: 'expense' },
        ]}
        value={filter.type}
        onChange={(v) => setFilter({ type: v })}
      />

      {/* 分类筛选 Chip */}
      <View>
        <Text style={{ fontSize: 12, color: theme.text500, fontWeight: '600', marginBottom: 6 }}>分类筛选</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          <Chip
            label={cat ? cat.name : '全部分类'}
            size="sm"
            variant={cat ? 'primary' : 'outline'}
            icon={cat ? <MaterialCommunityIcons name={cat.icon} size={12} color={cat ? '#fff' : theme.primary} /> : null}
            onPress={() => setCatPicker(true)}
          />
          {cat ? (
            <Chip label="清除" size="sm" variant="outline" onPress={() => setFilter({ categoryId: null })} />
          ) : null}
        </View>
      </View>

      {/* 日期范围 + 排序 */}
      <View style={{ gap: 8 }}>
        <Text style={{ fontSize: 12, color: theme.text500, fontWeight: '600' }}>时间范围</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
          {[
            { k: 'week7', l: '近7天' }, { k: 'month', l: '本月' },
            { k: 'prevMonth', l: '上月' }, { k: 'day30', l: '近30天' },
          ].map((it) => (
            <Chip key={it.k} label={it.l} size="sm"
              variant={rangeKey === it.k ? 'primary' : 'outline'}
              onPress={() => setRangeKey(it.k)} />
          ))}
        </View>
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Chip size="sm" label="按日期" variant={filter.sortBy === 'date' ? 'primary' : 'outline'}
            onPress={() => setFilter({ sortBy: 'date' })} />
          <Chip size="sm" label="按金额" variant={filter.sortBy === 'amount' ? 'primary' : 'outline'}
            onPress={() => setFilter({ sortBy: 'amount' })} />
        </View>
        <View style={{ flexDirection: 'row', gap: 6 }}>
          <Chip size="sm" label={filter.sortOrder === 'DESC' ? '↓ 降序' : '↑ 升序'}
            variant="outline"
            onPress={() => setFilter({ sortOrder: filter.sortOrder === 'DESC' ? 'ASC' : 'DESC' })} />
          <Chip size="sm" label="重置" variant="danger" onPress={() => { resetFilter(); setRangeKey('month'); }} />
        </View>
      </View>
    </Card>
  );

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: theme.bgPage }} edges={['top']}>
      <View style={[styles.header, { backgroundColor: theme.bgCard, borderBottomColor: theme.divider }]}>
        <TouchableOpacity activeOpacity={0.7} style={styles.iconBtn} onPress={() => navigation.goBack()}>
          <MaterialCommunityIcons name="arrow-left" size={22} color={theme.text900} />
        </TouchableOpacity>
        <Text style={[styles.title, { color: theme.text900 }]}>全部记录</Text>
        <TouchableOpacity activeOpacity={0.7} style={styles.iconBtn} onPress={() => navigation.navigate('ManualEntry')}>
          <MaterialCommunityIcons name="plus" size={22} color={theme.primary} />
        </TouchableOpacity>
      </View>

      <TransactionList
        transactions={records}
        total={total}
        loading={loading}
        loadingMore={moreLoading}
        onRefresh={() => fetchData(true)}
        onLoadMore={() => fetchData(false)}
        onItemPress={openDetail}
        onItemEdit={onEdit}
        onItemDelete={onDelete}
        onItemDuplicate={onDuplicate}
        emptyVariant={
          filter.keyword.trim() || filter.categoryId || filter.type !== 'all'
            ? 'search'
            : 'empty'
        }
        headerComponent={header}
      />

      <CategoryPickerSheet
        visible={catPicker}
        onClose={() => setCatPicker(false)}
        type={filter.type === 'all' ? 'expense' : filter.type}
        onTypeChange={(t) => setFilter({ type: t, categoryId: null })}
        selectedId={filter.categoryId}
        // 【修改 P1】"全部"类型下选择器默认只列支出分类，选中收入分类时必须同步 type 筛选，
        // 否则 categoryId 指向收入分类而 type 仍为 expense，结果永远查不到
        onSelect={(c) => setFilter({ categoryId: c.id, type: c.type })}
      />
    </SafeAreaView>
  );
}

const useStyles = makeStyles((theme) => ({
  header: {
    height: 56, flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 8, borderBottomWidth: 0.5,
  },
  iconBtn: { width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: '700' },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    height: 42,
    borderRadius: 12,
  },
}));
