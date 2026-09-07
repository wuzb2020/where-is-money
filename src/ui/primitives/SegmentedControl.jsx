import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { useAppTheme, makeStyles, cx } from '../themeHelper';
import * as Haptic from '../../core/utils/haptics';

/**
 * 分段控制器（Segmented Control）
 * 带弹簧滑动指示器；options: [{ key, label, value }]
 * variant: 'default'（主色滑块） | 'income-expense'（红/绿滑块）
 */
export default function SegmentedControl({
  options, value, onChange,
  variant = 'default',
}) {
  const { theme } = useAppTheme();
  const styles = useStyles();

  const [width, setWidth] = useState(0);
  const segW = width > 0 ? width / options.length : 0;

  const activeIndex = Math.max(0, options.findIndex((o) => o.value === value));

  const sliderX = useSharedValue(0);
  const sliderColor = useSharedValue(theme.primary);

  useEffect(() => {
    if (segW <= 0) return;
    sliderX.value = withSpring(activeIndex * segW, { damping: 22, stiffness: 300 });
  }, [activeIndex, segW, sliderX]);

  useEffect(() => {
    let target = theme.primary;
    if (variant === 'income-expense') {
      target = options[activeIndex]?.value === 'income' ? theme.successBg : theme.dangerBg;
    }
    sliderColor.value = withTiming(target, { duration: 220 });
  }, [activeIndex, variant, theme, sliderColor]); // eslint-disable-line react-hooks/exhaustive-deps

  const sliderStyle = useAnimatedStyle(() => ({
    width: segW || '33%',
    transform: [{ translateX: sliderX.value }],
    backgroundColor: sliderColor.value,
  }));

  return (
    <View
      style={cx(styles.base, { backgroundColor: theme.inputBg })}
      onLayout={(e) => setWidth(e.nativeEvent.layout.width)}
    >
      {width > 0 && (
        <Animated.View style={[styles.slider, sliderStyle]} pointerEvents="none" />
      )}
      {options.map((opt) => {
        const active = opt.value === value;
        let activeText = { color: theme.text900 };
        if (variant === 'income-expense') {
          if (active) {
            activeText = opt.value === 'income'
              ? { color: theme.success }
              : { color: theme.danger };
          }
        } else if (active) {
          activeText = { color: '#fff' };
        }

        return (
          <TouchableOpacity
            key={opt.key}
            activeOpacity={0.7}
            onPress={async () => {
              if (!active) {
                await Haptic.selectionClick();
                onChange(opt.value);
              }
            }}
            style={styles.segment}
          >
            <Text style={cx(styles.label, active && { fontWeight: '800' }, activeText)}>
              {opt.label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  base: {
    flexDirection: 'row',
    borderRadius: theme.radius.full,
    padding: 4,
  },
  slider: {
    position: 'absolute',
    top: 4,
    bottom: 4,
    left: 0,
    borderRadius: theme.radius.full,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  label: { fontSize: theme.font.base, color: theme.text500, fontWeight: '600' },
}));
