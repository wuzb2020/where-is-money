import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { PieChart } from 'react-native-chart-kit';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import Card from '../primitives/Card';
import SegmentedControl from '../primitives/SegmentedControl';
import PressableScale from '../primitives/PressableScale';
import AnimatedNumber from '../primitives/AnimatedNumber';
import { useAppTheme, makeStyles, cx } from '../themeHelper';
import { formatAmount } from '../../core/utils/amount';
import EmptyState from '../primitives/EmptyState';

/**
 * 甜甜圈/饼图 + Top5 图例（可切换支出/收入维度）
 *
 * expenseData / incomeData:
 *   [{ categoryName, categoryIcon, color, amount, percent }]
 */
export default function DonutChartCard({
  expenseData, incomeData, total,
  mode = 'expense', onModeChange,
  onLegendItemPress,  // (categoryId) => void  点击图例查看该分类详情
  width,
}) {
  const { theme, width: w } = useAppTheme();
  const styles = useStyles();
  const cardWidth = width || (w - 32);

  const data = mode === 'expense' ? expenseData : incomeData;
  const totalAmount = data.reduce((s, d) => s + d.amount, 0);

  // PieChart 需要的 { name, population, color, legendFontColor } 格式
  const chartData = data.length
    ? data.map((d) => ({
        name: d.categoryName,
        population: d.amount,
        color: d.color,
        legendFontColor: theme.text500,
        legendFontSize: 11,
      }))
    : // 空数据时放一个淡灰占位扇区，避免库崩溃
      [{ name: '', population: 1, color: theme.divider, legendFontColor: 'transparent', legendFontSize: 0 }];

  return (
    <Card variant="default" style={{ marginHorizontal: 16, marginTop: 16, paddingBottom: 8 }}>
      <View style={styles.header}>
        <View>
          <Text style={cx(styles.title, { color: theme.text900 })}>分类统计</Text>
          <Text style={cx(styles.sub, { color: theme.text500 })}>
            {mode === 'expense' ? '支出分布' : '收入来源'} · 共 {data.length} 类
          </Text>
        </View>
        <View style={{ width: 160 }}>
          <SegmentedControl
            variant="income-expense"
            options={[
              { key: 'expense', label: '支出', value: 'expense' },
              { key: 'income',  label: '收入', value: 'income'  },
            ]}
            value={mode}
            onChange={onModeChange}
          />
        </View>
      </View>

      {totalAmount > 0 ? (
        <View style={styles.chartWrap}>
          <View>
            <PieChart
              data={chartData}
              width={cardWidth * 0.55}
              height={180}
              chartConfig={{
                color: (opacity = 1) => `rgba(0,0,0,${opacity})`,
              }}
              accessor="population"
              backgroundColor="transparent"
              paddingLeft="0"
              absolute={false}
              hasLegend={false}
              center={[cardWidth * 0.27, 0]}   // 居中偏移
              avoidFalseZero
            />
            {/* 中心"甜甜圈"覆盖层：放总金额 */}
            <View pointerEvents="none" style={styles.centerLabel}>
              <Text style={[styles.centerTitle, { color: theme.text500 }]}>
                {mode === 'expense' ? '总支出' : '总收入'}
              </Text>
              <AnimatedNumber
                style={[styles.centerAmount, { color: mode === 'expense' ? theme.danger : theme.success }]}
                numberOfLines={1}
                adjustsFontSizeToFit
                value={totalAmount}
                format={(v) => formatAmount(Math.round(v))}
              />
            </View>
          </View>

          {/* Top 5 图例（右侧可滚动） */}
          <View style={styles.legendWrap}>
            {data.slice(0, 5).map((item) => (
              <PressableScale
                key={item.categoryId || item.categoryName}
                scaleTo={0.97}
                style={styles.legendItem}
                onPress={() => onLegendItemPress?.(item)}
              >
                <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                <MaterialCommunityIcons name={item.categoryIcon || 'circle-medium'} size={14} color={theme.text700} style={{ marginRight: 4 }} />
                <Text style={[styles.legendName, { color: theme.text700 }]} numberOfLines={1}>
                  {item.categoryName}
                </Text>
                <View style={{ flex: 1 }} />
                <Text style={[styles.legendPct, { color: theme.text500 }]}>{item.percent}%</Text>
                <Text style={[styles.legendAmt, { color: theme.text900, marginLeft: 8 }]} numberOfLines={1}>
                  {formatAmount(item.amount, { prefix: '', decimals: 0 })}
                </Text>
              </PressableScale>
            ))}
          </View>
        </View>
      ) : (
        <EmptyState
          variant="no-data"
          description="这个时段还没有收支数据"
          iconSize={60}
        />
      )}
    </Card>
  );
}

const useStyles = makeStyles((theme) => ({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4,
  },
  title: { fontSize: 16, fontWeight: '700' },
  sub:   { fontSize: 12, marginTop: 2 },
  chartWrap: {
    flexDirection: 'row', alignItems: 'center', marginTop: 4,
  },
  centerLabel: {
    position: 'absolute',
    top: '50%', left: '27%',
    transform: [{ translateX: -50 }, { translateY: -30 }],
    alignItems: 'center', justifyContent: 'center',
    width: 100, height: 60,
  },
  centerTitle:  { fontSize: 11 },
  centerAmount: { fontSize: 18, fontWeight: '800', marginTop: 2 },
  legendWrap: {
    flex: 1, marginLeft: 8, paddingLeft: 4,
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 6, paddingRight: 4,
  },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  legendName: { fontSize: 12, maxWidth: 80 },
  legendPct:  { fontSize: 11, fontWeight: '600' },
  legendAmt:  { fontSize: 12, fontWeight: '700', maxWidth: 70 },
}));
