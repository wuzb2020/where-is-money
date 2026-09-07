// 金额格式化工具（内部统一存「分」整数，避免浮点误差）

/** 元 → 分（保存前用） */
export function yuanToFen(yuan) {
  if (yuan == null || yuan === '' || isNaN(Number(yuan))) return 0;
  return Math.round(Number(yuan) * 100);
}

/** 分 → 元（显示前用） */
export function fenToYuan(fen) {
  if (fen == null || isNaN(Number(fen))) return 0;
  return Number(fen) / 100;
}

/** 分 → 格式化显示：¥1,234.56 */
export function formatAmount(fen, options = {}) {
  const {
    prefix = '¥',
    showSign = false,       // 是否显示 + / -
    thousand = true,        // 千分位
    decimals = 2,           // 小数位数
    emptyZero = false,      // 0 时显示 ''
  } = options;
  if (fen == null || isNaN(Number(fen))) return '';
  if (emptyZero && fen === 0) return '';
  const sign = showSign ? (fen > 0 ? '+' : fen < 0 ? '-' : '') : '';
  const num = Math.abs(fenToYuan(fen));
  const fixed = num.toFixed(decimals);
  const [intPart, decPart] = fixed.split('.');
  const withComma = thousand ? intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ',') : intPart;
  const decStr = decPart ? `.${decPart}` : '';
  return `${sign}${prefix}${withComma}${decStr}`;
}

/** 仅数字格式（无¥符号，输入框用） */
export function formatAmountPlain(fen) {
  if (fen == null) return '';
  return fenToYuan(fen).toFixed(2);
}

/** 数字输入校验（防止非数字和两个小数点） */
export function sanitizeAmountInput(text) {
  // 移除非数字/小数点字符
  let t = String(text).replace(/[^\d.]/g, '');
  // 只保留第一个小数点
  const firstDot = t.indexOf('.');
  if (firstDot >= 0) {
    t = t.slice(0, firstDot + 1) + t.slice(firstDot + 1).replace(/\./g, '');
    // 小数最多两位
    const parts = t.split('.');
    if (parts[1] && parts[1].length > 2) {
      t = `${parts[0]}.${parts[1].slice(0, 2)}`;
    }
  }
  // 去掉首位多个 0（0 开头非小数不行，比如 012 → 12，00.12 → 0.12）
  if (/^0\d/.test(t)) t = t.replace(/^0+/, '');
  if (/^\./.test(t)) t = '0' + t;
  return t;
}

/** 计算涨跌百分比（首页汇总卡 delta） */
export function calcDeltaPercent(current, previous) {
  if (previous === 0) {
    if (current === 0) return { percent: 0, trend: 'flat' };
    return { percent: 100, trend: current > 0 ? 'up' : 'down' };
  }
  const percent = Math.round(((current - previous) / Math.abs(previous)) * 100);
  return {
    percent: Math.abs(percent),
    trend: percent > 0 ? 'up' : percent < 0 ? 'down' : 'flat',
  };
}
