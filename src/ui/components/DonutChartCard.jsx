import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import Card from '../primitives/Card';
import SegmentedControl from '../primitives/SegmentedControl';
import PressableScale from '../primitives/PressableScale';
import AnimatedNumber from '../primitives/AnimatedNumber';
import { useAppTheme, makeStyles } from '../themeHelper';
import { formatAmount } from '../../core/utils/amount';
import EmptyState from '../primitives/EmptyState';

const DONUT_SIZE = 148;
const DONUT_STROKE = 16;

/**
 * 纯 SVG 圆环图：几何位置完全确定，环心叠加总额标签
 * （替代 react-native-chart-kit PieChart，避免其 center 偏移在 web 端错位）
 */
function SvgDonut({ segments, size = DONUT_SIZE, strokeWidth = DONUT_STROKE }) {
  const center = size / 2;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((s, d) => s + d.amount, 0) || 1;

  let acc = 0;
  return (
    <Svg width={size} height={size}>
      <G transform={`rotate(-90, ${center}, ${center})`}>
        {/* 底环 */}
        <Circle
          cx={center} cy={center} r={radius}
          stroke="#F1F2F6" strokeWidth={strokeWidth} fill="none"
        />
        {segments.map((seg, i) => {
          const frac = seg.amount / total;
          const dash = frac * circumference;
          const offset = -acc * circumference;
          acc += frac;
          if (dash <= 0.5) return null; // 极小扇区忽略，避免毛刺
          return (
            <Circle
              key={i}
              cx={center} cy={center} r={radius}
              stroke={seg.color}
              strokeWidth={strokeWidth}
              fill="none"
              strokeDasharray={`${dash} ${circumference - dash}`}
              strokeDashoffset={offset}
            />
          );
        })}
      </G>
    </Svg>
  );
}

/**
 * 分类占比圆环 + Top5 图例（可切换支出/收入维度）
 *
 * expenseData / incomeData:
 *   [{ categoryId, categoryName, categoryIcon, color, amount, percent }]
 */
export default function DonutChartCard({
  expenseData,
  incomeData,
  total,
  mode = 'expense',
  onModeChange,
  onLegendItemPress,
  width,
}) {
  const { theme, width: w } = useAppTheme();
  const styles = useStyles();

  const data = mode === 'expense' ? expenseData : incomeData;
  const totalAmount = data.reduce((s, d) => s + d.amount, 0);
  const segments = data.length ? data : [];

  return (
    <Card variant="default" style={{ marginHorizontal: 16, marginTop: 16, paddingBottom: 16 }}>
      <View style={styles.header}>
        <View>
          <Text style={[styles.title, { color: theme.text900 }]}>分类统计</Text>
          <Text style={[styles.sub, { color: theme.text500 }]}>
            {mode === 'expense' ? '支出分布' : '收入来源'} · 共 {data.length} 类
          </Text>
        </View>
        <View style={{ width: 156 }}>
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
          {/* 圆环 + 中心总额（同一盒子内绝对居中，保证标签恒在环心） */}
          <View style={styles.donutBox}>
            <SvgDonut segments={segments} />
            <View pointerEvents="none" style={StyleSheet.absoluteFill}>
              <View style={styles.centerLabel}>
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
          </View>

          {/* Top 5 图例：名称与比例成组紧贴，金额右对齐成列 */}
          <View style={styles.legendWrap}>
            {data.slice(0, 5).map((item) => {
              const pctText = item.amount > 0 && item.percent < 1
                ? '<1%'
                : `${item.percent}%`;
              return (
                <PressableScale
                  key={item.categoryId || item.categoryName}
                  scaleTo={0.97}
                  style={styles.legendItem}
                  onPress={() => onLegendItemPress?.(item)}
                >
                  <View style={[styles.legendDot, { backgroundColor: item.color }]} />
                  <Text style={[styles.legendName, { color: theme.text700 }]} numberOfLines={1}>
                    {item.categoryName}
                  </Text>
                  <Text style={[styles.legendPct, { color: item.color }]}>{pctText}</Text>
                  <View style={styles.legendSpacer} />
                  <Text style={[styles.legendAmt, { color: theme.text900 }]} numberOfLines={1}>
                    {formatAmount(item.amount, { prefix: '', decimals: 0 })}
                  </Text>
                </PressableScale>
              );
            })}
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

const useStyles = makeStyles(() => ({
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12,
  },
  title: { fontSize: 16, fontWeight: '700' },
  sub:   { fontSize: 12, marginTop: 2 },
  chartWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    // web/宽屏下整卡被拉满会导致图例行内弹簧间距过大：图表区限宽居中，
    // 手机窄屏（约 310px 内容宽）不受影响
    alignSelf: 'center',
    width: '100%',
    maxWidth: 460,
  },
  donutBox: {
    width: DONUT_SIZE,
    height: DONUT_SIZE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerLabel: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
  },
  centerTitle:  { fontSize: 11 },
  centerAmount: { fontSize: 17, fontWeight: '800', marginTop: 2 },
  legendWrap: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 8,
  },
  legendDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  legendName: { fontSize: 13, flexShrink: 1 },
  // 比例紧跟分类名（固定 6px 间距），并用分类色与环图扇区呼应
  legendPct:  { fontSize: 12, fontWeight: '600', marginLeft: 6 },
  legendSpacer: { flex: 1, minWidth: 8 },
  // 金额右对齐成列，视觉上整齐
  legendAmt:  { fontSize: 13, fontWeight: '700', marginLeft: 8, textAlign: 'right', minWidth: 44 },
}));
