// 所有 UI 组件共用的工具：取当前主题 + 快捷样式创建
import { useThemeStore } from '../store/useThemeStore';
import { StyleSheet, useWindowDimensions, Platform, StatusBar } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { buildTheme } from '../core/constants/theme';

// 【修改 P1】主题派生从 store getter 移到纯函数选择器：
// getter 在 zustand persist 水合 merge 时会被求值成静态快照，导致主题切换失效。
// 选择器每次渲染都从最新 state 实时计算，任何时候都正确。
export const selectIsDark = (s) =>
  s.darkMode === 'auto' ? s.systemDark : s.darkMode === 'dark';
export const selectTheme = (s) => buildTheme(s.palette, selectIsDark(s));

export function useAppTheme() {
  const theme = useThemeStore(selectTheme);
  const palette = useThemeStore((s) => s.palette);
  const isDark = useThemeStore(selectIsDark);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isIos = Platform.OS === 'ios';
  const isAndroid = Platform.OS === 'android';
  const topSafe = Math.max(insets.top, isAndroid ? (StatusBar.currentHeight || 0) : 20);

  return { theme, palette, isDark, width, height, insets, isIos, isAndroid, topSafe };
}

/** 快捷 StyleSheet 创建：传入回调 (theme) => stylesObj */
export function makeStyles(fn) {
  return function useStyles() {
    const { theme } = useAppTheme();
    const raw = fn(theme);
    // 兼容 NativeWind 未安装的情况：用 StyleSheet 缓存一次
    return StyleSheet.create(raw);
  };
}

/** 工具：合并样式（类似 clsx） */
export function cx(...args) {
  const flat = [];
  for (const a of args) {
    if (!a) continue;
    if (Array.isArray(a)) flat.push(...a);
    else flat.push(a);
  }
  return flat;
}

/** 渐变色根据当前 palette 取 */
export function usePrimaryGradient() {
  const { theme } = useAppTheme();
  return theme.primaryGradient;
}
