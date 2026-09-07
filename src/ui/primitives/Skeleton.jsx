import React from 'react';
import { View } from 'react-native';
import { useAppTheme, makeStyles, cx } from '../themeHelper';
import Animated, {
  useSharedValue, useAnimatedStyle, withRepeat, withTiming, Easing,
} from 'react-native-reanimated';

/**
 * 骨架屏（Skeleton Placeholder）
 * variant: 'card-line' | 'card-rect' | 'circle' | 'summary' | 'chart'
 */
export default function Skeleton({
  variant = 'card-line', width, height, style, lines = 1, gap = 10,
}) {
  const { theme } = useAppTheme();
  const styles = useStyles();
  const opacity = useSharedValue(0.35);

  React.useEffect(() => {
    opacity.value = withRepeat(
      withTiming(1, { duration: 800, easing: Easing.inOut(Easing.ease) }),
      -1, true,
    );
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  if (variant === 'summary') {
    return (
      <View style={cx(styles.summaryWrap, style)}>
        {[0,1,2].map((i) => (
          <Animated.View key={i} style={cx(animatedStyle, styles.summaryCard, { backgroundColor: theme.divider, marginHorizontal: 6 })} />
        ))}
      </View>
    );
  }

  if (variant === 'chart') {
    return (
      <Animated.View style={cx(animatedStyle, styles.chart, { backgroundColor: theme.divider }, style)} />
    );
  }

  if (variant === 'list') {
    // 列表多条：头像 + 标题行 + 描述行
    return (
      <View style={cx({ gap }, style)}>
        {Array.from({ length: lines }).map((_, i) => (
          <View key={i} style={styles.listRow}>
            <Animated.View style={cx(animatedStyle, styles.circle, { backgroundColor: theme.divider, width: 44, height: 44, borderRadius: 22, marginRight: 12 })} />
            <View style={{ flex: 1 }}>
              <Animated.View style={cx(animatedStyle, { height: 14, width: '60%', backgroundColor: theme.divider, borderRadius: 4, marginBottom: 8 })} />
              <Animated.View style={cx(animatedStyle, { height: 10, width: '85%', backgroundColor: theme.divider, borderRadius: 4 })} />
            </View>
            <Animated.View style={cx(animatedStyle, { height: 16, width: 60, backgroundColor: theme.divider, borderRadius: 4, marginLeft: 12 })} />
          </View>
        ))}
      </View>
    );
  }

  // 通用矩形 / 圆 / 线
  const Shape = Animated.View;
  const baseStyle = variant === 'circle'
    ? { width: width || 48, height: height || width || 48, borderRadius: 999, backgroundColor: theme.divider }
    : { width: width || '100%', height: height || 12, borderRadius: 8, backgroundColor: theme.divider };

  return (
    <View style={{ gap }}>
      {Array.from({ length: lines }).map((_, i) => (
        <Shape key={i} style={cx(animatedStyle, baseStyle, style)} />
      ))}
    </View>
  );
}

const useStyles = makeStyles(() => ({
  summaryWrap: { flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 6 },
  summaryCard: { flex: 1, height: 100, borderRadius: 16 },
  chart: { width: '100%', height: 240, borderRadius: 16 },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 6 },
  circle: {},
}));
