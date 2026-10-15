// 分类宫格（手动记账页，鲨鱼记账式图1）
// 4 列全量展示当前类型所有分类，最近使用排最前，可随父级 ScrollView 下滑；
// 末位「更多」打开全量选择/管理 Sheet
// 注意：格子用 flexBasis:'25%' 替代 width:'25%'，避免 padding 被计入导致窄屏溢出
import React from 'react';
import { View, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme, makeStyles, cx } from '../themeHelper';
import PressableScale from '../primitives/PressableScale';
import { useCategoryStore } from '../../store/useCategoryStore';
import { useThemeStore } from '../../store/useThemeStore';

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

  // 全部展示：最近使用排最前，其余按原顺序跟上
  const orderedCats = React.useMemo(() => {
    const map = new Map(pool.map((c) => [c.id, c]));
    const recent = recentIds
      .map((id) => map.get(id))
      .filter(Boolean);
    const rest = pool.filter((c) => !recentIds.includes(c.id));
    return [...recent, ...rest];
  }, [pool, recentIds]);

  const cells = [
    ...orderedCats.map((cat) => ({ kind: 'cat', cat })),
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
                <MaterialCommunityIcons name="dots-horizontal" size={18} color={theme.primary} />
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
              )}
            >
              <MaterialCommunityIcons
                name={cat.icon || 'circle'}
                size={18}
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
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  // 4 列等宽：用 flexBasis:'25%' 替代 width:'25%'，padding 不计入 basis，不会溢出
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    flexBasis: '25%',
    alignItems: 'center',
    paddingVertical: 6,
  },
  icon: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  name: { fontSize: 11, fontWeight: '600', textAlign: 'center' },
}));
