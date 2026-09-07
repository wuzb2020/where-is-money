// 日期工具函数（dayjs 封装 + 时间范围计算）

import dayjs from 'dayjs';
import isBetween from 'dayjs/plugin/isBetween';
import 'dayjs/locale/zh-cn';
dayjs.extend(isBetween);
dayjs.locale('zh-cn');

export { dayjs };

/** 现在时间戳（ms） */
export const now = () => Date.now();

/** 格式化 YYYY-MM-DD HH:mm */
export function formatDateTime(ts) {
  if (!ts) return '';
  return dayjs(ts).format('YYYY-MM-DD HH:mm');
}

/** 格式化 YYYY-MM-DD */
export function formatDate(ts) {
  if (!ts) return '';
  return dayjs(ts).format('YYYY-MM-DD');
}

/** 格式化展示：今天/昨天/前天/MM-DD HH:mm */
export function formatFriendly(ts) {
  if (!ts) return '';
  const d = dayjs(ts);
  const today = dayjs().startOf('day');
  const diffDay = d.startOf('day').diff(today, 'day');
  const timePart = d.format('HH:mm');
  if (diffDay === 0) return `今天 ${timePart}`;
  if (diffDay === -1) return `昨天 ${timePart}`;
  if (diffDay === -2) return `前天 ${timePart}`;
  if (diffDay >= -6 && diffDay < 0) {
    const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
    return `${weekdays[d.day()]} ${timePart}`;
  }
  return d.format('MM-DD HH:mm');
}

/** 计算某预设范围的 start/end 时间戳（end 为不包含的下一天 0 点） */
export function getPresetRange(presetKey) {
  const now_ = dayjs();
  switch (presetKey) {
    case 'week7': {
      const start = now_.subtract(6, 'day').startOf('day');
      const end = now_.add(1, 'day').startOf('day');
      return { start: start.valueOf(), end: end.valueOf(), label: `近7天 (${start.format('MM-DD')}~${now_.format('MM-DD')})` };
    }
    case 'month': {
      const start = now_.startOf('month');
      const end = now_.add(1, 'month').startOf('month');
      return { start: start.valueOf(), end: end.valueOf(), label: `${now_.year()}年${now_.month() + 1}月` };
    }
    case 'prevMonth': {
      const prev = now_.subtract(1, 'month');
      const start = prev.startOf('month');
      const end = prev.add(1, 'month').startOf('month');
      return { start: start.valueOf(), end: end.valueOf(), label: `${prev.year()}年${prev.month() + 1}月` };
    }
    case 'day30':
    default: {
      const start = now_.subtract(29, 'day').startOf('day');
      const end = now_.add(1, 'day').startOf('day');
      return { start: start.valueOf(), end: end.valueOf(), label: `近30天 (${start.format('MM-DD')}~${now_.format('MM-DD')})` };
    }
  }
}

/** 自定义日期范围拼接 start/end */
export function getCustomRange(startDate, endDate) {
  const s = dayjs(startDate).startOf('day');
  const e = dayjs(endDate).add(1, 'day').startOf('day');
  return {
    start: s.valueOf(),
    end: e.valueOf(),
    label: `${s.format('MM-DD')} ~ ${dayjs(endDate).format('MM-DD')}`,
  };
}

/** 判断 ts 是否在 [start, end) 区间 */
export function isInRange(ts, start, end) {
  return ts >= start && ts < end;
}

/** 月初/月末时间戳（给月度报告用） */
export function getMonthBounds(year, month /* 1-12 */) {
  const s = dayjs(`${year}-${String(month).padStart(2, '0')}-01`).startOf('month');
  const e = s.add(1, 'month').startOf('month');
  return { start: s.valueOf(), end: e.valueOf() };
}

/** Date 对象 → YYYY-MM-DD */
export function pickerToDateStr(date) {
  return dayjs(date).format('YYYY-MM-DD');
}
