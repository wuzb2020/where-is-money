import React from 'react';
import {
  View, Text, Modal, TouchableWithoutFeedback, TouchableOpacity,
  FlatList, TextInput, Keyboard,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Button from '../primitives/Button';
import Chip from '../primitives/Chip';
import { useAppTheme, makeStyles, cx } from '../themeHelper';
import * as Haptic from '../../core/utils/haptics';
import { useCategoryStore } from '../../store/useCategoryStore';
import { useThemeStore } from '../../store/useThemeStore';
import { pinyin } from 'pinyin-pro';

/**
 * 分类选择器（底部 Sheet Modal）
 * - 搜索框（支持拼音首字母）
 * - 最近使用 Top 4
 * - 分类网格 4 列
 * - 末尾 + 新建分类
 */
export default function CategoryPickerSheet({
  visible,
  onClose,
  type = 'expense',          // expense | income
  onTypeChange,
  selectedId,
  onSelect,                  // (category) => void
  onNewCategory,             // () => void   跳转分类管理
}) {
  const { theme, height, insets } = useAppTheme();
  const styles = useStyles();
  const recentIds = useThemeStore((s) => s.recentCategoryIds);
  const categories = useCategoryStore((s) => s.categories);
  const loadCats = useCategoryStore((s) => s.load);

  const [keyword, setKeyword] = React.useState('');
  const inputRef = React.useRef(null);

  React.useEffect(() => {
    if (visible) {
      loadCats(false);
      setKeyword('');
    }
  }, [visible]);

  const expenseCats = categories.filter((c) => c.type === 'expense');
  const incomeCats  = categories.filter((c) => c.type === 'income');
  const currentList = type === 'expense' ? expenseCats : incomeCats;

  // 搜索过滤（支持中文 + 拼音首字母）
  const filtered = React.useMemo(() => {
    if (!keyword.trim()) return currentList;
    const kw = keyword.trim().toLowerCase();
    return currentList.filter((c) => {
      if (c.name.toLowerCase().includes(kw)) return true;
      const py = pinyin(c.name, { pattern: 'first', toneType: 'none', type: 'string' }).toLowerCase();
      return py.includes(kw);
    });
  }, [currentList, keyword]);

  // 最近使用分类对象
  const recentCats = React.useMemo(() => {
    const map = new Map(categories.map((c) => [c.id, c]));
    return recentIds.map((id) => map.get(id)).filter(Boolean).filter((c) => c.type === type).slice(0, 4);
  }, [recentIds, categories, type]);

  const handleSelect = async (cat) => {
    await Haptic.impactMedium();
    onSelect?.(cat);
    setTimeout(() => onClose?.(), 120);
  };

  if (!visible) return null;

  const renderCat = ({ item: cat }) => {
    const active = cat.id === selectedId;
    return (
      <TouchableWithoutFeedback onPress={() => handleSelect(cat)}>
        <View style={cx(styles.catCell, active && { borderColor: cat.color, backgroundColor: cat.color + '18' })}>
          <View style={cx(styles.catIcon, { backgroundColor: cat.color + '18' })}>
            <MaterialCommunityIcons name={cat.icon || 'circle'} size={24} color={cat.color} />
          </View>
          <Text style={cx(styles.catName, { color: theme.text900 }, active && { color: cat.color, fontWeight: '700' })} numberOfLines={1}>
            {cat.name}
          </Text>
        </View>
      </TouchableWithoutFeedback>
    );
  };

  return (
    <Modal transparent visible={visible} animationType="slide" onRequestClose={onClose}>
      <TouchableWithoutFeedback
        onPress={() => { Keyboard.dismiss(); onClose?.(); }}
      >
        <View style={styles.mask}>
          <TouchableWithoutFeedback onPress={() => Keyboard.dismiss()}>
            <View
              style={cx(styles.sheet, {
                backgroundColor: theme.bgCard,
                maxHeight: height * 0.78,
                paddingBottom: insets.bottom + 16,
              })}
              onStartShouldSetResponder={() => true}
            >
              {/* 顶部把手 */}
              <View style={styles.handleBar}>
                <View style={[styles.handle, { backgroundColor: theme.text300 }]} />
              </View>

              {/* 类型切换 Tab */}
              <View style={styles.typeTabs}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={cx(styles.typeTab, type === 'expense' && [styles.typeTabActive, { backgroundColor: theme.dangerBg }])}
                  onPress={() => onTypeChange?.('expense')}
                >
                  <Text style={cx(styles.typeTabText, { color: type === 'expense' ? theme.danger : theme.text500 }, type === 'expense' && { fontWeight: '700' })}>
                    支出分类
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={cx(styles.typeTab, type === 'income' && [styles.typeTabActive, { backgroundColor: theme.successBg }])}
                  onPress={() => onTypeChange?.('income')}
                >
                  <Text style={cx(styles.typeTabText, { color: type === 'income' ? theme.success : theme.text500 }, type === 'income' && { fontWeight: '700' })}>
                    收入分类
                  </Text>
                </TouchableOpacity>
              </View>

              {/* 搜索框 */}
              <View style={cx(styles.searchBox, { backgroundColor: theme.inputBg })}>
                <MaterialCommunityIcons name="magnify" size={18} color={theme.text500} />
                <TextInput
                  ref={inputRef}
                  placeholder="搜索分类（支持拼音首字母 wm → 外卖）"
                  placeholderTextColor={theme.text500}
                  style={cx(styles.searchInput, { color: theme.text900 })}
                  value={keyword}
                  onChangeText={setKeyword}
                  returnKeyType="search"
                />
              </View>

              {/* 最近使用 */}
              {recentCats.length > 0 && !keyword ? (
                <View style={styles.recentWrap}>
                  <Text style={cx(styles.sectionTitle, { color: theme.text500 })}>最近使用</Text>
                  <View style={styles.recentRow}>
                    {recentCats.map((cat) => (
                      <Chip
                        key={cat.id}
                        label={cat.name}
                        icon={<MaterialCommunityIcons name={cat.icon || 'circle'} size={14} color={cat.color} />}
                        selected={cat.id === selectedId}
                        variant={selectedId === cat.id ? 'primary' : 'default'}
                        size="md"
                        onPress={() => handleSelect(cat)}
                        style={{ marginRight: 8, marginBottom: 6 }}
                      />
                    ))}
                  </View>
                </View>
              ) : null}

              {/* 分类网格 */}
              <FlatList
                data={filtered}
                keyExtractor={(c) => String(c.id)}
                renderItem={renderCat}
                numColumns={4}
                columnWrapperStyle={{ gap: 8, marginBottom: 8 }}
                contentContainerStyle={{ gap: 8, paddingBottom: 8 }}
                showsVerticalScrollIndicator={false}
                ListEmptyComponent={
                  <View style={{ padding: 40, alignItems: 'center' }}>
                    <MaterialCommunityIcons name="magnify-close" size={40} color={theme.text300} />
                    <Text style={{ color: theme.text500, marginTop: 8, fontSize: 13 }}>
                      没找到匹配的分类
                    </Text>
                    <View style={{ marginTop: 16, width: 200 }}>
                      <Button size="md" variant="outline" onPress={() => { onClose?.(); onNewCategory?.(); }}>
                        + 新建分类
                      </Button>
                    </View>
                  </View>
                }
                ListFooterComponent={
                  <TouchableWithoutFeedback onPress={() => { onClose?.(); onNewCategory?.(); }}>
                    <View style={cx(styles.catCell, { borderStyle: 'dashed', borderColor: theme.text300 })}>
                      <View style={cx(styles.catIcon, { backgroundColor: theme.primaryBg })}>
                        <MaterialCommunityIcons name="plus" size={24} color={theme.primary} />
                      </View>
                      <Text style={cx(styles.catName, { color: theme.primary })}>新建</Text>
                    </View>
                  </TouchableWithoutFeedback>
                }
              />
            </View>
          </TouchableWithoutFeedback>
        </View>
      </TouchableWithoutFeedback>
    </Modal>
  );
}

const useStyles = makeStyles((theme) => ({
  mask: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'flex-end',
  },
  sheet: {
    borderTopLeftRadius: theme.radius.sheet,
    borderTopRightRadius: theme.radius.sheet,
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  handleBar: { alignItems: 'center', paddingVertical: 8 },
  handle:    { width: 40, height: 4, borderRadius: 2 },
  typeTabs:  { flexDirection: 'row', marginVertical: 6, gap: 8 },
  typeTab:   { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: 12 },
  typeTabActive: {},
  typeTabText: { fontSize: 14, fontWeight: '600' },
  searchBox: {
    flexDirection: 'row', alignItems: 'center',
    paddingHorizontal: 12,
    height: 44,
    borderRadius: 12,
    marginTop: 4, marginBottom: 14,
  },
  searchInput: { flex: 1, marginLeft: 8, fontSize: 14, paddingVertical: 0 },
  sectionTitle: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  recentWrap: { marginBottom: 6 },
  recentRow:  { flexDirection: 'row', flexWrap: 'wrap' },
  catCell: {
    flex: 1, maxWidth: '23%',
    alignItems: 'center',
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'transparent',
    marginHorizontal: '1%',
  },
  catIcon: {
    width: 44, height: 44, borderRadius: 22,
    alignItems: 'center', justifyContent: 'center', marginBottom: 6,
  },
  catName: { fontSize: 12, fontWeight: '600', maxWidth: '90%' },
}));
