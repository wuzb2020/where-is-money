// 可缩放按压反馈容器：按下缩放到 scaleTo + 轻震动，松手弹簧回弹
// 全站替代裸 TouchableOpacity，保证「100ms 内必有回应」
import React from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';
import * as Haptic from '../../core/utils/haptics';

const AnimatedView = Animated.View;

// 决定「本组件在父容器中占据什么盒子」的样式：必须落在外层 Pressable 上，
// 否则调用方传 flex:1 / margin / 绝对定位时，外层不是正确的 flex 子项会塌缩
const OUTER_BOX_KEYS = new Set([
  'flex', 'flexGrow', 'flexShrink', 'flexBasis', 'alignSelf',
  'width', 'height', 'minWidth', 'maxWidth', 'minHeight', 'maxHeight', 'aspectRatio',
  'position', 'top', 'left', 'right', 'bottom', 'start', 'end', 'zIndex',
  'margin', 'marginHorizontal', 'marginVertical',
  'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginStart', 'marginEnd',
]);

// 内层（承载内容）需要排除的键：盒外间距与绝对定位只应由外层承担，
// 否则 margin 双重偏移、内层脱标会导致内容错位
const INNER_EXCLUDE_KEYS = new Set([
  'position', 'top', 'left', 'right', 'bottom', 'start', 'end', 'zIndex',
  'margin', 'marginHorizontal', 'marginVertical',
  'marginTop', 'marginBottom', 'marginLeft', 'marginRight', 'marginStart', 'marginEnd',
]);

function splitStyle(style) {
  // StyleSheet.flatten 可解析注册样式（原生端数字 ID / web 端编译对象）/ 数组 / 内联对象
  const flat = StyleSheet.flatten(style) || {};
  const outer = {};
  const inner = {};
  for (const k of Object.keys(flat)) {
    if (OUTER_BOX_KEYS.has(k)) outer[k] = flat[k];
    if (!INNER_EXCLUDE_KEYS.has(k)) inner[k] = flat[k];
  }
  return [outer, inner];
}

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

  const [outerStyle, innerStyle] = splitStyle(style);

  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      hitSlop={hitSlop}
      style={outerStyle}
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
      {/* 内层承载内容排版与缩放动画；flexDirection/padding 挂在这里才能作用于子元素，
          flex:1 同时让内层填满外层盒子，保证 justifyContent 居中类需求成立 */}
      <AnimatedView style={[innerStyle, animatedStyle]}>{children}</AnimatedView>
    </Pressable>
  );
}
