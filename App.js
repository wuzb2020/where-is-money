// App 根入口
// 负责：初始化 DB、包裹 Providers（GestureHandler、SafeArea、Reanimated、Toast）
// 不注入任何 mock/演示数据：首启动即为空账本，所有数据来自用户真实记账。

import 'react-native-gesture-handler';
import React from 'react';
import { LogBox, Alert } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';

import AppNavigator from './src/navigation/AppNavigator';
import { ToastRoot } from './src/ui/primitives/Toast';
import { useThemeStore } from './src/store/useThemeStore';
import { useCategoryStore } from './src/store/useCategoryStore';
import { getDB } from './src/core/db';
import { ensureDirs } from './src/core/utils/storage';
import FloatingBubbleRecognizeModal from './src/ui/components/FloatingBubbleRecognizeModal';
import {
  isFloatingBubbleSupported,
  subscribeFloatingBubble,
  consumePendingScreenshot,
} from './src/utils/floatingBubble';

// 屏蔽一些不影响功能的警告
LogBox.ignoreLogs([
  'VirtualizedLists should never be nested',      // 我们做了嵌套 ScrollView + FlatList，且有分页足够 OK
  'Require cycle',                               // navigator ↔ onboarding 之间的循环 require 是故意的
  'Sending `onAnimatedValueUpdate`',             // Reanimated 偶发
  'Non-serializable values were found in the navigation state', // 传了函数回调（编辑模式）
]);

// 保持启动图直到初始化完成
SplashScreen.preventAutoHideAsync();

export default function App() {
  const [ready, setReady] = React.useState(false);
  const [showOnboarding, setShowOnboarding] = React.useState(false);
  // 悬浮球识别弹窗状态
  const [fbModalVisible, setFbModalVisible] = React.useState(false);
  const [fbImageUri, setFbImageUri] = React.useState(null);

  // 初始化流程
  React.useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        // 【修改 P1】等待 zustand persist 水合完成：
        // AsyncStorage 读取是异步的，effect 首次执行时 onboardingDone
        // 极可能还是默认 false，会导致老用户重复看引导页
        if (!useThemeStore.persist.hasHydrated()) {
          await new Promise((resolve) => {
            const unsub = useThemeStore.persist.onFinishHydration(() => {
              unsub();
              resolve();
            });
          });
        }
        if (cancelled) return;
        // 水合后从最新 state 读取（不能用 effect 闭包里的旧值）
        const { onboardingDone: done } = useThemeStore.getState();

        // 1. 数据库 + 目录
        await ensureDirs();
        await getDB();

        // 2. 分类列表预加载（Zustand store）
        await useCategoryStore.getState().load(true);

        // 3. 决定是否显示引导页
        setShowOnboarding(!done);

        // 4. 悬浮球冷启动兜底：拉取 App 被杀期间缓存的截图路径
        if (isFloatingBubbleSupported) {
          const pending = await consumePendingScreenshot();
          if (pending) {
            setFbImageUri(pending);
            setFbModalVisible(true);
          }
        }

        setReady(true);
      } catch (e) {
        console.error('[App init] fatal:', e);
        Alert.alert('初始化失败', e.message);
        setReady(true); // 即使失败也放行，避免卡在启动图
      } finally {
        try { await SplashScreen.hideAsync(); } catch {}
      }
    };
    init();
    return () => { cancelled = true; };
  }, []);

  // 悬浮球截图事件：实时唤起识别弹窗
  React.useEffect(() => {
    if (!isFloatingBubbleSupported) return;
    const unsub = subscribeFloatingBubble(
      (uri) => {
        setFbImageUri(uri);
        setFbModalVisible(true);
      },
      (msg) => console.warn('[FloatingBubble]', msg),
    );
    return unsub;
  }, []);

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppNavigator
          showOnboarding={showOnboarding}
          onOnboardingDone={() => setShowOnboarding(false)}
        />
        <ToastRoot />
        <FloatingBubbleRecognizeModal
          visible={fbModalVisible}
          imageUri={fbImageUri}
          onClose={() => { setFbModalVisible(false); setFbImageUri(null); }}
        />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
