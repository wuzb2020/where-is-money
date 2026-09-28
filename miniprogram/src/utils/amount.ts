// 金额工具：单位统一为「分」

export const fenToYuan = (fen: number): number => fen / 100

export const yuanToFen = (yuan: number): number => Math.round(yuan * 100)

// 分 → 展示文本，如 12345 -> "123.45"
export const fenToText = (fen: number): string => {
  const neg = fen < 0
  const abs = Math.abs(fen)
  const yuan = Math.floor(abs / 100)
  const cents = abs % 100
  const centsStr = cents < 10 ? `0${cents}` : `${cents}`
  // 千分位
  const yuanStr = yuan.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return `${neg ? '-' : ''}${yuanStr}.${centsStr}`
}

// 大金额简写：123456 -> "1,234.56"，超过 1 亿用 "x.xx亿"
export const fenToShort = (fen: number): string => {
  const yuan = Math.abs(fen) / 100
  if (yuan >= 100000000) return `${(yuan / 100000000).toFixed(2)}亿`
  if (yuan >= 10000) return `${(yuan / 10000).toFixed(2)}万`
  return fenToText(fen)
}
