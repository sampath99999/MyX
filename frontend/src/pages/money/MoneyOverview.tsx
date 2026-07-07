import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  TrendingUp,
  TrendingDown,
  PiggyBank,
  Repeat,
  Landmark,
  Target,
  AlertTriangle,
  Sparkles,
  ArrowRight,
  Loader2,
  Info,
  CheckCircle2,
  Wallet2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import AddTransactionDialog from "@/components/AddTransactionDialog";
import LoadError from "@/components/LoadError";
import { getCategoryIcon } from "@/components/CategoryPicker";
import { api, formatMoney, type MoneyDashboardData } from "@/lib/api";
import { useAuthenticatedLoad } from "@/lib/useAuthenticatedLoad";
import { cn } from "@/lib/utils";

const PIE_COLORS = [
  "#8b5cf6",
  "#34d399",
  "#fbbf24",
  "#fb7185",
  "#38bdf8",
  "#a78bfa",
  "#f472b6",
  "#94a3b8",
];

const GRID = "oklch(0.28 0.02 275 / 0.35)";
const AXIS = "oklch(0.68 0.02 275)";
const TOOLTIP_BG = "oklch(0.2 0.014 275 / 0.95)";

function formatShort(n: number) {
  if (n >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (n >= 1000) return `₹${(n / 1000).toFixed(0)}k`;
  return `₹${n}`;
}

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
}

function ChartTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg border border-border/60 px-3 py-2 text-xs shadow-xl"
      style={{ background: TOOLTIP_BG }}
    >
      <p className="mb-1.5 font-medium text-foreground">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="tabular-nums" style={{ color: p.color }}>
          {p.name}: {formatMoney(p.value)}
        </p>
      ))}
    </div>
  );
}

function PieTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: { category: string; amount: number; percent: number } }[];
}) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div
      className="rounded-lg border border-border/60 px-3 py-2 text-xs shadow-xl"
      style={{ background: TOOLTIP_BG }}
    >
      <p className="font-medium">{d.category}</p>
      <p className="tabular-nums text-muted-foreground">
        {formatMoney(d.amount)} · {d.percent}%
      </p>
    </div>
  );
}

function InsightIcon({ tone }: { tone: "info" | "warn" | "good" }) {
  if (tone === "good") return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />;
  if (tone === "warn") return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />;
  return <Info className="h-4 w-4 shrink-0 text-sky-400" />;
}

export default function MoneyOverview() {
  const [data, setData] = useState<MoneyDashboardData | null>(null);

  const load = useCallback(async () => {
    setData(await api.moneyDashboard());
  }, []);

  const { loading, error, reload } = useAuthenticatedLoad(load);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-6 lg:p-8">
        <LoadError message={error ?? "Failed to load dashboard."} onRetry={reload} />
      </div>
    );
  }

  const {
    summary,
    monthlyTrend,
    categories,
    budgets,
    goals,
    loans,
    investments,
    recurring,
    recentTransactions,
    insights,
  } = data;
  const netPositive = summary.netMonth >= 0;

  const kpis = [
    {
      label: "Income (month)",
      value: formatMoney(summary.monthIncome),
      icon: TrendingUp,
      accent: "text-emerald-400",
      ring: "bg-emerald-500/10",
    },
    {
      label: "Expenses (month)",
      value: formatMoney(summary.monthExpense),
      icon: TrendingDown,
      accent: "text-rose-400",
      ring: "bg-rose-500/10",
    },
    {
      label: "Savings rate",
      value: summary.monthIncome > 0 ? `${summary.savingsRate}%` : "—",
      icon: PiggyBank,
      accent: "text-violet-400",
      ring: "bg-violet-500/10",
    },
    {
      label: "Recurring / mo",
      value: formatMoney(recurring.monthlyExpense),
      icon: Repeat,
      accent: "text-sky-400",
      ring: "bg-sky-500/10",
      hint: recurring.monthlyIncome > 0 ? `+${formatMoney(recurring.monthlyIncome)} in` : undefined,
    },
    {
      label: "Loan outstanding",
      value: loans.activeCount > 0 ? formatMoney(loans.outstanding) : "—",
      icon: Landmark,
      accent: "text-amber-400",
      ring: "bg-amber-500/10",
      hint: loans.activeCount > 0 ? `${formatMoney(loans.monthlyEmi)}/mo EMI` : undefined,
    },
    {
      label: "Goals saved",
      value: goals.totals.count > 0 ? formatMoney(goals.totals.saved) : "—",
      icon: Target,
      accent: "text-primary",
      ring: "bg-primary/10",
      hint:
        goals.totals.count > 0
          ? `${goals.totals.completed}/${goals.totals.count} complete`
          : undefined,
    },
    {
      label: "Portfolio value",
      value: investments.count > 0 ? formatMoney(investments.current) : "—",
      icon: Wallet2,
      accent: investments.gain >= 0 ? "text-emerald-400" : "text-rose-400",
      ring: investments.gain >= 0 ? "bg-emerald-500/10" : "bg-rose-500/10",
      hint:
        investments.count > 0
          ? `${investments.gain >= 0 ? "+" : ""}${formatMoney(investments.gain)} (${investments.gainPercent >= 0 ? "+" : ""}${investments.gainPercent}%)`
          : undefined,
    },
  ];

  return (
    <div className="p-6 lg:p-8 space-y-6">
      {/* Hero */}
      <Card className="glass relative overflow-hidden p-6 lg:p-8 animate-in-up">
        <div className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-primary/20 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-20 -left-10 h-48 w-48 rounded-full bg-violet-500/10 blur-3xl" />

        <div className="relative flex flex-wrap items-start justify-between gap-6">
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
              <Sparkles className="h-3.5 w-3.5" />
              Money Dashboard
            </div>
            <div>
              <p className="text-sm font-medium text-muted-foreground">Current balance</p>
              <p className="text-4xl lg:text-5xl font-bold tracking-tight tabular-nums">
                {formatMoney(summary.balance)}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 font-medium tabular-nums",
                  netPositive ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400",
                )}
              >
                {netPositive ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                {netPositive ? "+" : ""}
                {formatMoney(summary.netMonth)} this month
              </span>
              {summary.spendChangePct !== null && (
                <span className="text-muted-foreground">
                  vs last month:{" "}
                  <span
                    className={cn(
                      "font-medium",
                      summary.spendChangePct > 0 ? "text-rose-400" : "text-emerald-400",
                    )}
                  >
                    {summary.spendChangePct > 0 ? "+" : ""}
                    {summary.spendChangePct}%
                  </span>
                </span>
              )}
            </div>
          </div>

          <AddTransactionDialog
            onCreated={reload}
            trigger={
              <Button size="lg" className="glow shrink-0">
                <Plus className="h-4 w-4" />
                Add transaction
              </Button>
            }
          />
        </div>
      </Card>

      {/* KPI grid */}
      <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-7 gap-3">
        {kpis.map((k, i) => (
          <Card
            key={k.label}
            className="glass p-4 animate-in-up"
            style={{ animationDelay: `${i * 40}ms` }}
          >
            <div className={cn("inline-flex rounded-lg p-2", k.ring, k.accent)}>
              <k.icon className="h-4 w-4" />
            </div>
            <p className="mt-3 text-lg font-bold tracking-tight tabular-nums">{k.value}</p>
            <p className="text-xs font-medium text-muted-foreground">{k.label}</p>
            {k.hint && <p className="mt-0.5 text-[10px] text-muted-foreground/70">{k.hint}</p>}
          </Card>
        ))}
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-5 gap-4">
        <Card className="glass p-5 xl:col-span-3 animate-in-up">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Cash flow</h3>
              <p className="text-xs text-muted-foreground">Income vs expenses · last 6 months</p>
            </div>
          </div>
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={monthlyTrend} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="label" stroke={AXIS} fontSize={12} tickLine={false} axisLine={false} />
              <YAxis
                stroke={AXIS}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatShort}
                width={48}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ fill: "oklch(0.28 0.02 275 / 0.2)" }} />
              <Legend
                wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                formatter={(v) => <span className="text-muted-foreground">{v}</span>}
              />
              <Bar dataKey="income" name="Income" fill="#34d399" radius={[4, 4, 0, 0]} maxBarSize={28} />
              <Bar dataKey="expense" name="Expense" fill="#fb7185" radius={[4, 4, 0, 0]} maxBarSize={28} />
            </BarChart>
          </ResponsiveContainer>
        </Card>

        <Card className="glass p-5 xl:col-span-2 animate-in-up">
          <div className="mb-2">
            <h3 className="font-semibold">Spending by category</h3>
            <p className="text-xs text-muted-foreground">This month&apos;s expenses</p>
          </div>
          {categories.length === 0 ? (
            <div className="flex h-[260px] items-center justify-center text-sm text-muted-foreground">
              No expenses this month yet
            </div>
          ) : (
            <>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={categories}
                    dataKey="amount"
                    nameKey="category"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={78}
                    paddingAngle={2}
                  >
                    {categories.map((_, i) => (
                      <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} stroke="transparent" />
                    ))}
                  </Pie>
                  <Tooltip content={<PieTooltip />} />
                </PieChart>
              </ResponsiveContainer>
              <ul className="mt-2 space-y-1.5 max-h-28 overflow-y-auto">
                {categories.map((c, i) => (
                  <li key={c.category} className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-2 truncate">
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: PIE_COLORS[i % PIE_COLORS.length] }}
                      />
                      {c.category}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {formatMoney(c.amount)} · {c.percent}%
                    </span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </Card>
      </div>

      {/* Net trend + insights */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="glass p-5 lg:col-span-2 animate-in-up">
          <div className="mb-4">
            <h3 className="font-semibold">Net savings trend</h3>
            <p className="text-xs text-muted-foreground">Monthly surplus or deficit</p>
          </div>
          <ResponsiveContainer width="100%" height={180}>
            <AreaChart data={monthlyTrend}>
              <defs>
                <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={GRID} vertical={false} />
              <XAxis dataKey="label" stroke={AXIS} fontSize={12} tickLine={false} axisLine={false} />
              <YAxis
                stroke={AXIS}
                fontSize={11}
                tickLine={false}
                axisLine={false}
                tickFormatter={formatShort}
                width={48}
              />
              <Tooltip content={<ChartTooltip />} />
              <Area
                type="monotone"
                dataKey="net"
                name="Net"
                stroke="#a78bfa"
                strokeWidth={2}
                fill="url(#netGrad)"
              />
            </AreaChart>
          </ResponsiveContainer>
        </Card>

        <Card className="glass p-5 animate-in-up">
          <h3 className="font-semibold">Insights</h3>
          <p className="text-xs text-muted-foreground mb-4">Smart highlights from your data</p>
          {insights.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Add transactions to unlock personalized insights.
            </p>
          ) : (
            <ul className="space-y-3">
              {insights.map((ins, i) => (
                <li key={i} className="flex gap-2.5 text-sm leading-snug">
                  <InsightIcon tone={ins.tone} />
                  <span className="text-muted-foreground">{ins.message}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Budgets + Goals */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="glass p-5 animate-in-up">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Budget health</h3>
              <p className="text-xs text-muted-foreground">
                {budgets.totals.limit > 0
                  ? `${formatMoney(budgets.totals.spent)} of ${formatMoney(budgets.totals.limit)} used`
                  : "No budgets set"}
              </p>
            </div>
            <Link
              to="/money/budgets"
              className="text-xs text-primary hover:underline underline-offset-4 flex items-center gap-1"
            >
              Manage <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {budgets.items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Set category budgets to track monthly limits.
            </p>
          ) : (
            <ul className="space-y-3">
              {budgets.items.map((b) => {
                const Icon = getCategoryIcon(b.category);
                return (
                  <li key={b.id}>
                    <div className="flex items-center justify-between text-sm mb-1">
                      <span className="flex items-center gap-2 truncate">
                        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
                        {b.category}
                      </span>
                      <span
                        className={cn(
                          "tabular-nums text-xs font-medium",
                          b.over ? "text-rose-400" : "text-muted-foreground",
                        )}
                      >
                        {formatMoney(b.spent)} / {formatMoney(b.limit)}
                      </span>
                    </div>
                    <div className="h-2 w-full overflow-hidden rounded-full bg-background/60">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all",
                          b.over
                            ? "bg-gradient-to-r from-rose-500 to-rose-400"
                            : b.percent >= 80
                              ? "bg-gradient-to-r from-amber-500 to-amber-400"
                              : "bg-gradient-to-r from-emerald-500 to-emerald-400",
                        )}
                        style={{ width: `${Math.min(b.percent, 100)}%` }}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>

        <Card className="glass p-5 animate-in-up">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Savings goals</h3>
              <p className="text-xs text-muted-foreground">
                {goals.totals.count > 0
                  ? `${formatMoney(goals.totals.saved)} of ${formatMoney(goals.totals.target)} saved`
                  : "No goals yet"}
              </p>
            </div>
            <Link
              to="/money/goals"
              className="text-xs text-primary hover:underline underline-offset-4 flex items-center gap-1"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {goals.items.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              Create a goal to track what you&apos;re saving for.
            </p>
          ) : (
            <ul className="space-y-3">
              {goals.items.map((g) => (
                <li key={g.id} className="flex items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-background/50 text-lg">
                    {g.emoji || "🎯"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between text-sm">
                      <span className="truncate font-medium">{g.name}</span>
                      <span className="tabular-nums text-muted-foreground">{g.percent}%</span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-background/60">
                      <div
                        className={cn(
                          "h-full rounded-full",
                          g.completed
                            ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                            : "bg-gradient-to-r from-primary to-violet-400",
                        )}
                        style={{ width: `${g.percent}%` }}
                      />
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      {/* Upcoming + Recent */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="glass p-5 animate-in-up">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Upcoming payments</h3>
              <p className="text-xs text-muted-foreground">Recurring bills &amp; subscriptions</p>
            </div>
            <Link
              to="/money/recurring"
              className="text-xs text-primary hover:underline underline-offset-4 flex items-center gap-1"
            >
              Recurring <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {recurring.upcoming.length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">No active recurring items.</p>
          ) : (
            <ul className="divide-y divide-border/40">
              {recurring.upcoming.slice(0, 5).map((r) => (
                <li key={r.id} className="flex items-center gap-3 py-3 first:pt-0 last:pb-0">
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-full",
                      r.type === "income"
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-rose-500/15 text-rose-400",
                    )}
                  >
                    <Repeat className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <p
                      className={cn(
                        "text-xs",
                        r.overdue
                          ? "text-rose-400 font-medium"
                          : r.days_until <= 3
                            ? "text-amber-400"
                            : "text-muted-foreground",
                      )}
                    >
                      {r.overdue
                        ? `Overdue · was ${formatDate(r.next_due)}`
                        : r.days_until === 0
                          ? "Due today"
                          : r.days_until === 1
                            ? "Due tomorrow"
                            : `Due ${formatDate(r.next_due)}`}
                    </p>
                  </div>
                  <span className="text-sm font-semibold tabular-nums">{formatMoney(r.amount)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card className="glass overflow-hidden animate-in-up">
          <div className="flex items-center justify-between px-5 pt-5 pb-3">
            <div>
              <h3 className="font-semibold">Recent transactions</h3>
              <p className="text-xs text-muted-foreground">{summary.transactionCount} total</p>
            </div>
            <Link
              to="/money/transactions"
              className="text-xs text-primary hover:underline underline-offset-4 flex items-center gap-1"
            >
              View all <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {recentTransactions.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-5 pb-8 pt-2 text-center">
              <Wallet className="h-8 w-8 text-muted-foreground/40" />
              <p className="text-sm text-muted-foreground">No transactions yet.</p>
            </div>
          ) : (
            <ul className="divide-y divide-border/40">
              {recentTransactions.map((t) => {
                const income = t.type === "income";
                return (
                  <li key={t.id} className="flex items-center gap-3 px-5 py-3">
                    <div
                      className={cn(
                        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full",
                        income ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400",
                      )}
                    >
                      {income ? (
                        <ArrowUpRight className="h-4 w-4" />
                      ) : (
                        <ArrowDownLeft className="h-4 w-4" />
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{t.category}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(t.occurred_on)}</p>
                    </div>
                    <span
                      className={cn(
                        "text-sm font-semibold tabular-nums",
                        income ? "text-emerald-400" : "text-foreground",
                      )}
                    >
                      {income ? "+" : "−"}
                      {formatMoney(t.amount)}
                    </span>
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </div>
    </div>
  );
}
