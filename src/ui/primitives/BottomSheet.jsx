// 底部弹层：背景渐暗 + 内容弹簧上滑 + 把手下拉关闭
// 替代裸 RN Modal 实现的选择器（日期/分类/菜单统一走它）
import React from 'react';
import { Modal, Pressable, View, Text, StyleSheet } from 'react-native';
import Animated, {
  FadeIn,
  FadeOut,
  SlideInDown,
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme, makeStyles } from '../themeHelper';

export default function BottomSheet({
  visible,
  onClose,
  title,
  children,
  contentStyle,
}) {
  const { theme } = useAppTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  const dragY = useSharedValue(0);

  // 仅挂在把手区域：向下拖超过阈值或快速甩动即关闭，避免与内部滚轮/列表手势冲突
  const pan = Gesture.Pan()
    .activeOffsetY(10)
    .onUpdate((e) => {
      if (e.translationY > 0) dragY.value = e.translationY;
    })
    .onEnd((e) => {
      if (e.translationY > 120 || e.velocityY > 700) {
        dragY.value = withTiming(900, { duration: 180 });
        onClose?.();
      } else {
        dragY.value = withSpring(0, { damping: 20, stiffness: 300 });
      }
    });

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: dragY.value }],
  }));

  if (!visible) return null;

  return (
    <Modal
      transparent
      visible={visible}
      animationType="none"
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <Animated.View
        entering={FadeIn.duration(220)}
        exiting={FadeOut.duration(180)}
        style={styles.mask}
      >
        <Pressable style={styles.backdrop} onPress={onClose} />
        <GestureDetector gesture={pan}>
          <Animated.View
            entering={SlideInDown.springify().damping(26).stiffness(280)}
            style={[
              styles.sheet,
              {
                backgroundColor: theme.bgFloating,
                paddingBottom: Math.max(insets.bottom, 12) + 8,
              },
              sheetStyle,
              contentStyle,
            ]}
          >
            <View style={styles.handleArea}>
              <View style={[styles.handle, { backgroundColor: theme.text300 }]} />
            </View>
            {!!title && (
              <Text style={[styles.title, { color: theme.text900 }]}>{title}</Text>
            )}
            {children}
          </Animated.View>
        </GestureDetector>
      </Animated.View>
    </Modal>
  );
}

const useStyles = makeStyles((t) => ({
  mask: { flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.45)' },
  backdrop: { ...StyleSheet.absoluteFillObject },
  sheet: {
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 4,
    shadowColor: t.shadow,
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 16,
  },
  handleArea: { alignItems: 'center', paddingVertical: 10 },
  handle: { width: 40, height: 4, borderRadius: 2 },
  title: {
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 12,
    marginTop: 2,
  },
}));
