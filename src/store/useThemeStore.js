// 主题 / 全局设置 Store
import { create } from 'zustand';
import { persist, createJSONStorage } from 'zustand/middleware';
import AsyncStorage from '@react-native-async-storage/async-storage';
// 【修改】buildTheme 不再在 store getter 中使用，改由 themeHelper.selectTheme 派生

export const useThemeStore = create(
  persist(
    (set, get) => ({
      // 主题方案：blue / warm
      palette: 'blue',
      // darkMode：auto / light / dark
      darkMode: 'auto',
      // 系统深色模式（来自 useColorScheme 的实时值）
      systemDark: false,
      // 快速记账开关（OCR 自动保存）
      quickOcr: true,
      // 每日提醒开关 & 时间
      dailyReminder: { enabled: false, hour: 21, minute: 0 },
      // 本地通知权限
      notificationGranted: false,
      // 是否已显示过引导页
      onboardingDone: false,
      // 首次启动 Mock 数据已注入
      mockInjected: false,
      // 最近使用分类 ID（LRU，最多 4 个）
      recentCategoryIds: [],

      // 【修改 P1】删除 get theme()/get isDark() getter：
      // zustand persist 水合时 merge 为 {...currentState, ...persisted}，
      // 展开会把 getter 求值成静态快照属性，第二次启动起主题/深色模式切换永久失效。
      // 派生逻辑改到 themeHelper 的 selectTheme/selectIsDark 选择器函数中。

      // ====================================
      // Actions
      // ====================================
      setPalette: (palette) => set({ palette }),
      setDarkMode: (darkMode) => set({ darkMode }),
      setSystemDark: (systemDark) => set({ systemDark }),
      setQuickOcr: (quickOcr) => set({ quickOcr }),
      setDailyReminder: (cfg) => set((s) => ({ dailyReminder: { ...s.dailyReminder, ...cfg } })),
      setNotificationGranted: (granted) => set({ notificationGranted: granted }),
      setOnboardingDone: (v = true) => set({ onboardingDone: v }),
      setMockInjected: (v = true) => set({ mockInjected: v }),

      /** 使用分类时，推入「最近使用」LRU（最多 4 个） */
      useCategory: (categoryId) => {
        if (!categoryId) return;
        const ids = get().recentCategoryIds.filter((id) => id !== categoryId);
        ids.unshift(categoryId);
        set({ recentCategoryIds: ids.slice(0, 4) });
      },
    }),
    {
      name: 'qqn-settings',
      storage: createJSONStorage(() => AsyncStorage),
      // 忽略 transient fields
      partialize: (s) => ({
        palette: s.palette,
        darkMode: s.darkMode,
        quickOcr: s.quickOcr,
        dailyReminder: s.dailyReminder,
        onboardingDone: s.onboardingDone,
        recentCategoryIds: s.recentCategoryIds,
        mockInjected: s.mockInjected,
      }),
    },
  ),
);
