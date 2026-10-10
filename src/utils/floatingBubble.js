// 悬浮球 JS 封装层（Android 专属）
// 职责：
//  1) 封装 NativeModules.FloatingBubble 的所有 API（平台保护 + Promise 化）
//  2) 统一事件订阅：DeviceEventEmitter 监听 FloatingBubbleScreenshot / Error / Stopped
//  3) 冷启动兜底：App 启动后主动 consumePendingScreenshot 拉取待消费截图
//  4) 启动流程编排：悬浮窗权限 → 通知权限 → startBubble（内部触发 MediaProjection 授权）
import { Platform, NativeModules, DeviceEventEmitter } from 'react-native';

const FB = NativeModules.FloatingBubble;

/** 当前平台是否支持悬浮球（仅 Android 原生 dev/release 构建） */
export const isFloatingBubbleSupported =
  Platform.OS === 'android' && !!FB;

/** 事件名常量 */
export const FB_EVENTS = {
  SCREENSHOT: 'FloatingBubbleScreenshot',
  ERROR: 'FloatingBubbleError',
  STOPPED: 'FloatingBubbleStopped',
};

// ---------------- 权限与状态查询 ----------------

export function hasOverlayPermission() {
  if (!isFloatingBubbleSupported) return Promise.resolve(false);
  return FB.hasOverlayPermission();
}

export function openOverlayPermissionSettings() {
  if (!isFloatingBubbleSupported) return Promise.resolve(false);
  return FB.openOverlayPermissionSettings();
}

export function hasNotificationPermission() {
  if (!isFloatingBubbleSupported) return Promise.resolve(true);
  return FB.hasNotificationPermission();
}

export function isBubbleRunning() {
  if (!isFloatingBubbleSupported) return Promise.resolve(false);
  return FB.isBubbleRunning();
}

// ---------------- 启停 ----------------

/**
 * 启动悬浮球。
 * 前置条件：已授予悬浮窗权限（否则 reject NO_OVERLAY_PERMISSION）。
 * 内部会发起 MediaProjection 系统授权弹窗，用户同意后自动启动前台服务。
 * @returns {Promise<boolean>} true=启动成功，false=用户取消授权
 */
export function startBubble() {
  if (!isFloatingBubbleSupported) {
    return Promise.reject(new Error('当前平台不支持悬浮球'));
  }
  return FB.startBubble();
}

export function stopBubble() {
  if (!isFloatingBubbleSupported) return Promise.resolve(false);
  return FB.stopBubble();
}

/** 拉取并清空待消费的截图路径（冷启动兜底）。返回 string | null */
export function consumePendingScreenshot() {
  if (!isFloatingBubbleSupported) return Promise.resolve(null);
  return FB.consumePendingScreenshot();
}

// ---------------- 事件订阅 ----------------

/**
 * 订阅悬浮球截图事件。
 * @param {(uri: string) => void} onScreenshot
 * @param {(msg: string) => void} [onError]
 * @returns {() => void} 取消订阅函数
 */
export function subscribeFloatingBubble(onScreenshot, onError) {
  if (!isFloatingBubbleSupported) return () => {};

  const subs = [];
  subs.push(
    DeviceEventEmitter.addListener(FB_EVENTS.SCREENSHOT, (payload) => {
      if (payload?.uri) onScreenshot(payload.uri);
    }),
  );
  if (onError) {
    subs.push(
      DeviceEventEmitter.addListener(FB_EVENTS.ERROR, (payload) => {
        onError(payload?.message || '悬浮球发生错误');
      }),
    );
  }
  return () => subs.forEach((s) => s.remove());
}
