// 常用分类宫格（手动记账页顶部快捷选类）
// 2行×4列：前 7 位 = 最近使用（LRU）+ 默认高频分类补齐，末位「更多」打开全量选择 Sheet
// 目标：分类选择零弹层——高频场景一击直达，长尾场景仍可走完整选择器
import React from 'react';
import { View, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme, makeStyles, cx } from '../themeHelper';
import PressableScale from '../primitives/PressableScale';
import { useCategoryStore } from '../../store/useCategoryStore';
import { useThemeStore } from '../../store/useThemeStore';

const GRID_SLOTS = 8;      // 总格数（含"更多"）
const MORE_SLOTS = 1;      // 末尾"更多"占用格数

export default function CategoryQuickGrid({
  type = 'expense',
  selectedId,
  onSelect,        // (category) => void
  onMore,          // () => void 打开全量分类选择
}) {
  const { theme } = useAppTheme();
  const styles = useStyles();

  const categories = useCategoryStore((s) => s.categories);
  const recentIds = useThemeStore((s) => s.recentCategoryIds);

  const pool = React.useMemo(
    () => categories.filter((c) => c.type === type),
    [categories, type],
  );

  // 最近使用优先，不足用池子顺序补齐；去重后截取 7 个
  // 若当前选中分类不在宫格内（如编辑旧记录），替换末位注入，保证选中态始终可见
  const quickCats = React.useMemo(() => {
    const map = new Map(pool.map((c) => [c.id, c]));
    const recent = recentIds
      .map((id) => map.get(id))
      .filter(Boolean);
    const rest = pool.filter((c) => !recentIds.includes(c.id));
    const list = [...recent, ...rest].slice(0, GRID_SLOTS - MORE_SLOTS);
    if (selectedId && !list.some((c) => c.id === selectedId)) {
      const sel = map.get(selectedId);
      if (sel) list[list.length - 1] = sel;
    }
    return list;
  }, [pool, recentIds, selectedId]);

  const cells = [
    ...quickCats.map((cat) => ({ kind: 'cat', cat })),
    { kind: 'more' },
  ];

  return (
    <View style={styles.grid}>
      {cells.map((cell) => {
        if (cell.kind === 'more') {
          return (
            <PressableScale
              key="__more__"
              style={styles.cell}
              haptic="light"
              onPress={onMore}
            >
              <View style={cx(styles.icon, { backgroundColor: theme.primaryBg })}>
                <MaterialCommunityIcons name="dots-horizontal" size={22} color={theme.primary} />
              </View>
              <Text style={cx(styles.name, { color: theme.primary })}>更多</Text>
            </PressableScale>
          );
        }
        const cat = cell.cat;
        const active = cat.id === selectedId;
        return (
          <PressableScale
            key={String(cat.id)}
            style={styles.cell}
            haptic="medium"
            onPress={() => onSelect?.(cat)}
          >
            <View
              style={cx(
                styles.icon,
                { backgroundColor: active ? cat.color : cat.color + '18' },
                active && styles.iconActive,
              )}
            >
              <MaterialCommunityIcons
                name={cat.icon || 'circle'}
                size={22}
                color={active ? '#fff' : cat.color}
              />
            </View>
            <Text
              numberOfLines={1}
              style={cx(
                styles.name,
                { color: theme.text700 },
                active && { color: cat.color, fontWeight: '800' },
              )}
            >
              {cat.name}
            </Text>
          </PressableScale>
        );
      })}
      {/* 空槽占位，保证 4 列对齐 */}
      {Array.from({ length: Math.max(0, GRID_SLOTS - cells.length) }).map((_, i) => (
        <View key={`__pad_${i}`} style={styles.cell} />
      ))}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 4,
  },
  cell: {
    width: '25%',
    alignItems: 'center',
    paddingVertical: 6,
  },
  icon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
    borderWidth: 2,
    borderColor: 'transparent',
  },
  iconActive: {
    borderColor: 'transparent',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  name: { fontSize: 12, fontWeight: '600', maxWidth: '88%' },
}));
