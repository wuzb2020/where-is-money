// 统一开关：拇指弹簧滑动 + 轨道变色 + 切换触觉
import React, { useEffect } from 'react';
import { Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  useDerivedValue,
  interpolateColor,
} from 'react-native-reanimated';
import { useAppTheme, makeStyles } from '../themeHelper';
import * as Haptic from '../../core/utils/haptics';

const TRACK_W = 50;
const TRACK_H = 28;
const THUMB = 22;
const PAD = 3;
const TRAVEL = TRACK_W - THUMB - PAD * 2;

export default function Switch({ value, onValueChange, disabled = false }) {
  const { theme } = useAppTheme();
  const styles = useStyles();
  const progress = useSharedValue(value ? 1 : 0);

  useEffect(() => {
    progress.value = withSpring(value ? 1 : 0, { damping: 20, stiffness: 320 });
  }, [value, progress]);

  const trackColor = useDerivedValue(() =>
    interpolateColor(progress.value, [0, 1], [theme.divider, theme.primary]),
  );

  const trackStyle = useAnimatedStyle(() => ({
    backgroundColor: trackColor.value,
    opacity: disabled ? 0.5 : 1,
  }));
  const thumbStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: PAD + progress.value * TRAVEL }],
  }));

  return (
    <Pressable
      accessibilityRole="switch"
      accessibilityState={{ checked: !!value, disabled }}
      disabled={disabled}
      onPress={async () => {
        await Haptic.selectionClick().catch(() => {});
        onValueChange?.(!value);
      }}
      style={styles.hit}
    >
      <Animated.View style={[styles.track, trackStyle]}>
        <Animated.View style={[styles.thumb, thumbStyle]} />
      </Animated.View>
    </Pressable>
  );
}

const useStyles = makeStyles((t) => ({
  hit: { padding: 4 },
  track: {
    width: TRACK_W,
    height: TRACK_H,
    borderRadius: TRACK_H / 2,
    justifyContent: 'center',
  },
  thumb: {
    position: 'absolute',
    width: THUMB,
    height: THUMB,
    borderRadius: THUMB / 2,
    backgroundColor: '#fff',
    shadowColor: t.shadow,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
}));
