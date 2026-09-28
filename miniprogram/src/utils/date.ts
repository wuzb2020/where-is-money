import dayjs from 'dayjs'

export const monthKey = (ts: number): string => dayjs(ts).format('YYYY-MM')

export const currentMonthKey = (): string => dayjs().format('YYYY-MM')

export const formatMonthLabel = (ts: number): string => dayjs(ts).format('YYYY年M月')

export const formatDateLabel = (ts: number): string => {
  const d = dayjs(ts)
  const today = dayjs()
  if (d.isSame(today, 'day')) return '今天'
  if (d.isSame(today.subtract(1, 'day'), 'day')) return '昨天'
  return d.format('M月D日')
}

export const formatTime = (ts: number): string => dayjs(ts).format('HH:mm')

export const formatDateTime = (ts: number): string => dayjs(ts).format('YYYY年M月D日 HH:mm')

// Picker 用
export const toDatePickerValue = (ts: number): string => dayjs(ts).format('YYYY-MM-DD')
export const toTimePickerValue = (ts: number): string => dayjs(ts).format('HH:mm')

export const fromPickerValues = (dateStr: string, timeStr: string): number =>
  dayjs(`${dateStr} ${timeStr}`).valueOf()

// 最近 n 个月（含当月），返回 [{ key, label }]
export const recentMonths = (n: number): { key: string; label: string; start: number; end: number }[] => {
  const result = []
  for (let i = n - 1; i >= 0; i--) {
    const d = dayjs().subtract(i, 'month')
    result.push({
      key: d.format('YYYY-MM'),
      label: i === 0 ? '本月' : d.format('M月'),
      start: d.startOf('month').valueOf(),
      end: d.endOf('month').valueOf()
    })
  }
  return result
}
