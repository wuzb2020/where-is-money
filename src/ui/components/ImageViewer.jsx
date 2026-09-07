// 全屏图片查看器：双指缩放 / 双击放大 / 单指拖动 / 下滑关闭
import React from 'react';
import { Modal, Pressable, Image, View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  FadeIn,
  FadeOut,
} from 'react-native-reanimated';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

export default function ImageViewer({ uri, onClose }) {
  const insets = useSafeAreaInsets();

  const scale = useSharedValue(1);
  const baseScale = useSharedValue(1);
  const tx = useSharedValue(0);
  const ty = useSharedValue(0);
  const savedTx = useSharedValue(0);
  const savedTy = useSharedValue(0);

  const reset = (animated = true) => {
    const fn = animated ? withSpring : (v) => v;
    scale.value = fn(1, { damping: 18, stiffness: 260 });
    baseScale.value = 1;
    tx.value = fn(0, { damping: 18, stiffness: 260 });
    ty.value = fn(0, { damping: 18, stiffness: 260 });
    savedTx.value = 0;
    savedTy.value = 0;
  };

  const pinch = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = clamp(baseScale.value * e.scale, 0.8, 5);
    })
    .onEnd(() => {
      if (scale.value < 1) {
        reset();
      } else {
        baseScale.value = scale.value;
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1.2) {
        reset();
      } else {
        scale.value = withSpring(2.2, { damping: 18, stiffness: 260 });
        baseScale.value = 2.2;
        savedTx.value = 0;
        savedTy.value = 0;
        tx.value = withSpring(0);
        ty.value = withSpring(0);
      }
    });

  const pan = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value > 1.2) {
        // 放大状态：拖动平移
        tx.value = savedTx.value + e.translationX;
        ty.value = savedTy.value + e.translationY;
      } else {
        // 未放大：下滑跟随，用于关闭手势
        ty.value = Math.max(0, e.translationY);
      }
    })
    .onEnd((e) => {
      if (scale.value <= 1.2) {
        if (e.translationY > 140 || e.velocityY > 600) {
          ty.value = withTiming(900, { duration: 180 });
          onClose?.();
        } else {
          ty.value = withSpring(0, { damping: 18, stiffness: 260 });
        }
      } else {
        savedTx.value = clamp(tx.value, -200, 200);
        savedTy.value = clamp(ty.value, -300, 300);
        tx.value = withSpring(savedTx.value, { damping: 20, stiffness: 300 });
        ty.value = withSpring(savedTy.value, { damping: 20, stiffness: 300 });
      }
    });

  const composed = Gesture.Race(doubleTap, Gesture.Simultaneous(pinch, pan));

  const imgStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: tx.value },
      { translateY: ty.value },
      { scale: scale.value },
    ],
  }));
  const bgStyle = useAnimatedStyle(() => ({
    opacity: scale.value > 1.2 ? 1 : 1 - Math.min(1, Math.abs(ty.value) / 400) * 0.75,
  }));

  return (
    <Modal transparent visible={!!uri} animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Animated.View style={[StyleSheet.absoluteFill, styles.bg, bgStyle]} />
      <GestureDetector gesture={composed}>
        <Animated.View style={styles.container}>
          <Animated.Image
            source={{ uri }}
            style={[styles.img, imgStyle]}
            resizeMode="contain"
            entering={FadeIn.duration(180)}
            exiting={FadeOut.duration(150)}
          />
        </Animated.View>
      </GestureDetector>
      <Pressable
        style={[styles.closeBtn, { top: insets.top + 8 }]}
        onPress={onClose}
        hitSlop={12}
      >
        <Ionicons name="close" size={24} color="#fff" />
      </Pressable>
      <View style={[styles.hint, { bottom: insets.bottom + 16 }]}>
        <Text style={styles.hintText}>双击放大 · 双指缩放 · 下滑关闭</Text>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  bg: { backgroundColor: '#000' },
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  img: { width: '100%', height: '100%' },
  closeBtn: {
    position: 'absolute',
    right: 16,
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: { position: 'absolute', alignSelf: 'center' },
  hintText: { color: 'rgba(255,255,255,0.65)', fontSize: 12 },
});
