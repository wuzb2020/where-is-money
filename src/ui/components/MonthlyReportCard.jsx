import React from 'react';
import { View, Text, ScrollView, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme, makeStyles } from '../themeHelper';
import { formatAmount } from '../../core/utils/amount';
import Button from '../primitives/Button';
import AnimatedNumber from '../primitives/AnimatedNumber';
import ProgressBar from '../primitives/ProgressBar';

/**
 * 月度报告卡片（每月 1 号首次进入首页弹出的那份）
 * 支持「保存为图片」的视觉优化
 */
export default function MonthlyReportCard({
  report,
  onClose, onSave,
}) {
  const { theme, width } = useAppTheme();
  const styles = useStyles();
  const cardWidth = Math.min(width - 56, 420);

  const deltaFlag = (delta, goodWhenDown) => {
    if (delta.trend === 'flat') return { text: '持平', color: theme.text500, icon: 'minus' };
    const good = goodWhenDown ? (delta.trend === 'down') : (delta.trend === 'up');
    return {
      text: `${good ? '↓' : '↑'} ${delta.percent}%`,
      color: good ? theme.success : theme.warning,
      icon: good ? 'trending-down' : 'trending-up',
    };
  };

  const expDelta = deltaFlag(report.expenseDelta, true);
  const incDelta = deltaFlag(report.incomeDelta, false);

  return (
    <View style={{ alignItems: 'center' }}>
      <LinearGradient
        colors={theme.primaryGradient}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={[styles.card, { width: cardWidth }]}
      >
        <View style={styles.headerBadge}>
          <MaterialCommunityIcons name="chart-box-outline" size={16} color="#fff" />
          <Text style={styles.headerBadgeText}>
            {report.year}年{report.month}月 · 账单报告
          </Text>
        </View>

        <Text style={styles.helloTitle}>Hi，你的月度小结 ✨</Text>

        {/* 收支结余汇总 */}
        <View style={styles.summaryRow}>
          <View style={styles.cell}>
            <Text style={styles.cellLabel}>本月收入</Text>
            <AnimatedNumber
              style={styles.cellValue}
              value={report.income}
              format={(v) => formatAmount(Math.round(v), { prefix: '¥' })}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
              <MaterialCommunityIcons name={incDelta.icon} size={12} color={incDelta.color} />
              <Text style={[styles.cellDelta, { color: incDelta.color }]}>{incDelta.text}</Text>
              <Text style={styles.cellSub}>环比上月</Text>
            </View>
          </View>
          <View style={styles.divider} />
          <View style={styles.cell}>
            <Text style={styles.cellLabel}>本月支出</Text>
            <AnimatedNumber
              style={[styles.cellValue, { color: '#FECACA' }]}
              value={report.expense}
              format={(v) => formatAmount(Math.round(v), { prefix: '¥' })}
            />
            <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 2 }}>
              <MaterialCommunityIcons name={expDelta.icon} size={12} color={expDelta.color === theme.success ? '#86EFAC' : '#FCD34D'} />
              <Text style={[styles.cellDelta, { color: expDelta.color === theme.success ? '#86EFAC' : '#FCD34D' }]}>{expDelta.text}</Text>
              <Text style={[styles.cellSub, { color: 'rgba(255,255,255,0.6)' }]}>环比上月</Text>
            </View>
          </View>
        </View>

        <View style={styles.balanceRow}>
          <Text style={styles.balanceLabel}>本月结余</Text>
          <AnimatedNumber
            style={[styles.balanceValue, { color: report.balance >= 0 ? '#86EFAC' : '#FCA5A5' }]}
            value={report.balance}
            format={(v) => formatAmount(Math.round(v), { prefix: '¥', showSign: true })}
          />
        </View>

        <ScrollView style={{ maxHeight: 220 }} showsVerticalScrollIndicator={false}>
          {/* Top 支出 */}
          {report.maxExpense ? (
            <View style={styles.statBlock}>
              <MaterialCommunityIcons name="cash-multiple" size={16} color="#FDE68A" />
              <Text style={styles.statText}>
                最大支出：
                <Text style={{ fontWeight: '800' }}>
                  {report.maxExpense.categoryName} {formatAmount(report.maxExpense.amount, { prefix: ' ¥' })}
                </Text>
              </Text>
            </View>
          ) : null}

          {report.takeawaySpend > 0 ? (
            <View style={styles.statBlock}>
              <MaterialCommunityIcons name="noodles" size={16} color="#FCA5A5" />
              <Text style={styles.statText}>
                外卖花费：
                <Text style={{ fontWeight: '800' }}>{formatAmount(report.takeawaySpend, { prefix: ' ¥' })}</Text>
                ，要多做饭哦～
              </Text>
            </View>
          ) : null}

          <View style={styles.statBlock}>
            <MaterialCommunityIcons name="notebook-check-outline" size={16} color="#93C5FD" />
            <Text style={styles.statText}>
              本月共记账
              <Text style={{ fontWeight: '800' }}> {report.txCount} </Text>
              笔
            </Text>
          </View>

          {/* Top3 支出分类 */}
          {report.topExpenseCats && report.topExpenseCats.length > 0 ? (
            <View style={{ marginTop: 12 }}>
              <Text style={styles.sectionHeader}>TOP 支出分类</Text>
              {report.topExpenseCats.map((c, i) => (
                <View key={c.categoryId || i} style={styles.barRow}>
                  <MaterialCommunityIcons name={c.categoryIcon || 'circle'} size={14} color={c.color} />
                  <Text style={styles.barLabel} numberOfLines={1}>{c.categoryName}</Text>
                  <View style={[styles.barTrack, { flex: 1 }]}>
                  <ProgressBar
                    progress={c.percent / 100}
                    height={6}
                    color={c.color}
                    trackColor="rgba(255,255,255,0.15)"
                  />
                </View>
                  <Text style={styles.barPercent}>{c.percent}%</Text>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.footerMsg}>
          <MaterialCommunityIcons name="party-popper" size={14} color="#FDE68A" />
          <Text style={styles.footerMsgText}>
            坚持记账，你已经超越了 78% 的用户！
          </Text>
        </View>
      </LinearGradient>

      {/* 底部按钮 */}
      <View style={{ flexDirection: 'row', marginTop: 20, gap: 12, width: cardWidth }}>
        <Button size="lg" variant="outline" style={{ flex: 1, borderColor: theme.primary }} onPress={onSave}>
          保存图片
        </Button>
        <Button size="lg" variant="primary" style={{ flex: 1 }} onPress={onClose}>
          知道了
        </Button>
      </View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  card: {
    borderRadius: 24, padding: 22,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 10 }, shadowOpacity: 0.4, shadowRadius: 24,
    elevation: 8,
  },
  headerBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999,
    gap: 4,
  },
  headerBadgeText: { color: '#fff', fontSize: 12, fontWeight: '600' },
  helloTitle: {
    color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 14, marginBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255,255,255,0.12)',
    borderRadius: 16, padding: 14,
  },
  cell: { flex: 1 },
  divider: { width: 1, backgroundColor: 'rgba(255,255,255,0.2)', marginHorizontal: 10 },
  cellLabel: { color: 'rgba(255,255,255,0.75)', fontSize: 12 },
  cellValue: { color: '#fff', fontSize: 20, fontWeight: '800', marginTop: 2 },
  cellDelta: { fontSize: 11, fontWeight: '700', marginLeft: 2, marginRight: 4 },
  cellSub:   { color: 'rgba(255,255,255,0.5)', fontSize: 10 },
  balanceRow: {
    marginTop: 14, marginBottom: 4,
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 4,
  },
  balanceLabel: { color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '700' },
  balanceValue: { fontSize: 26, fontWeight: '900' },
  statBlock: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 10, gap: 6,
  },
  statText: { color: 'rgba(255,255,255,0.92)', fontSize: 13, flex: 1 },
  sectionHeader: { color: 'rgba(255,255,255,0.75)', fontSize: 11, fontWeight: '700', marginBottom: 6 },
  barRow: {
    flexDirection: 'row', alignItems: 'center',
    marginTop: 6, gap: 8,
  },
  barLabel:   { color: '#fff', fontSize: 12, width: 54, fontWeight: '600' },
  barTrack:   { height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.15)' },
  barFill:    { height: 6, borderRadius: 3 },
  barPercent: { color: '#fff', fontSize: 11, fontWeight: '700', width: 34, textAlign: 'right' },
  footerMsg: {
    marginTop: 16, alignSelf: 'center',
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
    paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 999,
    gap: 6,
  },
  footerMsgText: { color: '#fff', fontSize: 12, fontWeight: '600' },
}));
