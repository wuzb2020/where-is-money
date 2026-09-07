// React Navigation v7 导航结构
// - Root: 条件渲染 Onboarding 或 MainStack
// - MainStack 包含：Home（首页，含底部悬浮三大按钮跳转）+ 其他 Screen + Modal Group（手动记账/识别/导入用 present）
import React from 'react';
import { NavigationContainer, DefaultTheme, DarkTheme } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { useThemeStore } from '../store/useThemeStore';
import { selectIsDark, selectTheme } from '../ui/themeHelper';

import HomeScreen from '../screens/HomeScreen';
import AllRecordsScreen from '../screens/AllRecordsScreen';
import TransactionDetailScreen from '../screens/TransactionDetailScreen';
import SettingsScreen from '../screens/SettingsScreen';
import CategoryManageScreen from '../screens/CategoryManageScreen';
import ManualEntryScreen from '../screens/ManualEntryScreen';
import OcrCaptureScreen from '../screens/OcrCaptureScreen';
import FileImportScreen from '../screens/FileImportScreen';

const MainStack = createNativeStackNavigator();
const RootStack = createNativeStackNavigator();

function MainNavigator() {
  // 【修改】删除 useThemeStore.getState() 非响应式调用（解构出的 theme 从未使用）
  return (
    <MainStack.Navigator
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: 'transparent' },
      }}
    >
      {/* 基础页 */}
      <MainStack.Screen name="Home"        component={HomeScreen} />
      <MainStack.Screen name="AllRecords"  component={AllRecordsScreen} />
      <MainStack.Screen name="TransactionDetail" component={TransactionDetailScreen} />
      <MainStack.Screen name="Settings"       component={SettingsScreen} />
      <MainStack.Screen name="CategoryManage" component={CategoryManageScreen} />

      {/* Modal 弹出：手动记账 */}
      <MainStack.Screen
        name="ManualEntry"
        component={ManualEntryScreen}
        options={{
          presentation: 'formSheet',
          sheetGrabberVisible: false,
          sheetAllowedDetents: 'large',
          sheetExpandsWhenScrollingToEdge: false,
        }}
      />

      {/* OCR / 导入 全屏 Modal（更沉浸） */}
      <MainStack.Screen
        name="OcrCapture"
        component={OcrCaptureScreen}
        options={{
          presentation: 'fullScreenModal',
          animation: 'slide_from_bottom',
        }}
      />
      <MainStack.Screen
        name="FileImport"
        component={FileImportScreen}
        options={{
          presentation: 'fullScreenModal',
          animation: 'slide_from_bottom',
        }}
      />
    </MainStack.Navigator>
  );
}

export default function AppNavigator({ showOnboarding, onOnboardingDone }) {
  // 【修改】isDark/theme 改用响应式选择器（旧代码 s.isDark getter 已失效 + getState() 不订阅）
  const isDark = useThemeStore(selectIsDark);
  const storeTheme = useThemeStore(selectTheme);
  const palette = useThemeStore((s) => s.palette);
  const setSystemDark = useThemeStore((s) => s.setSystemDark);
  const sys = useColorScheme();
  React.useEffect(() => {
    setSystemDark(sys === 'dark');
  }, [sys]);

  const navTheme = React.useMemo(() => {
    const base = isDark ? DarkTheme : DefaultTheme;
    return {
      ...base,
      dark: isDark,
      colors: {
        ...base.colors,
        primary: storeTheme.primary,
        background: storeTheme.bgPage,
        card: storeTheme.bgCard,
        text: storeTheme.text900,
        border: storeTheme.divider,
        notification: storeTheme.primary,
      },
    };
    // 【修改】deps 补上 palette，切换配色方案时导航栏颜色即时刷新
  }, [isDark, palette, storeTheme.primary, storeTheme.bgPage, storeTheme.bgCard, storeTheme.text900, storeTheme.divider]);

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style={isDark ? 'light' : 'dark'} animated />
      {showOnboarding ? (
        // Onboarding 不用 Stack，单独渲染，关闭后切到 Main
        <OnboardingWrapper onDone={onOnboardingDone} />
      ) : (
        <MainNavigator />
      )}
    </NavigationContainer>
  );
}

// Onboarding 作为一个包装（它不是 Navigator 里的 Screen），import 放在这里避免循环
function OnboardingWrapper({ onDone }) {
  const Onboarding = require('../screens/OnboardingScreen').default;
  return <Onboarding onDone={onDone} />;
}
