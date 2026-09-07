import React from 'react';
import { View, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import Animated, { FadeInDown } from 'react-native-reanimated';
import PressableScale from '../primitives/PressableScale';
import AnimatedNumber from '../primitives/AnimatedNumber';
import { useAppTheme, makeStyles } from '../themeHelper';
import { formatAmount } from '../../core/utils/amount';

/**
 * 首页三张汇总卡（收入/支出/结余）
 * delta: { percent, trend: 'up'|'down'|'flat' }
 */
export default function SummaryCards({ income, expense, balance, onCardPress }) {
  const { theme, width } = useAppTheme();
  const styles = useStyles();
  const cardWidth = (width - 48) / 3; // 3 张卡，padding 16 + 两张卡间距 8*2 = 48

  const cards = [
    {
      key: 'income', label: '收入', value: income.value, delta: income.delta,
      gradient: ['#059669', '#34D399'],
      iconName: 'trending-up',
      onPress: () => onCardPress?.('income'),
    },
    {
      key: 'expense', label: '支出', value: expense.value, delta: expense.delta,
      gradient: ['#DC2626', '#F87171'],
      iconName: 'trending-down',
      onPress: () => onCardPress?.('expense'),
    },
    {
      key: 'balance', label: '结余', value: balance.value,
      gradient: balance.value >= 0 ? [theme.primary, theme.primaryLight] : ['#B45309', '#F59E0B'],
      iconName: balance.value >= 0 ? 'wallet-outline' : 'credit-card-minus-outline',
      onPress: () => onCardPress?.('balance'),
    },
  ];

  return (
    <View style={styles.row}>
      {cards.map((c, i) => (
        <PressableScale
          key={c.key}
          onPress={c.onPress}
          scaleTo={0.95}
          style={{ width: cardWidth }}
        >
          <Animated.View
            entering={FadeInDown.delay(i * 90).springify().damping(18).stiffness(220)}
          >
            <LinearGradient
              colors={c.gradient}
              start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
              style={styles.card}
            >
              <MaterialCommunityIcons
                name={c.iconName} size={18} color="#fff"
                style={{ backgroundColor: 'rgba(255,255,255,0.18)', padding: 5, borderRadius: 8, overflow: 'hidden' }}
              />
              <Text style={styles.cardLabel}>{c.label}</Text>
              <AnimatedNumber
                style={styles.cardAmount}
                numberOfLines={1}
                adjustsFontSizeToFit
                value={c.value}
                format={(v) =>
                  formatAmount(v, { prefix: '', decimals: c.value >= 1_000_000 ? 0 : 2 })
                }
              />
              {c.delta ? (
                c.delta.trend === 'flat' ? (
                  <Text style={styles.deltaFlat}>持平</Text>
                ) : (
                  <View style={styles.deltaRow}>
                    <Text style={styles.deltaArrow}>
                      {c.key === 'expense'
                        ? (c.delta.trend === 'down' ? '↓' : '↑')
                        : (c.delta.trend === 'up' ? '↑' : '↓')}
                    </Text>
                    <Text style={styles.deltaPercent}>{c.delta.percent}%</Text>
                    <Text style={styles.deltaHint}>
                      {c.key === 'expense'
                        ? (c.delta.trend === 'down' ? '可喜' : '留意')
                        : (c.delta.trend === 'up' ? '增长' : '减少')}
                    </Text>
                  </View>
                )
              ) : null}
            </LinearGradient>
          </Animated.View>
        </PressableScale>
      ))}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  row: {
    flexDirection: 'row', justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 8,
  },
  card: {
    borderRadius: theme.radius.card,
    padding: 14,
    paddingVertical: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.15, shadowRadius: 12,
    elevation: 5,
  },
  cardLabel: { color: 'rgba(255,255,255,0.85)', fontSize: theme.font.xs, marginTop: 8 },
  cardAmount: {
    color: '#fff', fontSize: theme.font.lg, fontWeight: '800',
    marginTop: 2, marginBottom: 4,
  },
  deltaRow: { flexDirection: 'row', alignItems: 'center' },
  deltaArrow:   { color: 'rgba(255,255,255,0.95)', fontSize: theme.font.xs, fontWeight: '800' },
  deltaPercent: { color: '#fff', fontSize: theme.font.xs, fontWeight: '700', marginLeft: 2 },
  deltaHint:    { color: 'rgba(255,255,255,0.80)', fontSize: 10, marginLeft: 4 },
  deltaFlat:    { color: 'rgba(255,255,255,0.80)', fontSize: theme.font.xs },
}));
