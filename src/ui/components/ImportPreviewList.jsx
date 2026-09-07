import React from 'react';
import { View, Text, FlatList, TouchableOpacity, Switch, Modal } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Input from '../primitives/Input';
import Button from '../primitives/Button';
import Chip from '../primitives/Chip';
import Card from '../primitives/Card';
import SegmentedControl from '../primitives/SegmentedControl';
import EmptyState from '../primitives/EmptyState';
import { useAppTheme, makeStyles, cx } from '../themeHelper';
import * as Haptic from '../../core/utils/haptics';
import { formatAmount, fenToYuan, yuanToFen } from '../../core/utils/amount';
import { formatDateTime } from '../../core/utils/date';

/**
 * 文件导入预览列表 + 批量操作区
 *
 * rows: ParsedTransaction[]（带 _rowNum、_isDup）
 * selected: Set<number>
 * duplicates: Set<number>
 * onToggle / onSelectAll / onSelectNonDuplicates / onUpdateRow / onPickCategory
 */
export default function ImportPreviewList({
  rows, selected, duplicates,
  onToggle, onSelectAll, onSelectNone, onSelectNonDuplicates,
  onUpdateRow, onPickCategory,
  categoriesMap,
}) {
  const { theme } = useAppTheme();
  const styles = useStyles();

  const dupCount = duplicates.size;
  const selCount = selected.size;

  const renderItem = ({ item: row, index }) => {
    const isSel = selected.has(index);
    const isDup = duplicates.has(index);
    const cat = categoriesMap[row.categoryId] || {};
    const isIncome = row.type === 'income';
    return (
      <TouchableOpacity
        activeOpacity={0.8}
        onPress={() => { Haptic.impactLight(); onToggle(index); }}
        style={cx(styles.row, { backgroundColor: theme.bgCard, opacity: isSel ? 1 : 0.72 })}
      >
        {/* 复选框 */}
        <MaterialCommunityIcons
          name={isSel ? 'checkbox-marked' : 'checkbox-blank-outline'}
          size={22}
          color={isSel ? theme.primary : theme.text300}
        />

        <View style={{ flex: 1, marginLeft: 10 }}>
          {/* 分类 + 金额行 */}
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            {/* 【修改 P1】分类胶囊改为可点击：旧代码只是静态 View，识别错分类时无法在预览页修改 */}
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => { Haptic.selectionClick(); onPickCategory?.(index); }}
              style={[styles.catPill, { backgroundColor: (cat.color || theme.primary) + '22' }]}
            >
              <MaterialCommunityIcons name={cat.icon || 'circle'} size={13} color={cat.color || theme.primary} />
              <Text style={[styles.catName, { color: cat.color || theme.primary }]} numberOfLines={1}>
                {cat.name || '未分类'}
              </Text>
              <MaterialCommunityIcons name="pencil-outline" size={11} color={cat.color || theme.primary} />
            </TouchableOpacity>
            <View style={{ flex: 1 }} />
            <Chip
              size="sm"
              variant={isIncome ? 'success' : 'danger'}
              label={
                // 【修改 P1】单位是分，阈值应为 1,000,000 分（¥10,000），旧值 100000 分 = ¥1,000
                (isIncome ? '+' : '-') + formatAmount(row.amount, { prefix: '', decimals: row.amount >= 1_000_000 ? 0 : 2 })
              }
            />
          </View>
          {/* 描述 */}
          {row.description ? (
            <Text style={[styles.desc, { color: theme.text700 }]} numberOfLines={1}>
              {row.description}
            </Text>
          ) : null}
          {/* 元信息行：日期 + 行号 + 重复标记 */}
          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 4 }}>
            <MaterialCommunityIcons name="calendar-outline" size={12} color={theme.text500} />
            <Text style={[styles.meta, { color: theme.text500, marginLeft: 3 }]}>
              {formatDateTime(row.date)}
            </Text>
            {row._rowNum != null ? (
              <Text style={[styles.meta, { color: theme.text500, marginLeft: 8 }]}>行 {row._rowNum}</Text>
            ) : null}
            {isDup ? (
              <Chip
                size="sm"
                variant="warning"
                label="可能重复"
                style={{ marginLeft: 8 }}
              />
            ) : null}
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      {/* 工具栏 */}
      <Card variant="flat" style={{ marginHorizontal: 16, marginVertical: 10, padding: 12 }}>
        <View style={styles.toolbar}>
          <View style={{ flex: 1, marginRight: 10 }}>
            <Text style={[styles.summaryText, { color: theme.text900, fontWeight: '700' }]}>
              共 {rows.length} 条 · 已选 {selCount}
              {dupCount > 0 ? (
                <Text style={{ color: theme.warning }}>  · 重复 {dupCount}</Text>
              ) : null}
            </Text>
          </View>
        </View>
        <View style={styles.toolButtons}>
          <Chip size="sm" label="全选" variant="primary" onPress={onSelectAll} />
          <Chip size="sm" label="全不选" variant="outline" onPress={onSelectNone} />
          {dupCount > 0 ? (
            <Chip size="sm" label="排除重复" variant="warning" onPress={onSelectNonDuplicates} />
          ) : null}
        </View>
      </Card>

      {/* 列表 */}
      <FlatList
        data={rows}
        keyExtractor={(_, i) => String(i)}
        renderItem={renderItem}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 280 }}
        ListEmptyComponent={<EmptyState variant="empty" description="该文件没有解析出有效记录" />}
      />
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: 14,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.05, shadowRadius: 4,
    elevation: 1,
  },
  catPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  catName: { fontSize: 12, fontWeight: '700', marginLeft: 3, maxWidth: 80 },
  desc:   { fontSize: 13, marginTop: 5 },
  meta:   { fontSize: 11 },
  summaryText: { fontSize: 13 },
  toolbar: { flexDirection: 'row', alignItems: 'center' },
  toolButtons: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
}));
