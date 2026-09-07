import React from 'react';
import { View, Text } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme, makeStyles } from '../themeHelper';
import Button from './Button';

/**
 * 统一空状态组件
 * variant: 'empty' | 'search' | 'error' | 'no-data' | 'ocr-fail'
 */
export default function EmptyState({
  variant = 'empty', title, description,
  actionLabel, onAction,
  iconSize = 80,
}) {
  const { theme, isDark } = useAppTheme();
  const styles = useStyles();

  const preset = {
    empty:     { icon: 'notebook-outline', emoji: '🎒', title: title || '还没有记账记录', desc: description || '点击下方按钮开始记录你的第一笔收支吧！' },
    search:    { icon: 'magnify-close',      emoji: '🔍', title: title || '没找到匹配的记录', desc: description || '换个关键词或筛选条件试试？' },
    error:     { icon: 'alert-circle-outline', emoji: '⚠️', title: title || '加载出错了',     desc: description || '请稍后重试或检查网络（纯离线模式无网络）' },
    'no-data': { icon: 'chart-donut',         emoji: '📭', title: title || '这个时间段还没有数据', desc: description || '换一个时间范围查看吧' },
    'ocr-fail':{ icon: 'image-off-outline',   emoji: '🤔', title: title || '图片没能识别出金额', desc: description || '图片有点模糊？试试更清晰的账单截图，或直接手动输入～' },
  }[variant] || {};

  const iconColor = isDark ? theme.text300 : theme.text500;
  const tintColor = isDark ? theme.text500 : theme.primary;

  return (
    <View style={styles.container}>
      <View style={[styles.iconBubble, { backgroundColor: theme.primaryBg }]}>
        <MaterialCommunityIcons
          name={preset.icon || 'notebook-outline'}
          size={iconSize * 0.55}
          color={tintColor}
        />
      </View>
      <Text style={[styles.emojiBadge]}>{preset.emoji}</Text>
      <Text style={[styles.title, { color: theme.text900 }]}>{preset.title}</Text>
      {preset.desc ? (
        <Text style={[styles.desc, { color: theme.text500 }]}>{preset.desc}</Text>
      ) : null}
      {actionLabel && onAction ? (
        <View style={styles.action}>
          <Button size="md" variant="primary" onPress={onAction}>{actionLabel}</Button>
        </View>
      ) : null}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  container: {
    alignItems: 'center', justifyContent: 'center',
    paddingVertical: 40, paddingHorizontal: 24,
  },
  iconBubble: {
    width: 100, height: 100, borderRadius: 50,
    alignItems: 'center', justifyContent: 'center',
    marginBottom: 16,
  },
  emojiBadge: {
    position: 'absolute', marginTop: 60,
    fontSize: 26, backgroundColor: 'transparent',
  },
  title: { fontSize: 18, fontWeight: '700', marginTop: 18, marginBottom: 6, textAlign: 'center' },
  desc:  { fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: 16 },
  action:{ marginTop: 24, minWidth: 200 },
}));
