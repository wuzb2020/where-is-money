import React from 'react';
import { View } from 'react-native';
import { useAppTheme, makeStyles, cx } from '../themeHelper';

/**
 * 卡片容器
 * variant: 'default' | 'raised' | 'flat' | 'gradient'
 * padding: 'none' | 'sm' | 'md' | 'lg'
 */
export default function Card({
  variant = 'default', padding = 'md',
  children, style, gradientColors,
}) {
  const { theme } = useAppTheme();
  const styles = useStyles();
  const padStyle = {
    none: null,
    sm: styles.padSm,
    md: styles.padMd,
    lg: styles.padLg,
  }[padding];

  if (variant === 'gradient') {
    const { LinearGradient } = require('expo-linear-gradient');
    return (
      <LinearGradient
        colors={gradientColors || theme.primaryGradient}
        start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}
        style={cx(styles.base, styles.radius, styles.shadowRaised, padStyle, style)}
      >
        {children}
      </LinearGradient>
    );
  }

  const variantStyle =
    variant === 'raised' ? styles.raised :
    variant === 'flat' ? styles.flat : styles.defaultVariant;

  return (
    <View style={cx(styles.base, styles.radius, variantStyle, padStyle, style)}>
      {children}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  base: { overflow: 'hidden' },
  radius: { borderRadius: theme.radius.card },
  defaultVariant: {
    backgroundColor: theme.bgCard,
    shadowColor: theme.shadow,
    shadowOffset: { width: 0, height: 2 }, shadowOpacity: 1, shadowRadius: 8,
    elevation: 2,
  },
  raised: {
    backgroundColor: theme.bgCard,
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.1, shadowRadius: 20,
    elevation: 6,
  },
  flat: {
    backgroundColor: theme.bgCard,
    borderWidth: 1, borderColor: theme.divider,
  },
  shadowRaised: {
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.22, shadowRadius: 18,
    elevation: 6,
  },
  padSm: { padding: 12 },
  padMd: { padding: 16 },
  padLg: { padding: 24 },
}));
