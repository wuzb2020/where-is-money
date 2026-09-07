// App 根入口
// 负责：初始化 DB、写 Mock 数据、包裹 Providers（GestureHandler、SafeArea、Reanimated、Toast）

import 'react-native-gesture-handler';
import React from 'react';
import { View, LogBox, Alert, Text } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as SplashScreen from 'expo-splash-screen';

import AppNavigator from './src/navigation/AppNavigator';
import { ToastRoot } from './src/ui/primitives/Toast';
import { useThemeStore } from './src/store/useThemeStore';
import { useCategoryStore } from './src/store/useCategoryStore';
import { useTransactionStore } from './src/store/useTransactionStore';
import { getDB, TransactionDao, CategoryDao } from './src/core/db';
import { ensureDirs } from './src/core/utils/storage';
import { dayjs } from './src/core/utils/date';

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
  const onboardingDone = useThemeStore((s) => s.onboardingDone);
  const mockInjected = useThemeStore((s) => s.mockInjected);
  const setMockInjected = useThemeStore((s) => s.setMockInjected);

  // 初始化流程
  React.useEffect(() => {
    let cancelled = false;
    const init = async () => {
      try {
        // 【修改 P1】等待 zustand persist 水合完成：
        // AsyncStorage 读取是异步的，effect 首次执行时 onboardingDone/mockInjected
        // 极可能还是默认 false，会导致老用户重复看引导页、Mock 标志丢失
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
        const { onboardingDone: done, mockInjected: injected } = useThemeStore.getState();

        // 1. 数据库 + 目录
        await ensureDirs();
        await getDB();

        // 2. 分类列表预加载（Zustand store）
        await useCategoryStore.getState().load(true);

        // 3. 首启动注入 Mock 数据（mockInjected 已持久化，用户清空数据后重启不会再重复注入）
        if (!injected) {
          const cnt = await TransactionDao.count();
          if (cnt === 0) await injectMockData();
          useThemeStore.getState().setMockInjected(true);
        }

        // 4. 决定是否显示引导页
        setShowOnboarding(!done);

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

  if (!ready) return null;

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppNavigator
          showOnboarding={showOnboarding}
          onOnboardingDone={() => setShowOnboarding(false)}
        />
        <ToastRoot />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

/** 首启动 Mock 数据：近 30 天 20 条，覆盖各分类 */
async function injectMockData() {
  const cats = await CategoryDao.listAll();
  const byName = (n, t) => cats.find((c) => c.name === n && c.type === t);

  // 小工具：生成某天的随机时间
  const d = (offsetDay, hour, minute) =>
    dayjs().subtract(offsetDay, 'day').hour(hour).minute(minute).second(0).valueOf();

  const drafts = [
    // 收入
    { date: d(1, 18, 0),  type: 'income',  cat: '工资',   amount: 10970_00, desc: '8月工资（招商银行入账）' },
    { date: d(6, 20, 20), type: 'income',  cat: '红包',   amount:  188_88, desc: '朋友结婚回礼' },
    { date: d(15, 10, 0), type: 'income',  cat: '理财',   amount:  326_50, desc: '余额宝月度收益' },

    // 支出 - 房租
    { date: d(2, 9, 0),   type: 'expense', cat: '房租',   amount: 3000_00, desc: '8月房租 + 物业费 3200 + 水电 150' },
    // 外卖
    { date: d(0, 12, 30), type: 'expense', cat: '外卖',   amount:   38_50, desc: '美团外卖 麻辣香锅双人餐（望京店）' },
    { date: d(1, 19, 10), type: 'expense', cat: '外卖',   amount:   26_80, desc: '饿了么 肯德基疯狂星期四' },
    { date: d(3, 12, 15), type: 'expense', cat: '外卖',   amount:   32_00, desc: '麦当劳麦乐送 巨无霸套餐' },
    { date: d(5, 13, 0),  type: 'expense', cat: '外卖',   amount:   24_50, desc: '美团 沙县小吃' },
    // 网购
    { date: d(4, 20, 0),  type: 'expense', cat: '网购',   amount: 2999_00, desc: '淘宝 vivo官方旗舰店 购 iQOO 5e 手机 8+256G 蓝' },
    { date: d(10, 15, 30),type: 'expense', cat: '网购',   amount:  199_00, desc: '拼多多 蓝牙耳机（平替版）' },
    // 交通
    { date: d(0, 19, 5),  type: 'expense', cat: '交通',   amount:   25_80, desc: '滴滴出行 从公司到家' },
    { date: d(3, 8, 45),  type: 'expense', cat: '交通',   amount:    6_00, desc: '地铁 14号线 阜通-望京南' },
    { date: d(8, 10, 0),  type: 'expense', cat: '交通',   amount:  480_00, desc: '12306 北京→上海 高铁二等座' },
    // 餐饮
    { date: d(6, 21, 0),  type: 'expense', cat: '餐饮',   amount:  60_00, desc: '星巴克 冰美式+抹茶拿铁' },
    { date: d(12, 19, 30),type: 'expense', cat: '餐饮',   amount: 468_00, desc: '海底捞火锅 两人聚餐' },
    // 日用
    { date: d(7, 20, 10), type: 'expense', cat: '日用',   amount:  256_40, desc: '盒马鲜生 周末家庭大采购' },
    // 娱乐
    { date: d(9, 20, 0),  type: 'expense', cat: '娱乐',   amount:  108_00, desc: '猫眼 电影票 2张《奥本海默》' },
    // 通讯
    { date: d(11, 9, 0),  type: 'expense', cat: '通讯',   amount:   99_00, desc: '中国移动 话费充值 99元套餐月费' },
    // 医疗
    { date: d(14, 15, 0), type: 'expense', cat: '医疗',   amount:  156_80, desc: '叮当快药 感冒灵+润喉糖' },
    // 其他
    { date: d(18, 10, 0), type: 'expense', cat: '红包',   amount:  200_00, desc: '同事小王结婚份子钱' },
  ];

  for (const d_ of drafts) {
    const cat = byName(d_.cat, d_.type);
    if (!cat) continue;
    await TransactionDao.create({
      date: d_.date,
      type: d_.type,
      categoryId: cat.id,
      amount: d_.amount,
      description: d_.desc,
      source: 'manual',
      imagePaths: [],
    });
  }

  // 顺便给 store 的「最近使用分类」填几个真实 ID，首页「最近使用」不空
  const wage = byName('工资', 'income');
  const waimai = byName('外卖', 'expense');
  const wanggou = byName('网购', 'expense');
  const jiaotong = byName('交通', 'expense');
  // 【修改】必须走 set/setState 才能触发订阅与持久化，直接赋值属性不会写入 AsyncStorage
  useThemeStore.setState({
    recentCategoryIds: [
      waimai?.id, wanggou?.id, jiaotong?.id, wage?.id,
    ].filter(Boolean),
  });

  return true;
}
