// 主题配色 Tokens（两套方案 + 深色模式）
// 所有颜色集中管理，方便切换主题

const basePalette = {
  // 蓝紫方案 A（默认）
  blue: {
    primary: '#6366F1',
    primaryLight: '#818CF8',
    primaryDark: '#4F46E5',
    primaryBg: '#EEF2FF',
    primaryGradient: ['#6366F1', '#8B5CF6'],
  },
  // 暖米方案 B
  warm: {
    primary: '#D97706',
    primaryLight: '#F59E0B',
    primaryDark: '#B45309',
    primaryBg: '#FFFBEB',
    primaryGradient: ['#D97706', '#F59E0B'],
  },
};

const semanticColors = {
  success: '#10B981',
  successLight: '#34D399',
  successBg: '#ECFDF5',
  danger: '#EF4444',
  dangerLight: '#F87171',
  dangerBg: '#FEF2F2',
  warning: '#F59E0B',
  warningLight: '#FBBF24',
  warningBg: '#FFFBEB',
  info: '#3B82F6',
  infoBg: '#EFF6FF',
};

const lightTheme = {
  mode: 'light',
  text900: '#111827',
  text700: '#374151',
  text500: '#6B7280',
  text300: '#D1D5DB',
  bgPage: '#F8FAFC',
  bgCard: '#FFFFFF',
  bgFloating: '#FFFFFF',
  divider: '#F1F5F9',
  inputBg: '#F3F4F6',
  shadow: 'rgba(15, 23, 42, 0.06)',
  shadowStrong: 'rgba(99, 102, 241, 0.18)',
  overlay: 'rgba(15, 23, 42, 0.5)',
};

const darkTheme = {
  mode: 'dark',
  text900: '#F1F5F9',
  text700: '#CBD5E1',
  text500: '#94A3B8',
  text300: '#475569',
  bgPage: '#0F172A',
  bgCard: '#1E293B',
  bgFloating: '#273449',
  divider: '#334155',
  inputBg: '#334155',
  shadow: 'rgba(0, 0, 0, 0.3)',
  shadowStrong: 'rgba(99, 102, 241, 0.35)',
  overlay: 'rgba(0, 0, 0, 0.7)',
};

// 分类饼图配色（12 种，循环使用）
export const categoryColors = [
  '#6366F1', '#10B981', '#F59E0B', '#EF4444',
  '#8B5CF6', '#06B6D4', '#EC4899', '#84CC16',
  '#F97316', '#3B82F6', '#14B8A6', '#A855F7',
];

export function buildTheme(palette = 'blue', darkMode = false) {
  const colors = darkMode ? { ...darkTheme } : { ...lightTheme };
  const palette_ = basePalette[palette] || basePalette.blue;
  return {
    ...colors,
    palette: palette_,
    primary: palette_.primary,
    primaryLight: palette_.primaryLight,
    primaryDark: palette_.primaryDark,
    primaryBg: palette_.primaryBg,
    primaryGradient: palette_.primaryGradient,
    ...semanticColors,
    categoryColors,
    // 圆角
    radius: {
      sm: 8, md: 12, card: 16, lg: 20, button: 24, sheet: 24, full: 999,
    },
    // 间距 (8 的倍数)
    spacing: {
      xs: 4, s: 8, sm: 12, md: 16, lg: 20, xl: 24, xxl: 32, xxxl: 48,
    },
    // 字号
    font: {
      xs: 12, sm: 13, base: 15, md: 16, lg: 18, xl: 20, xxl: 24, huge: 32, display: 48,
    },
  };
}

export const defaultTheme = buildTheme('blue', false);
export default { buildTheme, defaultTheme, categoryColors };
