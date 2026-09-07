import React from 'react';
import { View, Text, Animated as RnAnimated, Dimensions, TouchableOpacity } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAppTheme, makeStyles, cx } from '../themeHelper';
import * as Haptic from '../../core/utils/haptics';

/**
 * 全局单例 Toast（用 Portal 模式实现；在 App 根放一个 <ToastRoot />，
 * 所有页面通过 ToastRef.show() 调用）
 *
 * 用法：
 *   import Toast from './Toast';
 *   Toast.show({ type:'success', message:'已保存', actionLabel:'撤销', onAction:() => {} });
 */

let _setState = null;
let _seq = 0; // 【修改】每次 show 自增的序号，用于触发计时 effect 重跑
const defaultState = {
  visible: false,
  seq: 0,
  type: 'info',          // success / error / warning / info
  message: '',
  duration: 2800,
  actionLabel: null,
  onAction: null,
};

export const Toast = {
  show(opts) {
    if (!_setState) return;
    // 【修改 P1】连续弹两条 Toast 时 visible 始终为 true，旧代码 effect 依赖不变 →
    // 定时器不重置，第二条消息会沿用第一条的剩余时间提前消失。带 seq 强制重跑
    _seq += 1;
    _setState({ ...defaultState, ...opts, visible: true, seq: _seq });
  },
  hide() {
    if (!_setState) return;
    _setState((s) => ({ ...s, visible: false }));
  },
};

// 默认导出 = Toast API 对象（Toast.show / Toast.hide）；
// 根节点挂载的组件请用具名导入：import { ToastRoot } from './Toast'
export default Toast;

export function ToastRoot() {
  const { theme, width } = useAppTheme();
  const styles = useStyles();
  const [state, setStateRaw] = React.useState(defaultState);
  const translateY = React.useRef(new RnAnimated.Value(80)).current;
  const timerRef = React.useRef(null);

  // 暴露给单例 API
  React.useEffect(() => {
    // 【修改】删除原来重复赋值的无效包装（第一行赋值立刻被第二行覆盖）
    _setState = setStateRaw;
    return () => { _setState = null; };
  }, []);

  // 显示/隐藏动画（依赖 seq：每条新消息都重新计时）
  React.useEffect(() => {
    if (state.visible) {
      if (timerRef.current) clearTimeout(timerRef.current);
      RnAnimated.timing(translateY, {
        toValue: 0, duration: 280, useNativeDriver: true,
      }).start();
      timerRef.current = setTimeout(() => {
        RnAnimated.timing(translateY, {
          toValue: 100, duration: 220, useNativeDriver: true,
        }).start(() => setStateRaw((s) => ({ ...s, visible: false })));
      }, state.duration);
    }
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [state.visible, state.duration, state.seq]);

  if (!state.visible) return null;

  const cfg = {
    success: { icon: 'check-circle', bg: theme.successBg, border: theme.success, text: theme.success },
    error:   { icon: 'close-circle', bg: theme.dangerBg,  border: theme.danger,  text: theme.danger },
    warning: { icon: 'alert', bg: theme.warningBg, border: theme.warning, text: theme.warning },
    info:    { icon: 'information', bg: theme.infoBg,    border: theme.info,    text: theme.info },
  }[state.type] || {};

  return (
    <View pointerEvents="box-none" style={styles.overlay}>
      <RnAnimated.View
        style={[
          styles.card,
          {
            transform: [{ translateY }],
            backgroundColor: cfg.bg,
            borderColor: cfg.border,
            borderLeftWidth: 4,
            width: Math.min(width - 24, 520),
          },
        ]}
      >
        <MaterialCommunityIcons name={cfg.icon} size={22} color={cfg.text} style={{ marginRight: 10 }} />
        <Text style={cx(styles.msg, { color: theme.text900 })} numberOfLines={2}>
          {state.message}
        </Text>
        {state.actionLabel && state.onAction ? (
          <TouchableOpacity
            activeOpacity={0.6}
            style={[styles.action, { borderColor: cfg.text }]}
            onPress={async () => {
              await Haptic.impactMedium();
              state.onAction?.();
              Toast.hide();
            }}
          >
            <Text style={[styles.actionText, { color: cfg.text }]}>{state.actionLabel}</Text>
          </TouchableOpacity>
        ) : null}
      </RnAnimated.View>
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  overlay: {
    position: 'absolute', left: 0, right: 0, bottom: 96,
    alignItems: 'center', zIndex: 9999,
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 48,
    paddingHorizontal: 14, paddingVertical: 10,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.12, shadowRadius: 10,
    elevation: 4,
  },
  msg: { flex: 1, fontSize: theme.font.sm, fontWeight: '500', lineHeight: 18 },
  action: {
    marginLeft: 8, paddingHorizontal: 12, paddingVertical: 5,
    borderRadius: theme.radius.full, borderWidth: 1,
  },
  actionText: { fontSize: theme.font.xs, fontWeight: '700' },
}));
