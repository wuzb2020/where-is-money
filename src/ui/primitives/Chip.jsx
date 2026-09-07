import React from 'react';
import { TouchableOpacity, Text, View } from 'react-native';
import { useAppTheme, makeStyles, cx } from '../themeHelper';
import * as Haptic from '../../core/utils/haptics';

/**
 * Chip 标签（用于快捷金额、分类筛选）
 * variant: 'default' | 'primary' | 'outline' | 'success' | 'warning' | 'danger'
 * size: 'sm' | 'md'
 * selected?: boolean
 */
export default function Chip({
  label, icon, selected = false,
  variant = 'default', size = 'md',
  onPress, disabled, style, textStyle,
}) {
  const { theme } = useAppTheme();
  const styles = useStyles();
  const sizeStyle = size === 'sm' ? styles.sizeSm : styles.sizeMd;

  const selectedStyle = selected
    ? { backgroundColor: theme.primary, borderColor: theme.primary }
    : null;
  const selectedText = selected ? { color: '#fff', fontWeight: '700' } : null;

  let variantBg = {};
  let variantText = { color: theme.text700 };
  switch (variant) {
    case 'primary':
      variantBg = { backgroundColor: theme.primaryBg, borderColor: theme.primaryLight };
      variantText = { color: theme.primary };
      break;
    case 'outline':
      variantBg = { backgroundColor: 'transparent', borderColor: theme.text300 };
      break;
    case 'success':
      variantBg = { backgroundColor: theme.successBg, borderColor: theme.success };
      variantText = { color: theme.success };
      break;
    // 【修改】补齐 warning variant：导入预览的"疑似重复"胶囊用到，缺失时回退成普通灰底，语义丢失
    case 'warning':
      variantBg = { backgroundColor: theme.warningBg, borderColor: theme.warning };
      variantText = { color: theme.warning };
      break;
    case 'danger':
      variantBg = { backgroundColor: theme.dangerBg, borderColor: theme.dangerLight };
      variantText = { color: theme.danger };
      break;
    default:
      variantBg = { backgroundColor: theme.bgCard, borderColor: theme.divider };
  }

  return (
    <TouchableOpacity
      activeOpacity={0.7}
      disabled={disabled}
      onPress={async (...args) => {
        if (disabled) return;
        await Haptic.selectionClick();
        onPress?.(...args);
      }}
      style={cx(
        styles.base, sizeStyle,
        variantBg, selectedStyle, disabled && { opacity: 0.5 }, style,
      )}
    >
      {icon ? <View style={styles.icon}>{icon}</View> : null}
      <Text style={cx(styles.text, variantText, selectedText, textStyle)}>{label}</Text>
    </TouchableOpacity>
  );
}

const useStyles = makeStyles((theme) => ({
  base: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderRadius: theme.radius.full,
  },
  sizeSm: { paddingHorizontal: 12, paddingVertical: 5 },
  sizeMd: { paddingHorizontal: 16, paddingVertical: 8 },
  icon: { marginRight: 4 },
  text: { fontSize: theme.font.sm, fontWeight: '600' },
}));
