// 8 种日期正则匹配模式（DateExtractor 用）
// 按优先级排列

export const DATE_PATTERNS = [
  // 1. YYYY-MM-DD HH:mm / YYYY-MM-DD HH:mm:ss / YYYY/MM/DD
  {
    regex: /(\d{4})[-\/年](\d{1,2})[-\/月](\d{1,2})[日\s]*(?:(\d{1,2})[:时](\d{1,2}))?/g,
    parse: (m) => ({
      year: parseInt(m[1]), month: parseInt(m[2]), day: parseInt(m[3]),
      hour: m[4] ? parseInt(m[4]) : 0,
      minute: m[5] ? parseInt(m[5]) : 0,
    }),
  },
  // 2. MM-DD / MM/DD （无年份，取本年）
  {
    regex: /(?<!\d)(\d{1,2})[-\/月](\d{1,2})[日\s]*(?:(\d{1,2})[:时](\d{1,2}))?(?!\d)/g,
    parse: (m, nowYear) => ({
      year: nowYear, month: parseInt(m[1]), day: parseInt(m[2]),
      hour: m[3] ? parseInt(m[3]) : 0,
      minute: m[4] ? parseInt(m[4]) : 0,
    }),
  },
  // 3. YYYYMMDD 紧凑格式
  {
    regex: /(20\d{2})(\d{2})(\d{2})/g,
    parse: (m) => ({
      year: parseInt(m[1]), month: parseInt(m[2]), day: parseInt(m[3]),
      hour: 0, minute: 0,
    }),
  },
  // 4. X月X日（中文月日）
  {
    regex: /(\d{1,2})月(\d{1,2})[日号]\s*(?:(\d{1,2})[:时](\d{1,2}))?/g,
    parse: (m, nowYear) => ({
      year: nowYear, month: parseInt(m[1]), day: parseInt(m[2]),
      hour: m[3] ? parseInt(m[3]) : 0,
      minute: m[4] ? parseInt(m[4]) : 0,
    }),
  },
  // 5. 今天/昨天/前天 + 时间
  {
    regex: /(今天|昨天|前天)\s*(?:(\d{1,2})[:时](\d{1,2}))?/g,
    parse: (m, nowYear, nowMonth, nowDay) => {
      let offset = 0;
      if (m[1] === '昨天') offset = -1;
      if (m[1] === '前天') offset = -2;
      const d = new Date(nowYear, nowMonth - 1, nowDay + offset);
      return {
        year: d.getFullYear(), month: d.getMonth() + 1, day: d.getDate(),
        hour: m[2] ? parseInt(m[2]) : new Date().getHours(),
        minute: m[3] ? parseInt(m[3]) : new Date().getMinutes(),
      };
    },
  },
  // 6. Sep 2, 2026 （英文日期）
  // 【修改 P0】补上 g 标志：DateExtractor 用 while(regex.exec) 循环，
  // 非全局正则 lastIndex 不推进，命中后会无限 exec 同一条匹配导致 JS 线程死循环
  {
    regex: /(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{1,2}),?\s*(\d{4})?/ig,
    parse: (m, nowYear) => {
      const monthMap = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };
      return {
        year: m[3] ? parseInt(m[3]) : nowYear,
        month: monthMap[m[1].toLowerCase()],
        day: parseInt(m[2]),
        hour: 0, minute: 0,
      };
    },
  },
];
