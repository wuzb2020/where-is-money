import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme, makeStyles, cx } from '../ui/themeHelper';
import Button from '../ui/primitives/Button';
import * as Haptic from '../core/utils/haptics';
import { useThemeStore } from '../store/useThemeStore';

/**
 * 首次启动引导页（3 页 Swiper）
 * 介绍三种记账录入方式 + 核心功能
 */
const PAGES = [
  {
    key: 'manual',
    title: '3 秒记一笔',
    desc: '不用打字，点击数字键盘+选择分类，就能完成记账。支持「+」键批量记账，超市采购也不怕。',
    icon: 'pencil-outline',
    gradient: ['#6366F1', '#8B5CF6'],
    features: [
      { icon: 'calculator-variant-outline', text: '内置数字键盘 + ¥10/20/50/100/500 快捷金额' },
      { icon: 'tag-multiple-outline', text: '智能记住上次用的分类，不用重选' },
      { icon: 'calendar-outline', text: '默认记「现在」，改日期一键快捷' },
    ],
  },
  {
    key: 'ocr',
    title: '拍照识别账单',
    desc: '外卖截图、支付宝账单、购物小票、工资条——拍一张图，自动识别金额、日期、分类，不手打一个字。',
    icon: 'image-outline',
    gradient: ['#059669', '#34D399'],
    features: [
      { icon: 'camera-outline',       text: '支持拍照或从相册批量选 9 张' },
      { icon: 'text-recognition',     text: '智能识别日期/金额/描述，自动纠错' },
      { icon: 'history',              text: '同一张图识别结果缓存，不重复算' },
    ],
  },
  {
    key: 'file',
    title: 'Excel/Word 一键导入',
    desc: '旧账本转过来？Excel 表格导出？Word 文字记录？导入即完成，还能记住表头模板，下次秒对齐。',
    icon: 'file-upload-outline',
    gradient: ['#DC2626', '#F87171'],
    features: [
      { icon: 'microsoft-excel',     text: '支持 .xlsx / .xls / .docx 三大格式' },
      { icon: 'brain',               text: '智能猜表头含义 + 用户调整后自动学习' },
      { icon: 'alert-check-outline', text: '疑似重复自动标注，一键跳过不误导' },
    ],
  },
];

export default function OnboardingScreen({ onDone }) {
  const { theme, width, height, insets } = useAppTheme();
  const styles = useStyles();
  const setDone = useThemeStore((s) => s.setOnboardingDone);

  const [idx, setIdx] = React.useState(0);
  const flatRef = React.useRef(null);
  const page = PAGES[idx];

  const goNext = () => {
    if (idx < PAGES.length - 1) {
      setIdx(idx + 1);
      // flatRef 挂在横向分页 ScrollView 上，用 scrollTo 按页宽翻页
      flatRef.current?.scrollTo?.({ x: (idx + 1) * width, animated: true });
    } else {
      setDone(true);
      onDone?.();
    }
  };
  const goSkip = () => {
    setDone(true);
    onDone?.();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0F172A' }} edges={['top']}>
      {/* 背景渐变（整页） */}
      <LinearGradient
        colors={page.gradient}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={{ position: 'absolute', top: 0, left: 0, right: 0, height: height * 0.55, opacity: 0.95 }}
      />
      <View style={{ position: 'absolute', top: height * 0.4, left: 0, right: 0, bottom: 0, backgroundColor: theme.bgPage }} />

      {/* 顶部跳过 */}
      <View style={{ flexDirection: 'row', justifyContent: 'flex-end', paddingHorizontal: 16, paddingTop: 10 }}>
        <TouchableOpacity activeOpacity={0.6} onPress={goSkip}>
          <Text style={{ color: 'rgba(255,255,255,0.9)', fontSize: 14, fontWeight: '600', padding: 8 }}>
            跳过 →
          </Text>
        </TouchableOpacity>
      </View>

      {/* 页面 Swiper（支持手势横滑） */}
      <ScrollView
        ref={flatRef}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        scrollEventThrottle={16}
        onMomentumScrollEnd={(e) => {
          const newIdx = Math.round(e.nativeEvent.contentOffset.x / width);
          if (newIdx !== idx) {
            setIdx(newIdx);
            Haptic.selectionClick();
          }
        }}
        style={{ flex: 1 }}
      >
        {PAGES.map((p, i) => (
          <View key={p.key} style={{ width, flex: 1 }}>
            {/* 上半：大图标 */}
            <View style={styles.iconHeroArea}>
              <View style={styles.iconHeroBubble}>
                <MaterialCommunityIcons name={p.icon} size={96} color="#fff" />
              </View>
            </View>
            {/* 下半：文字卡片 */}
            <View style={{ paddingHorizontal: 24 }}>
              <View style={[styles.textCard, { backgroundColor: theme.bgCard }]}>
                <View style={[styles.typeBadge, { backgroundColor: p.gradient[0] + '22' }]}>
                  <Text style={[styles.typeBadgeText, { color: p.gradient[0] }]}>
                    STEP 0{i + 1} / 0{PAGES.length}
                  </Text>
                </View>
                <Text style={[styles.pageTitle, { color: theme.text900 }]}>{p.title}</Text>
                <Text style={[styles.pageDesc, { color: theme.text500 }]}>{p.desc}</Text>

                <View style={{ marginTop: 14, gap: 10 }}>
                  {p.features.map((f) => (
                    <View key={f.text} style={{ flexDirection: 'row', alignItems: 'flex-start' }}>
                      <View style={[styles.featIcon, { backgroundColor: p.gradient[0] + '18' }]}>
                        <MaterialCommunityIcons name={f.icon} size={16} color={p.gradient[0]} />
                      </View>
                      <Text style={[styles.featText, { color: theme.text700, flex: 1, marginLeft: 10, lineHeight: 20 }]}>
                        {f.text}
                      </Text>
                    </View>
                  ))}
                </View>
              </View>
            </View>
          </View>
        ))}
      </ScrollView>

      {/* 底部指示 + 按钮 */}
      <View style={[styles.footer, { paddingBottom: insets.bottom + 16 }]}>
        <View style={styles.dots}>
          {PAGES.map((_, i) => (
            <View
              key={i}
              style={[
                styles.dot,
                { backgroundColor: i === idx ? page.gradient[0] : theme.divider,
                  width: i === idx ? 28 : 8 },
              ]}
            />
          ))}
        </View>
        <Button
          size="full"
          onPress={goNext}
        >
          {idx === PAGES.length - 1 ? '🎉 立即开始记账' : '下一步 →'}
        </Button>
        <Button
          size="full"
          variant="ghost"
          style={{ marginTop: 6 }}
          onPress={goSkip}
        >
          先看看首页
        </Button>
      </View>
    </SafeAreaView>
  );
}

const useStyles = makeStyles((theme) => ({
  iconHeroArea: {
    height: '44%',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 20,
  },
  iconHeroBubble: {
    width: 160, height: 160, borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 6, borderColor: 'rgba(255,255,255,0.18)',
  },
  textCard: {
    borderRadius: 22,
    padding: 22,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 20,
    elevation: 6,
    marginTop: 20,
  },
  typeBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 999,
    marginBottom: 12,
  },
  typeBadgeText: { fontSize: 12, fontWeight: '800', letterSpacing: 1 },
  pageTitle: { fontSize: 26, fontWeight: '900', marginBottom: 10 },
  pageDesc:  { fontSize: 14, lineHeight: 22, color: theme.text500 },
  featIcon: {
    width: 30, height: 30, borderRadius: 8,
    alignItems: 'center', justifyContent: 'center',
    marginTop: 1,
  },
  featText: { fontSize: 13, fontWeight: '500' },
  footer: {
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  dots: {
    flexDirection: 'row', justifyContent: 'center',
    marginBottom: 16, gap: 6,
  },
  dot: { height: 8, borderRadius: 4 },
}));
