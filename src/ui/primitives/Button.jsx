import React from 'react';
import { TouchableOpacity, Text, ActivityIndicator, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useAppTheme, makeStyles, cx, usePrimaryGradient } from '../themeHelper';
import * as Haptic from '../../core/utils/haptics';

/**
 * 通用按钮
 * props:
 *   variant: 'primary' | 'secondary' | 'danger' | 'ghost' | 'outline'
 *   size:    'sm' | 'md' | 'lg' | 'full'
 *   icon?:   ReactNode (左侧图标)
 *   disabled? loading? onPress? children
 */
export default function Button({
  variant = 'primary', size = 'md', icon, disabled, loading,
  onPress, onPressIn, children, style, textStyle,
}) {
  const { theme } = useAppTheme();
  const styles = useStyles();
  const primaryGradient = usePrimaryGradient();

  const handlePress = async (...args) => {
    if (disabled || loading) return;
    await Haptic.impactLight();
    onPress?.(...args);
  };

  const sizeStyle = {
    sm: styles.btnSm,
    md: styles.btnMd,
    lg: styles.btnLg,
    full: [styles.btnLg, { width: '100%' }],
  }[size];

  const content = (
    <View style={cx(styles.content, sizeStyle)} pointerEvents="none">
      {loading ? (
        <ActivityIndicator size="small" color={variant === 'ghost' || variant === 'outline' ? theme.primary : '#fff'} />
      ) : (
        <>
          {icon ? <View style={styles.icon}>{icon}</View> : null}
          <Text style={cx(
            styles.text,
            variant === 'primary' && styles.textWhite,
            variant === 'secondary' && styles.textOnCard,
            variant === 'danger' && styles.textWhite,
            variant === 'outline' && { color: theme.primary },
            variant === 'ghost' && { color: theme.primary },
            size === 'sm' && styles.textSm,
            textStyle,
          )}>
            {children}
          </Text>
        </>
      )}
    </View>
  );

  let bg = null;
  if (variant === 'primary') {
    return (
      <TouchableOpacity
        activeOpacity={0.85}
        disabled={disabled || loading}
        onPress={handlePress}
        onPressIn={onPressIn}
        style={cx(disabled && { opacity: 0.5 }, style)}
      >
        <LinearGradient
          colors={primaryGradient}
          start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
          style={cx(styles.base, styles.shadowRaised, sizeStyle, disabled && { opacity: 0.7 })}
        >
          {content}
        </LinearGradient>
      </TouchableOpacity>
    );
  }

  switch (variant) {
    case 'secondary':
      bg = { backgroundColor: theme.bgCard, borderWidth: 1, borderColor: theme.divider };
      break;
    case 'danger':
      bg = { backgroundColor: theme.danger, ...styles.shadowRaised };
      break;
    case 'outline':
      bg = { backgroundColor: 'transparent', borderWidth: 1.5, borderColor: theme.primary };
      break;
    case 'ghost':
    default:
      bg = { backgroundColor: 'transparent' };
      break;
  }

  return (
    <TouchableOpacity
      activeOpacity={variant === 'ghost' ? 0.5 : 0.85}
      disabled={disabled || loading}
      onPress={handlePress}
      onPressIn={onPressIn}
      style={cx(styles.base, bg, sizeStyle, disabled && { opacity: 0.5 }, style)}
    >
      {content}
    </TouchableOpacity>
  );
}

const useStyles = makeStyles((theme) => ({
  base: {
    borderRadius: theme.radius.button,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  content: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  shadowRaised: {
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.2, shadowRadius: 12,
    elevation: 4,
  },
  btnSm:  { height: 36, paddingHorizontal: 16, borderRadius: 18 },
  btnMd:  { height: 48, paddingHorizontal: 24, borderRadius: 24 },
  btnLg:  { height: 56, paddingHorizontal: 28, borderRadius: 28 },
  icon:   { marginRight: 8 },
  text:   { fontWeight: '700', letterSpacing: 0.2 },
  textWhite: { color: '#fff' },
  textOnCard: { color: theme.text900 },
  textSm: { fontSize: theme.font.sm },
}));
