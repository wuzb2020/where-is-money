// 居中确认对话框：替代 Alert，进出场弹簧动画 + 背景渐暗
// 用于不可逆/重要操作的二次确认（清空数据、放弃编辑、删除分类等）
import React from 'react';
import { Modal, Pressable, View, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, { ZoomIn, ZoomOut } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppTheme, makeStyles } from '../themeHelper';
import Button from './Button';

export default function ConfirmDialog({
  visible,
  icon = 'help-circle-outline',
  iconColor,
  title,
  message,
  confirmText = '确定',
  cancelText = '取消',
  danger = false,
  loading = false,
  extraAction = null, // { label, onPress, danger } 第三个全宽按钮（如「覆盖恢复」）
  onConfirm,
  onCancel,
}) {
  const { theme } = useAppTheme();
  const styles = useStyles();
  const insets = useSafeAreaInsets();
  if (!visible) return null;

  const accent = iconColor || (danger ? theme.danger : theme.primary);

  return (
    <Modal
      transparent
      visible={visible}
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <Pressable style={styles.mask} onPress={loading ? undefined : onCancel}>
        <Animated.View
          entering={ZoomIn.springify().damping(16).stiffness(240)}
          exiting={ZoomOut.duration(140)}
          style={[styles.card, { backgroundColor: theme.bgFloating, paddingBottom: Math.max(insets.bottom, 16) + 20 }]}
          onStartShouldSetResponder={() => true}
        >
          <View style={[styles.iconBubble, { backgroundColor: danger ? theme.dangerBg : theme.primaryBg }]}>
            <Ionicons name={icon} size={28} color={accent} />
          </View>
          <Text style={[styles.title, { color: theme.text900 }]}>{title}</Text>
          {!!message && (
            <Text style={[styles.message, { color: theme.text500 }]}>{message}</Text>
          )}
          {extraAction ? (
            <Button
              variant={extraAction.danger ? 'outline' : 'ghost'}
              size="sm"
              style={[{ width: '100%', marginBottom: 10 }, extraAction.danger && { borderColor: theme.danger }]}
              disabled={loading}
              onPress={extraAction.onPress}
            >
              <Text style={[
                { fontSize: 13, fontWeight: '600' },
                { color: extraAction.danger ? theme.danger : theme.text500 },
              ]}>
                {extraAction.label}
              </Text>
            </Button>
          ) : null}
          <View style={styles.btnRow}>
            <Button
              variant="ghost"
              style={styles.flex1}
              disabled={loading}
              onPress={onCancel}
            >
              {cancelText}
            </Button>
            <Button
              variant={danger ? 'danger' : 'primary'}
              loading={loading}
              style={styles.flex1}
              onPress={onConfirm}
            >
              {confirmText}
            </Button>
          </View>
        </Animated.View>
      </Pressable>
    </Modal>
  );
}

const useStyles = makeStyles((t) => ({
  mask: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  card: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 20,
    paddingTop: 24,
    paddingHorizontal: 20,
    alignItems: 'center',
    shadowColor: t.shadow,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 12,
  },
  iconBubble: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  title: {
    fontSize: 17,
    fontWeight: '800',
    textAlign: 'center',
    marginBottom: 8,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 20,
  },
  btnRow: { flexDirection: 'row', gap: 10, width: '100%' },
  flex1: { flex: 1 },
}));
