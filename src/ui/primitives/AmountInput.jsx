import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { useAppTheme, makeStyles, cx } from '../themeHelper';
import Chip from './Chip';
import * as Haptic from '../../core/utils/haptics';
import { QUICK_AMOUNTS } from '../../core/constants/categories';
import { sanitizeAmountInput, yuanToFen } from '../../core/utils/amount';

/**
 * 大金额输入器（鲨鱼记账式拆分导出）
 * - AmountDisplay：金额大字显示 + 提示 + 快捷金额 Chip（无输入逻辑）
 * - AmountKeypad：数字键盘（内部缓存输入串，与外部 valueFen 双向同步）
 * - default AmountInput：两者竖排组合（旧用法兼容）
 *
 * valueFen: number (分)
 * onChangeFen: (fen: number, yuanStr: string) => void
 */

// fen → 逗号分隔整数位 + 两位小数位
function fenToParts(fen) {
  const [int, dec] = (fen / 100).toFixed(2).split('.');
  return [int.replace(/\B(?=(\d{3})+(?!\d))/g, ','), dec];
}

export function AmountDisplay({
  valueFen = 0,
  hint,            // 金额未就绪提示（如"先输入金额"），null 则不显示
  onChangeFen,
  style,
}) {
  const { theme } = useAppTheme();
  const styles = useStyles();
  const [intPart, decPart] = fenToParts(valueFen);

  return (
    <View style={cx(styles.displayWrap, style)}>
      {/* 金额大字（左） + 就绪提示（右） */}
      <View style={styles.displayRow}>
        <View style={styles.displayAmount}>
          <Text style={styles.currency}>¥</Text>
          <Text style={styles.amountInt}>{intPart}</Text>
          <Text style={styles.amountDec}>.{decPart}</Text>
        </View>
        {!!hint && <Text style={cx(styles.hint, { color: theme.danger })}>{hint}</Text>}
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
              onChangeFen?.(yuanToFen(v), String(v));
            }}
          />
        ))}
      </View>
    </View>
  );
}

export function AmountKeypad({
  valueFen = 0,    // 受控值：外部清零（如"保存并继续"）时同步清空输入串
  onChangeFen,
  onAdd,
  onConfirm,
  showAdd = false,
  confirmDisabled = false,
  style,
}) {
  const { theme } = useAppTheme();
  const styles = useStyles();
  const [yuanStr, setYuanStr] = React.useState('');

  // 外部 valueFen 变化（快捷金额点击 / 保存并继续清零）→ 同步内部输入串
  React.useEffect(() => {
    const current = yuanToFen(parseFloat(yuanStr || '0'));
    if (current !== valueFen) {
      setYuanStr(valueFen ? String(valueFen / 100) : '');
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
        // 先判空串：'' 不含 '.' 时 next='0.'，否则 parseFloat('.') 为 NaN
        if (yuanStr === '') next = '0.';
        else if (!yuanStr.includes('.')) next = yuanStr + '.';
        break;
      case 'back':
        next = yuanStr.slice(0, -1);
        break;
      case 'clear':
        next = '';
        break;
    }
    setYuanStr(next);
    onChangeFen?.(next ? yuanToFen(parseFloat(next || '0')) : 0, next);
  };

  return (
    <View style={cx(styles.keypad, style)}>
      {KEYPAD_KEYS.map((row, r) => (
        <View key={r} style={styles.keyrow}>
          {row.map((k) => {
            let content;
            let keyStyle = null;
            switch (k.type) {
              case 'digit':
              case 'dot':
                content = <Text style={styles.keyText}>{k.type === 'dot' ? '.' : k.label}</Text>;
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
                  <View style={cx(styles.confirmBtn, {
                    backgroundColor: confirmDisabled ? theme.text300 : theme.primary,
                  })}>
                    <Text style={styles.confirmText}>✓ 保存</Text>
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
                  if (k.type === 'confirm') { if (!confirmDisabled) onConfirm?.(); }
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
  );
}

/** 组合版（旧用法兼容）：金额显示 + 快捷金额 + 键盘 竖排 */
export default function AmountInput({
  valueFen = 0,
  onChangeFen,
  onAdd,
  onConfirm,
  showAdd = false,
  confirmDisabled = false,
  hint,
}) {
  return (
    <View>
      <AmountDisplay valueFen={valueFen} hint={hint} onChangeFen={onChangeFen} />
      <AmountKeypad
        valueFen={valueFen}
        onChangeFen={onChangeFen}
        onAdd={onAdd}
        onConfirm={onConfirm}
        showAdd={showAdd}
        confirmDisabled={confirmDisabled}
      />
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
  // ---- AmountDisplay ----
  displayWrap: { paddingHorizontal: 16 },
  displayRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  displayAmount: { flexDirection: 'row', alignItems: 'flex-end' },
  currency: { fontSize: 24, color: theme.text900, fontWeight: '700', marginRight: 4, marginBottom: 3 },
  amountInt: { fontSize: 44, color: theme.text900, fontWeight: '800', letterSpacing: 0.5, lineHeight: 50 },
  amountDec: { fontSize: 24, color: theme.text500, fontWeight: '700', marginBottom: 3 },
  hint: { fontSize: 12, fontWeight: '600', marginBottom: 8 },
  quickBar: {
    flexDirection: 'row', justifyContent: 'space-around',
    marginBottom: 8, gap: 8,
  },

  // ---- AmountKeypad ----
  keypad: { paddingHorizontal: 10 },
  keyrow: { flexDirection: 'row', justifyContent: 'space-around' },
  key: {
    flex: 1,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
    margin: 4,
    borderRadius: 12,
    backgroundColor: theme.bgCard,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.06, shadowRadius: 3 },
      android: { elevation: 1 },
    }),
  },
  keyText: { fontSize: 20, color: theme.text900, fontWeight: '600' },
  keyIconText: { fontSize: 17, color: theme.text700, fontWeight: '600' },
  confirmKey: {
    padding: 0,
    backgroundColor: 'transparent',
    ...Platform.select({ ios: { shadowOpacity: 0 }, android: { elevation: 0 } }),
  },
  confirmBtn: {
    width: '100%', height: '100%', borderRadius: 12,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: theme.primary,
    shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8,
    elevation: 4,
  },
  confirmText: { color: '#fff', fontSize: 17, fontWeight: '800' },
}));
