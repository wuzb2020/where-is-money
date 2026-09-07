import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native'; // 【修改】Platform 改为顶部静态 import
import { useAppTheme, makeStyles, cx } from '../themeHelper';
import Chip from './Chip';
import * as Haptic from '../../core/utils/haptics';
import { QUICK_AMOUNTS } from '../../core/constants/categories';
import { sanitizeAmountInput, formatAmountPlain, yuanToFen } from '../../core/utils/amount';

/**
 * 大金额输入器（自带数字键盘 + 快捷金额）
 * 这是手动记账表单的核心组件
 *
 * valueFen: number (分)
 * onChangeFen: (fen: number, yuanStr: string) => void
 * onAdd: () => void  // "+" 按钮：保存并追加下一条
 * onConfirm: () => void
 * showAdd?: boolean
 */
export default function AmountInput({
  valueFen = 0,
  onChangeFen,
  onAdd,
  onConfirm,
  showAdd = false,
}) {
  const { theme } = useAppTheme();
  const styles = useStyles();
  const [yuanStr, setYuanStr] = React.useState(() =>
    valueFen ? formatAmountPlain(valueFen) : '',
  );

  // 外部 valueFen 变化（比如快捷金额点击后外部传新值）
  React.useEffect(() => {
    const current = yuanToFen(parseFloat(yuanStr || '0'));
    if (current !== valueFen) {
      setYuanStr(valueFen ? formatAmountPlain(valueFen) : '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [valueFen]);

  const press = async (text, type) => {
    await Haptic.impactLight();
    let next = yuanStr;
    switch (type) {
      case 'digit':
        next = sanitizeAmountInput(yuanStr + text);
        break;
      case 'dot':
        // 【修改 P1】分支顺序修正：必须先判空串。旧代码先判 includes('.')，
        // 空串时 '' 不含 '.' → next = '' + '.' = '.'，parseFloat('.') 为 NaN，金额永远输不出小数
        if (yuanStr === '') next = '0.';
        else if (!yuanStr.includes('.')) next = yuanStr + '.';
        break;
      case 'back': {
        next = yuanStr.slice(0, -1);
        break;
      }
      case 'clear':
        next = '';
        break;
    }
    setYuanStr(next);
    const fen = next ? yuanToFen(parseFloat(next || '0')) : 0;
    onChangeFen?.(fen, next);
  };

  const displayYuan = yuanStr === '' ? '0.00' : yuanStr;

  // 处理是否有末尾小数点 / 只有一位小数的显示
  const [intPart, decPart] = displayYuan.includes('.')
    ? displayYuan.split('.')
    : [displayYuan, ''];
  const intPartWithComma = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const decDisplay = decPart
    ? `.${decPart}${decPart.length === 1 ? '0' : ''}`
    : yuanStr.includes('.') ? '.' : '.00';
  const isPlaceholder = yuanStr === '';

  return (
    <View style={styles.container}>
      {/* 金额大显示 */}
      <View style={styles.display}>
        <Text style={cx(styles.currency, isPlaceholder && { color: theme.text300 })}>¥</Text>
        <Text style={cx(styles.amountInt, isPlaceholder && { color: theme.text300 })}>
          {intPartWithComma}
        </Text>
        <Text style={cx(styles.amountDec, isPlaceholder && { color: theme.text300 })}>
          {decDisplay}
        </Text>
      </View>

      {/* 快捷金额 Chip 栏 */}
      <View style={styles.quickBar}>
        {QUICK_AMOUNTS.map((v) => (
          <Chip
            key={v}
            label={`¥${v}`}
            variant="primary"
            size="sm"
            onPress={async () => {
              await Haptic.impactLight();
              const fen = yuanToFen(v);
              setYuanStr(String(v));
              onChangeFen?.(fen, String(v));
            }}
          />
        ))}
      </View>

      {/* 数字键盘（4x4 grid） */}
      <View style={styles.keypad}>
        {KEYPAD_KEYS.map((row, r) => (
          <View key={r} style={styles.keyrow}>
            {row.map((k) => {
              let content;
              let keyStyle = null;
              switch (k.type) {
                case 'digit':
                  content = <Text style={styles.keyText}>{k.label}</Text>;
                  break;
                case 'dot':
                  content = <Text style={styles.keyText}>.</Text>;
                  break;
                case 'back':
                  content = <Text style={styles.keyIconText}>⌫</Text>;
                  break;
                case 'clear':
                  content = <Text style={cx(styles.keyIconText, { color: theme.danger })}>清空</Text>;
                  break;
                case 'add':
                  content = showAdd ? (
                    <Text style={cx(styles.keyIconText, { color: theme.primary, fontWeight: '800' })}>+</Text>
                  ) : null;
                  break;
                case 'confirm':
                  content = (
                    <View style={cx(styles.confirmBtn, { backgroundColor: theme.primary })}>
                      <Text style={styles.confirmText}>✓</Text>
                    </View>
                  );
                  keyStyle = styles.confirmKey;
                  break;
              }
              if (k.type === 'add' && !showAdd) return <View key={k.label || r + '-add'} style={{ flex: 1 }} />;
              return (
                <TouchableOpacity
                  key={k.label || r}
                  activeOpacity={0.6}
                  style={cx(styles.key, keyStyle)}
                  onPress={() => {
                    if (k.type === 'confirm') onConfirm?.();
                    else if (k.type === 'add') onAdd?.();
                    else press(k.label, k.type);
                  }}
                  onPressIn={() => Haptic.impactLight()}
                >
                  {content}
                </TouchableOpacity>
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const KEYPAD_KEYS = [
  [{ label: '1', type: 'digit' }, { label: '2', type: 'digit' }, { label: '3', type: 'digit' }, { label: 'back', type: 'back' }],
  [{ label: '4', type: 'digit' }, { label: '5', type: 'digit' }, { label: '6', type: 'digit' }, { label: 'clear', type: 'clear' }],
  [{ label: '7', type: 'digit' }, { label: '8', type: 'digit' }, { label: '9', type: 'digit' }, { label: 'add', type: 'add' }],
  [{ label: '.', type: 'dot' },   { label: '0', type: 'digit' }, { label: '00', type: 'digit' }, { label: 'OK',  type: 'confirm' }],
];

const useStyles = makeStyles((theme) => ({
  container: { width: '100%' },
  display: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingVertical: 20,
  },
  currency: { fontSize: 32, color: theme.text900, fontWeight: '700', marginRight: 6, marginBottom: 4 },
  amountInt: { fontSize: 56, color: theme.text900, fontWeight: '800', letterSpacing: 0.5 },
  amountDec: { fontSize: 32, color: theme.text500, fontWeight: '700', marginBottom: 4 },
  quickBar: {
    flexDirection: 'row', justifyContent: 'space-around',
    paddingHorizontal: 12, marginBottom: 20, gap: 8,
  },
  keypad: { paddingHorizontal: 12 },
  keyrow: { flexDirection: 'row', justifyContent: 'space-around' },
  key: {
    flex: 1,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 4,
    borderRadius: 14,
    backgroundColor: theme.bgCard,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 },
      android: { elevation: 1 },
    }),
  },
  keyText: { fontSize: 24, color: theme.text900, fontWeight: '600' },
  keyIconText: { fontSize: 20, color: theme.text700, fontWeight: '600' },
  confirmKey: {
    padding: 0,
    backgroundColor: 'transparent',
    ...Platform.select({ ios: { shadowOpacity: 0 }, android: { elevation: 0 } }),
  },
  confirmBtn: {
    width: '100%', height: '100%', borderRadius: 14,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.3, shadowRadius: 10,
    elevation: 4,
  },
  confirmText: { color: '#fff', fontSize: 28, fontWeight: '800' },
}));
