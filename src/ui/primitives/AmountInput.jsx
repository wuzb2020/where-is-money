import React from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
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
  showQuick = true, // 快捷金额 Chip 栏（图2布局下关闭）
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
      {showQuick ? (
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
      ) : null}
    </View>
  );
}

/**
 * 数字键盘（图2布局）：
 * 左 3 列数字区（7 8 9 / 4 5 6 / 1 2 3 / . 0 ⌫）
 * 右列：[📅 今天]（改日期）+ [保存并继续]（跨 2 行高）+ [完成]（主色）
 * 保存并继续 = 保存本条、清空金额+备注、类型保持选中
 */
export function AmountKeypad({
  valueFen = 0,    // 受控值：外部清零（如"保存并继续"）时同步清空输入串
  onChangeFen,
  dateLabel = '今天',  // 日期键文案
  onDate,              // 点击日期键
  onSaveNext,          // 保存并继续
  saveNextDisabled = false,
  onConfirm,           // 完成（保存并关闭）
  confirmDisabled = false,
  style,
}) {
  const { theme } = useAppTheme();
  const styles = useStyles();
  const [yuanStr, setYuanStr] = React.useState('');

  // 外部 valueFen 变化（保存并继续清零）→ 同步内部输入串
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
    }
    setYuanStr(next);
    onChangeFen?.(next ? yuanToFen(parseFloat(next || '0')) : 0, next);
  };

  return (
    <View style={cx(styles.keypad, style)}>
      {/* 左：数字区 3 列 × 4 行 */}
      <View style={styles.padLeft}>
        {DIGIT_ROWS.map((row, r) => (
          <View key={r} style={styles.keyrow}>
            {row.map((k) => (
              <TouchableOpacity
                key={k.label}
                activeOpacity={0.6}
                style={styles.key}
                onPress={() => press(k.label, k.type)}
                onPressIn={() => Haptic.impactLight()}
              >
                {k.type === 'back'
                  ? <MaterialCommunityIcons name="backspace-outline" size={20} color={theme.text700} />
                  : <Text style={styles.keyText}>{k.type === 'dot' ? '.' : k.label}</Text>}
              </TouchableOpacity>
            ))}
          </View>
        ))}
      </View>

      {/* 右列：日期 / 保存并继续（跨2行）/ 完成 */}
      <View style={styles.padRight}>
        <TouchableOpacity
          activeOpacity={0.6}
          style={styles.key}
          onPress={async () => { await Haptic.impactLight(); onDate?.(); }}
        >
          <MaterialCommunityIcons name="calendar-month-outline" size={14} color={theme.text700} />
          <Text style={styles.dateKeyText} numberOfLines={1}>{dateLabel}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.6}
          disabled={saveNextDisabled}
          style={cx(styles.key, styles.keySpan2, saveNextDisabled && { opacity: 0.4 })}
          onPress={async () => { await Haptic.impactLight(); onSaveNext?.(); }}
        >
          <Text style={cx(styles.saveNextText, { color: theme.primary })}>保存并继续</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.6}
          disabled={confirmDisabled}
          style={cx(styles.key, styles.confirmKey)}
          onPress={() => { if (!confirmDisabled) onConfirm?.(); }}
          onPressIn={() => Haptic.impactLight()}
        >
          <View style={cx(styles.confirmBtn, {
            backgroundColor: confirmDisabled ? theme.text300 : theme.primary,
          })}>
            <Text style={styles.confirmText}>完成</Text>
          </View>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** 组合版（旧用法兼容）：金额显示 + 快捷金额 + 键盘 竖排 */
export default function AmountInput({
  valueFen = 0,
  onChangeFen,
  dateLabel,
  onDate,
  onSaveNext,
  saveNextDisabled = false,
  onConfirm,
  confirmDisabled = false,
  hint,
}) {
  return (
    <View>
      <AmountDisplay valueFen={valueFen} hint={hint} onChangeFen={onChangeFen} />
      <AmountKeypad
        valueFen={valueFen}
        onChangeFen={onChangeFen}
        dateLabel={dateLabel}
        onDate={onDate}
        onSaveNext={onSaveNext}
        saveNextDisabled={saveNextDisabled}
        onConfirm={onConfirm}
        confirmDisabled={confirmDisabled}
      />
    </View>
  );
}

// 左侧数字区（图2）：4 行 × 3 列
const DIGIT_ROWS = [
  [{ label: '7', type: 'digit' }, { label: '8', type: 'digit' }, { label: '9', type: 'digit' }],
  [{ label: '4', type: 'digit' }, { label: '5', type: 'digit' }, { label: '6', type: 'digit' }],
  [{ label: '1', type: 'digit' }, { label: '2', type: 'digit' }, { label: '3', type: 'digit' }],
  [{ label: '.', type: 'dot' },   { label: '0', type: 'digit' }, { label: 'back', type: 'back' }],
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

  // ---- AmountKeypad（图2：左数字区 + 右功能列）----
  keypad: { flexDirection: 'row', paddingHorizontal: 6 },
  padLeft: { flex: 3 },
  padRight: { flex: 1 },
  keyrow: { flexDirection: 'row' },
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
  // 「保存并继续」跨 2 行：2×key高 + 2×margin
  keySpan2: { height: 48 * 2 + 8, flex: 0 },
  keyText: { fontSize: 20, color: theme.text900, fontWeight: '600' },
  dateKeyText: { fontSize: 11, color: theme.text700, fontWeight: '600', marginTop: 1 },
  saveNextText: { fontSize: 13, fontWeight: '800', textAlign: 'center', lineHeight: 18 },
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
