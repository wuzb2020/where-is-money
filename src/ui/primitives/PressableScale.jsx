// 可缩放按压反馈容器：按下缩放到 scaleTo + 轻震动，松手弹簧回弹
// 全站替代裸 TouchableOpacity，保证「100ms 内必有回应」
import React from 'react';
import { Pressable } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptic from '../../core/utils/haptics';

const AnimatedView = Animated.View;

export default function PressableScale({
  children,
  onPress,
  style,
  scaleTo = 0.96,
  haptic = 'light', // 'light' | 'medium' | 'none'
  disabled = false,
  hitSlop,
}) {
  const scale = useSharedValue(1);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
  }));

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={hitSlop}
      style={style}
      onPressIn={() => {
        scale.value = withSpring(scaleTo, { damping: 18, stiffness: 400 });
      }}
      onPressOut={() => {
        scale.value = withSpring(1, { damping: 18, stiffness: 400 });
      }}
      onPress={async () => {
        if (disabled) return;
        try {
          if (haptic === 'light') await Haptic.impactLight();
          else if (haptic === 'medium') await Haptic.impactMedium();
        } catch (e) { /* 触觉失败静默 */ }
        onPress?.();
      }}
    >
      <AnimatedView style={animatedStyle}>{children}</AnimatedView>
    </Pressable>
  );
}
