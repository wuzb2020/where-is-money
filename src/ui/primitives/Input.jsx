import React from 'react';
import { View, TextInput, Text } from 'react-native';
import { useAppTheme, makeStyles, cx } from '../themeHelper';

/**
 * 文本输入框
 * props: label? placeholder value onChangeText
 *   multiline? error? leftAccessory? rightAccessory?
 */
export default function Input({
  label, placeholder, value, onChangeText, onBlur, onFocus,
  multiline = false, error,
  leftAccessory, rightAccessory,
  inputStyle, containerStyle, labelStyle,
  keyboardType, maxLength, editable = true,
  textAlign, returnKeyType, onSubmitEditing,
  secureTextEntry, autoFocus, placeholderTextColor,
}) {
  const { theme } = useAppTheme();
  const styles = useStyles();
  const [focused, setFocused] = React.useState(false);

  const borderColor = error
    ? theme.danger
    : focused ? theme.primary : theme.divider;

  return (
    <View style={cx(styles.container, containerStyle)}>
      {label ? (
        <Text style={cx(styles.label, error && { color: theme.danger }, labelStyle)}>{label}</Text>
      ) : null}
      <View style={cx(styles.wrapper, { borderColor, backgroundColor: theme.inputBg }, !editable && styles.disabled)}>
        {leftAccessory ? <View style={styles.left}>{leftAccessory}</View> : null}
        <TextInput
          style={cx(
            styles.input,
            multiline && { minHeight: 80, textAlignVertical: 'top' },
            textAlign && { textAlign },
            inputStyle,
          )}
          placeholder={placeholder}
          placeholderTextColor={placeholderTextColor || theme.text500}
          value={value}
          onChangeText={onChangeText}
          onFocus={(e) => { setFocused(true); onFocus?.(e); }}
          onBlur={(e) => { setFocused(false); onBlur?.(e); }}
          multiline={multiline}
          editable={editable}
          keyboardType={keyboardType}
          maxLength={maxLength}
          returnKeyType={returnKeyType}
          onSubmitEditing={onSubmitEditing}
          secureTextEntry={secureTextEntry}
          autoFocus={autoFocus}
          underlineColorAndroid="transparent"
        />
        {rightAccessory ? <View style={styles.right}>{rightAccessory}</View> : null}
      </View>
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((theme) => ({
  container: { marginVertical: 6 },
  label: { fontSize: theme.font.sm, color: theme.text700, fontWeight: '600', marginBottom: 6, marginLeft: 2 },
  wrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: theme.radius.md,
    borderWidth: 1.5,
    minHeight: 48,
    paddingHorizontal: 14,
  },
  disabled: { opacity: 0.6 },
  input: {
    flex: 1,
    color: theme.text900,
    fontSize: theme.font.base,
    paddingVertical: 12,
  },
  left:  { marginRight: 10 },
  right: { marginLeft: 10 },
  errorText: {
    marginTop: 4, marginLeft: 4, fontSize: theme.font.xs, color: theme.danger, fontWeight: '500',
  },
}));
