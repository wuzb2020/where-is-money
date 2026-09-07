// 触觉震动反馈封装（iOS/Android 统一）
import * as Haptics from 'expo-haptics';
import { Platform, Vibration } from 'react-native';

/** 轻微点击反馈（按钮按下） */
export async function impactLight() {
  try {
    if (Platform.OS === 'web') return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
  } catch (e) { /* noop */ }
}

/** 中等力度（列表项选中） */
export async function impactMedium() {
  try {
    if (Platform.OS === 'web') return;
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
  } catch (e) { /* noop */ }
}

/** 保存成功反馈 */
export async function notificationSuccess() {
  try {
    if (Platform.OS === 'web') return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  } catch (e) {
    if (Platform.OS === 'android') Vibration.vibrate(50);
  }
}

/** 错误/警告反馈 */
export async function notificationError() {
  try {
    if (Platform.OS === 'web') return;
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  } catch (e) {
    if (Platform.OS === 'android') Vibration.vibrate([0, 50, 50, 50]);
  }
}

/** 选择器滚动选中反馈（iOS 滚轮那种） */
export async function selectionClick() {
  try {
    if (Platform.OS === 'web') return;
    await Haptics.selectionAsync();
  } catch (e) { /* noop */ }
}
