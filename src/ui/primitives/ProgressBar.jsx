// 进度条：宽度随 progress(0~1) 平滑动画
import React, { useEffect } from 'react';
import { View } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { useAppTheme, makeStyles } from '../themeHelper';

export default function ProgressBar({
  progress = 0,
  height = 8,
  color,
  trackColor,
  style,
}) {
  const { theme } = useAppTheme();
  const styles = useStyles();
  const w = useSharedValue(Math.max(0, Math.min(1, progress)));

  useEffect(() => {
    w.value = withTiming(Math.max(0, Math.min(1, progress)), {
      duration: 400,
      easing: Easing.out(Easing.cubic),
    });
  }, [progress, w]);

  const fillStyle = useAnimatedStyle(() => ({
    width: `${w.value * 100}%`,
  }));

  return (
    <View
      style={[
        styles.track,
        {
          height,
          borderRadius: height / 2,
          backgroundColor: trackColor || theme.divider,
        },
        style,
      ]}
    >
      <Animated.View
        style={[
          styles.fill,
          {
            height,
            borderRadius: height / 2,
            backgroundColor: color || theme.primary,
          },
          fillStyle,
        ]}
      />
    </View>
  );
}

const useStyles = makeStyles(() => ({
  track: { overflow: 'hidden', width: '100%' },
  fill: { position: 'absolute', left: 0, top: 0 },
}));
