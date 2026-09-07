// 数据聚合分析服务（首页饼图/汇总卡/月度报告）
import { TransactionDao } from '../db';
import { dayjs } from '../utils/date';
import { calcDeltaPercent } from '../utils/amount';

/**
 * 首页仪表盘一次性聚合
 */
export async function getDashboardData(range) {
  const { start, end } = range;

  // 1. 汇总卡 + 同比涨跌（和上一个同长度区间比）
  //    直接走 DB 聚合查询（原生 SQLite / Web localStorage 两套 DAO 均已实现）
  const { income: incomeTotal, expense: expenseTotal } = await TransactionDao.sumByRange(start, end);

  const durationMs = end - start;
  const prevRange = { start: start - durationMs, end: start };
  const prev = await TransactionDao.sumByRange(prevRange.start, prevRange.end);

  // 最近记录列表（范围查询，按日期倒序）
  const records = await TransactionDao.query({ start, end, sortBy: 'date', sortOrder: 'DESC' });

  const summaryCards = {
    income:  {
      value: incomeTotal,
      delta: calcDeltaPercent(incomeTotal, prev.income),
    },
    expense: {
      value: expenseTotal,
      delta: calcDeltaPercent(expenseTotal, prev.expense),
    },
    balance: {
      value: incomeTotal - expenseTotal,
    },
  };

  // 2. 分类饼图 Top 5（其余合并为「其他」）
  const expenseByCategory = topN(
    await TransactionDao.sumByCategoryAndRange(start, end, 'expense'), 5,
  );
  const incomeByCategory = topN(
    await TransactionDao.sumByCategoryAndRange(start, end, 'income'), 5,
  );

  // 3. 每日桶（用于折线）
  const dailyTrend = await TransactionDao.sumByDateBucket(start, end);

  // 4. 最近 5 条
  const recent = records.sort((a, b) => b.date - a.date).slice(0, 5);

  return { summaryCards, expenseByCategory, incomeByCategory, dailyTrend, recent, total: records.length };
}

/** Top N + 其他合并 */
function topN(list, n) {
  if (!list || list.length === 0) return [];
  const sorted = [...list].sort((a, b) => b.amount - a.amount);
  if (sorted.length <= n) {
    // 重算 percent（因为 percent 是之前算的，顺序调整后可能略变）
    return recomputePercent(sorted);
  }
  const top = sorted.slice(0, n);
  const rest = sorted.slice(n);
  const otherAmount = rest.reduce((s, r) => s + r.amount, 0);
  if (otherAmount > 0) {
    top.push({
      categoryId: -1,
      categoryName: '其他',
      categoryIcon: 'dots-horizontal',
      color: '#94A3B8',
      amount: otherAmount,
      percent: 0,
    });
  }
  return recomputePercent(top);
}

function recomputePercent(list) {
  const total = list.reduce((s, r) => s + r.amount, 0);
  return list.map((r) => ({
    ...r,
    percent: total ? Math.round((r.amount / total) * 100) : 0,
  }));
}

/**
 * 月度报告数据
 */
export async function getMonthlyReport(year, month /* 1-12 */) {
  const s = dayjs(`${year}-${String(month).padStart(2, '0')}-01`);
  const start = s.startOf('month').valueOf();
  const end = s.endOf('month').valueOf() + 1;

  const { income, expense } = await TransactionDao.sumByRange(start, end);
  const prevS = s.subtract(1, 'month');
  const prev = await TransactionDao.sumByRange(
    prevS.startOf('month').valueOf(), prevS.endOf('month').valueOf() + 1,
  );

  const expenseCats = await TransactionDao.sumByCategoryAndRange(start, end, 'expense');
  const incomeCats = await TransactionDao.sumByCategoryAndRange(start, end, 'income');
  const maxExpense = expenseCats[0];

  // 【修改 P2】用 COUNT 聚合替代 query(limit:9999).length：
  // 旧写法超过 9999 条时计数被截断，且要把近万行实体全部捞进内存
  const txCount = await TransactionDao.count({ start, end });

  // 外卖次数
  const takeawayCount = expenseCats.find((c) => c.categoryName === '外卖')?.amount || 0;

  return {
    year, month,
    income, expense, balance: income - expense,
    prevIncome: prev.income, prevExpense: prev.expense,
    incomeDelta: calcDeltaPercent(income, prev.income),
    expenseDelta: calcDeltaPercent(expense, prev.expense),
    maxExpense,            // 最大支出分类
    takeawaySpend: takeawayCount,
    txCount,               // 本月记录总数
    topExpenseCats: expenseCats.slice(0, 5),
    topIncomeCats: incomeCats.slice(0, 3),
  };
}
