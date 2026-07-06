import { Hono } from "hono";
import { requireAuth } from "../middleware";
import type { AppBindings } from "../types";

const money = new Hono<AppBindings>();
money.use("*", requireAuth);

const toRupees = (p: number) => p / 100;

function monthKey(d: Date): string {
  return d.toISOString().slice(0, 7);
}

function monthsAgo(n: number): string {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  return monthKey(d);
}

/** GET /api/money/dashboard — rich rollup for the money dashboard UI. */
money.get("/dashboard", async (c) => {
  const user = c.get("user");
  const uid = user.sub;
  const monthPrefix = monthKey(new Date());
  const monthLike = `${monthPrefix}%`;
  const trendFrom = `${monthsAgo(5)}-01`;

  const [
    summaryRow,
    trendRows,
    categoryRows,
    budgetRows,
    goalRows,
    loanRows,
    recurringRows,
    recentRows,
    lastMonthRow,
  ] = await Promise.all([
    c.env.DB.prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN type='income'  THEN amount END), 0) AS income,
         COALESCE(SUM(CASE WHEN type='expense' THEN amount END), 0) AS expense,
         COALESCE(SUM(CASE WHEN type='income'  AND occurred_on LIKE ?1 THEN amount END), 0) AS month_income,
         COALESCE(SUM(CASE WHEN type='expense' AND occurred_on LIKE ?1 THEN amount END), 0) AS month_expense,
         COUNT(*) AS count
       FROM transactions WHERE user_id = ?2`,
    )
      .bind(monthLike, uid)
      .first<{
        income: number;
        expense: number;
        month_income: number;
        month_expense: number;
        count: number;
      }>(),

    c.env.DB.prepare(
      `SELECT substr(occurred_on, 1, 7) AS month,
              COALESCE(SUM(CASE WHEN type='income'  THEN amount END), 0) AS income,
              COALESCE(SUM(CASE WHEN type='expense' THEN amount END), 0) AS expense
       FROM transactions
       WHERE user_id = ?1 AND occurred_on >= ?2
       GROUP BY substr(occurred_on, 1, 7)
       ORDER BY month ASC`,
    )
      .bind(uid, trendFrom)
      .all<{ month: string; income: number; expense: number }>(),

    c.env.DB.prepare(
      `SELECT category, SUM(amount) AS total
       FROM transactions
       WHERE user_id = ?1 AND type = 'expense' AND occurred_on LIKE ?2
       GROUP BY category
       ORDER BY total DESC
       LIMIT 8`,
    )
      .bind(uid, monthLike)
      .all<{ category: string; total: number }>(),

    c.env.DB.prepare(
      `SELECT b.id, b.category, b.amount,
              COALESCE((
                SELECT SUM(t.amount) FROM transactions t
                WHERE t.user_id = b.user_id AND t.type = 'expense'
                  AND t.category = b.category AND t.occurred_on LIKE ?1
              ), 0) AS spent
       FROM budgets b WHERE b.user_id = ?2 ORDER BY spent DESC LIMIT 6`,
    )
      .bind(monthLike, uid)
      .all<{ id: number; category: string; amount: number; spent: number }>(),

    c.env.DB.prepare(
      `SELECT id, name, emoji, target_amount, saved_amount, target_date, completed_at
       FROM goals WHERE user_id = ? ORDER BY completed_at IS NOT NULL, saved_amount DESC LIMIT 5`,
    )
      .bind(uid)
      .all<{
        id: number;
        name: string;
        emoji: string | null;
        target_amount: number;
        saved_amount: number;
        target_date: string | null;
        completed_at: string | null;
      }>(),

    c.env.DB.prepare(
      `SELECT id, name, outstanding, emi, status, principal FROM loans WHERE user_id = ?`,
    )
      .bind(uid)
      .all<{
        id: number;
        name: string;
        outstanding: number;
        emi: number;
        status: string;
        principal: number;
      }>(),

    c.env.DB.prepare(
      `SELECT id, name, type, amount, category, next_due, active
       FROM recurring WHERE user_id = ? AND active = 1
       ORDER BY next_due ASC LIMIT 8`,
    )
      .bind(uid)
      .all<{
        id: number;
        name: string;
        type: string;
        amount: number;
        category: string;
        next_due: string;
        active: number;
      }>(),

    c.env.DB.prepare(
      `SELECT id, type, amount, category, note, occurred_on
       FROM transactions WHERE user_id = ? ORDER BY occurred_on DESC, id DESC LIMIT 8`,
    )
      .bind(uid)
      .all<{
        id: number;
        type: string;
        amount: number;
        category: string;
        note: string | null;
        occurred_on: string;
      }>(),

    c.env.DB.prepare(
      `SELECT
         COALESCE(SUM(CASE WHEN type='expense' AND occurred_on LIKE ?1 THEN amount END), 0) AS expense
       FROM transactions WHERE user_id = ?2`,
    )
      .bind(`${monthsAgo(1)}%`, uid)
      .first<{ expense: number }>(),
  ]);

  const income = summaryRow?.income ?? 0;
  const expense = summaryRow?.expense ?? 0;
  const monthIncome = summaryRow?.month_income ?? 0;
  const monthExpense = summaryRow?.month_expense ?? 0;
  const netMonth = monthIncome - monthExpense;
  const savingsRate =
    monthIncome > 0 ? Math.round(((monthIncome - monthExpense) / monthIncome) * 100) : 0;

  const lastMonthExpense = lastMonthRow?.expense ?? 0;
  const spendChangePct =
    lastMonthExpense > 0
      ? Math.round(((monthExpense - lastMonthExpense) / lastMonthExpense) * 100)
      : null;

  // Fill missing months in trend with zeros.
  const trendMap = new Map(
    (trendRows.results ?? []).map((r) => [
      r.month,
      { income: toRupees(r.income), expense: toRupees(r.expense), net: toRupees(r.income - r.expense) },
    ]),
  );
  const monthlyTrend: { month: string; label: string; income: number; expense: number; net: number }[] =
    [];
  for (let i = 5; i >= 0; i--) {
    const key = monthsAgo(i);
    const d = new Date(key + "-01T00:00:00");
    const label = d.toLocaleDateString("en-IN", { month: "short" });
    const row = trendMap.get(key) ?? { income: 0, expense: 0, net: 0 };
    monthlyTrend.push({ month: key, label, ...row });
  }

  const categoryTotal = (categoryRows.results ?? []).reduce((s, r) => s + r.total, 0);
  const categories = (categoryRows.results ?? []).map((r) => ({
    category: r.category,
    amount: toRupees(r.total),
    percent: categoryTotal > 0 ? Math.round((r.total / categoryTotal) * 100) : 0,
  }));

  const budgets = (budgetRows.results ?? []).map((b) => {
    const limit = toRupees(b.amount);
    const spent = toRupees(b.spent);
    return {
      id: b.id,
      category: b.category,
      limit,
      spent,
      percent: b.amount > 0 ? Math.round((b.spent / b.amount) * 100) : 0,
      over: b.spent > b.amount,
    };
  });
  const budgetTotals = budgets.reduce(
    (acc, b) => ({
      limit: acc.limit + b.limit,
      spent: acc.spent + b.spent,
      overCount: acc.overCount + (b.over ? 1 : 0),
    }),
    { limit: 0, spent: 0, overCount: 0 },
  );

  const allGoals = await c.env.DB.prepare(
    "SELECT target_amount, saved_amount, completed_at FROM goals WHERE user_id = ?",
  )
    .bind(uid)
    .all<{ target_amount: number; saved_amount: number; completed_at: string | null }>();

  const goalItems = (goalRows.results ?? []).map((g) => ({
    id: g.id,
    name: g.name,
    emoji: g.emoji,
    target: toRupees(g.target_amount),
    saved: toRupees(g.saved_amount),
    percent:
      g.target_amount > 0
        ? Math.min(Math.round((g.saved_amount / g.target_amount) * 100), 100)
        : 0,
    completed: !!g.completed_at,
  }));
  const goalTotals = (allGoals.results ?? []).reduce(
    (acc, g) => ({
      target: acc.target + toRupees(g.target_amount),
      saved: acc.saved + toRupees(g.saved_amount),
      count: acc.count + 1,
      completed: acc.completed + (g.completed_at ? 1 : 0),
    }),
    { target: 0, saved: 0, count: 0, completed: 0 },
  );

  const activeLoans = (loanRows.results ?? []).filter((l) => l.status === "active");
  const loanTotals = {
    count: (loanRows.results ?? []).length,
    activeCount: activeLoans.length,
    outstanding: activeLoans.reduce((s, l) => s + toRupees(l.outstanding), 0),
    monthlyEmi: activeLoans.reduce((s, l) => s + toRupees(l.emi), 0),
    principal: activeLoans.reduce((s, l) => s + toRupees(l.principal), 0),
  };

  const upcoming = (recurringRows.results ?? []).map((r) => {
    const days = Math.ceil(
      (new Date(r.next_due + "T00:00:00").getTime() - Date.now()) / 86400000,
    );
    return {
      id: r.id,
      name: r.name,
      type: r.type as "income" | "expense",
      amount: toRupees(r.amount),
      category: r.category,
      next_due: r.next_due,
      days_until: days,
      overdue: days < 0,
    };
  });

  const recurringMonthly = await c.env.DB.prepare(
    "SELECT type, amount, frequency, interval FROM recurring WHERE user_id = ? AND active = 1",
  )
    .bind(uid)
    .all<{ type: string; amount: number; frequency: string; interval: number }>();

  const perMonth = (amount: number, frequency: string, interval: number) => {
    const factor =
      frequency === "daily"
        ? 30 / interval
        : frequency === "weekly"
          ? 52 / 12 / interval
          : frequency === "monthly"
            ? 1 / interval
            : 1 / (12 * interval);
    return amount * factor;
  };
  let recurringExpense = 0;
  let recurringIncome = 0;
  for (const r of recurringMonthly.results ?? []) {
    const m = perMonth(r.amount, r.frequency, r.interval);
    if (r.type === "expense") recurringExpense += m;
    else recurringIncome += m;
  }

  const recent = (recentRows.results ?? []).map((t) => ({
    id: t.id,
    type: t.type as "income" | "expense",
    amount: toRupees(t.amount),
    category: t.category,
    note: t.note,
    occurred_on: t.occurred_on,
  }));

  // Smart insights for the dashboard cards.
  const insights: { tone: "info" | "warn" | "good"; message: string }[] = [];
  if (netMonth > 0 && monthIncome > 0) {
    insights.push({
      tone: "good",
      message: `You saved ${formatRupees(toRupees(netMonth))} this month (${savingsRate}% of income).`,
    });
  } else if (netMonth < 0) {
    insights.push({
      tone: "warn",
      message: `Spending exceeded income by ${formatRupees(toRupees(Math.abs(netMonth)))} this month.`,
    });
  }
  if (spendChangePct !== null && spendChangePct > 15) {
    insights.push({
      tone: "warn",
      message: `Expenses are up ${spendChangePct}% vs last month — review your top categories.`,
    });
  } else if (spendChangePct !== null && spendChangePct < -10) {
    insights.push({
      tone: "good",
      message: `Nice — you spent ${Math.abs(spendChangePct)}% less than last month.`,
    });
  }
  if (budgetTotals.overCount > 0) {
    insights.push({
      tone: "warn",
      message: `${budgetTotals.overCount} budget${budgetTotals.overCount === 1 ? "" : "s"} over limit this month.`,
    });
  }
  const overdue = upcoming.filter((u) => u.overdue);
  if (overdue.length > 0) {
    insights.push({
      tone: "warn",
      message: `${overdue.length} recurring bill${overdue.length === 1 ? "" : "s"} overdue.`,
    });
  }
  const dueSoon = upcoming.filter((u) => !u.overdue && u.days_until <= 7);
  if (dueSoon.length > 0) {
    insights.push({
      tone: "info",
      message: `${dueSoon.length} payment${dueSoon.length === 1 ? "" : "s"} due within 7 days.`,
    });
  }
  if (loanTotals.activeCount > 0) {
    insights.push({
      tone: "info",
      message: `${formatRupees(loanTotals.monthlyEmi)}/mo in loan EMIs · ${formatRupees(loanTotals.outstanding)} outstanding.`,
    });
  }

  return c.json({
    summary: {
      balance: toRupees(income - expense),
      totalIncome: toRupees(income),
      totalExpense: toRupees(expense),
      monthIncome: toRupees(monthIncome),
      monthExpense: toRupees(monthExpense),
      netMonth: toRupees(netMonth),
      savingsRate,
      spendChangePct,
      transactionCount: summaryRow?.count ?? 0,
    },
    monthlyTrend,
    categories,
    budgets: { items: budgets, totals: budgetTotals },
    goals: { items: goalItems, totals: goalTotals },
    loans: loanTotals,
    recurring: {
      monthlyIncome: toRupees(recurringIncome),
      monthlyExpense: toRupees(recurringExpense),
      upcoming,
    },
    recentTransactions: recent,
    insights: insights.slice(0, 5),
  });
});

function formatRupees(rupees: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(rupees);
}

export default money;
