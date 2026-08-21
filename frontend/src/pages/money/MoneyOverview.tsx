import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
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
  ArrowRight,
  Info,
  CheckCircle2,
  LineChart,
  Receipt,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Stat, Meter } from "@/components/ui/stat";
import { PageShell, Section, EmptyState } from "@/components/ui/page";
import { SkeletonStats, Skeleton } from "@/components/ui/skeleton";
import AddTransactionDialog from "@/components/AddTransactionDialog";
import LoadError from "@/components/LoadError";
import { getCategoryIcon } from "@/components/CategoryPicker";
import { api, formatMoney, formatMoneyShort, type MoneyDashboardData } from "@/lib/api";
import { useAuthenticatedLoad } from "@/lib/useAuthenticatedLoad";
import { useChartTheme, type ChartTheme } from "@/lib/chart";
import { cn } from "@/lib/utils";

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
  theme,
}: {
  active?: boolean;
  payload?: { name: string; value: number; color: string }[];
  label?: string;
  theme: ChartTheme;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-pop"
      style={{ background: theme.tooltipBg, borderColor: theme.tooltipBorder }}
    >
      <p className="mb-1.5 font-medium text-foreground">{label}</p>
      {payload.map((p) => (
        <p key={p.name} className="tnum" style={{ color: p.color }}>
          {p.name}: {formatMoney(p.value)}
        </p>
      ))}
    </div>
  );
}

function PieTooltip({
  active,
  payload,
  theme,
}: {
  active?: boolean;
  payload?: { payload: { category: string; amount: number; percent: number } }[];
  theme: ChartTheme;
}) {
  if (!active || !payload?.[0]) return null;
  const d = payload[0].payload;
  return (
    <div
      className="rounded-lg border px-3 py-2 text-xs shadow-pop"
      style={{ background: theme.tooltipBg, borderColor: theme.tooltipBorder }}
    >
      <p className="font-medium">{d.category}</p>
      <p className="tnum text-muted-foreground">
        {formatMoney(d.amount)} · {d.percent}%
      </p>
    </div>
  );
}

function InsightIcon({ tone }: { tone: "info" | "warn" | "good" }) {
  if (tone === "good") return <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-emerald-400" />;
  if (tone === "warn") return <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-400" />;
  return <Info className="mt-0.5 size-4 shrink-0 text-sky-400" />;
}

/** A "see the whole module" link, used as a section action six times over. */
function ViewAll({ to, label = "View all" }: { to: string; label?: string }) {
  return (
    <Button variant="ghost" size="sm" asChild>
      <Link to={to}>
        {label}
        <ArrowRight />
      </Link>
    </Button>
  );
}

export default function MoneyOverview() {
  const [data, setData] = useState<MoneyDashboardData | null>(null);
  const theme = useChartTheme();

  const load = useCallback(async () => {
    setData(await api.moneyDashboard());
  }, []);

  const { loading, error, reload } = useAuthenticatedLoad(load);

  if (loading) {
    return (
      <PageShell className="space-y-6">
        <Skeleton className="h-28 w-full rounded-xl" />
        <SkeletonStats />
        <div className="grid gap-4 xl:grid-cols-5">
          <Skeleton className="h-80 rounded-xl xl:col-span-3" />
          <Skeleton className="h-80 rounded-xl xl:col-span-2" />
        </div>
      </PageShell>
    );
  }

  if (error || !data) {
    return (
      <PageShell>
        <Card className="p-4">
          <LoadError message={error ?? "Failed to load dashboard."} onRetry={reload} />
        </Card>
      </PageShell>
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

  return (
    <PageShell className="space-y-6">
      {/*
        The balance band.

        It was a card with two blurred violet orbs behind it and a "Money
        Dashboard" pill at the top — decoration announcing the page you had just
        clicked to reach. What is left is the one number people open this screen
        for, the direction it moved this month, and the button that changes it.
      */}
      <div className="flex flex-col gap-5 border-b border-border pb-6 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">Current balance</p>
          <p className="tnum mt-2 text-4xl font-semibold tracking-tight lg:text-5xl">
            {formatMoney(summary.balance)}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-sm">
            <span
              className={cn(
                "tnum inline-flex items-center gap-1.5 font-medium",
                netPositive ? "text-emerald-400" : "text-rose-400",
              )}
            >
              {netPositive ? (
                <TrendingUp className="size-4" />
              ) : (
                <TrendingDown className="size-4" />
              )}
              {netPositive ? "+" : ""}
              {formatMoney(summary.netMonth)} this month
            </span>
            {summary.spendChangePct !== null && (
              <span className="text-muted-foreground">
                Spending{" "}
                <span
                  className={cn(
                    "tnum font-medium",
                    summary.spendChangePct > 0 ? "text-rose-400" : "text-emerald-400",
                  )}
                >
                  {summary.spendChangePct > 0 ? "+" : ""}
                  {summary.spendChangePct}%
                </span>{" "}
                vs last month
              </span>
            )}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" asChild>
            <Link to="/money/transactions">
              <Receipt />
              Ledger
            </Link>
          </Button>
          <AddTransactionDialog
            onCreated={reload}
            trigger={
              <Button>
                <Plus />
                Add transaction
              </Button>
            }
          />
        </div>
      </div>

      {/* ---------- The month, in four numbers ---------- */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Income this month"
          value={formatMoney(summary.monthIncome)}
          icon={TrendingUp}
          tone="positive"
        />
        <Stat
          label="Spent this month"
          value={formatMoney(summary.monthExpense)}
          icon={TrendingDown}
          sub={
            budgets.totals.limit > 0
              ? `${formatMoney(budgets.totals.spent)} of ${formatMoney(budgets.totals.limit)} budgeted`
              : undefined
          }
        />
        <Stat
          label="Savings rate"
          value={summary.monthIncome > 0 ? `${summary.savingsRate}%` : "—"}
          icon={PiggyBank}
          sub={summary.monthIncome > 0 ? "Of what came in this month" : "Log income to see this"}
        >
          {summary.monthIncome > 0 && (
            <Meter
              className="mt-3"
              value={Math.max(0, summary.savingsRate) / 100}
              tone={summary.savingsRate >= 20 ? "positive" : summary.savingsRate >= 0 ? "warning" : "danger"}
            />
          )}
        </Stat>
        <Stat
          label="Committed each month"
          value={formatMoney(recurring.monthlyExpense + loans.monthlyEmi)}
          icon={Repeat}
          to="/money/recurring"
          sub={
            loans.monthlyEmi > 0
              ? `${formatMoney(recurring.monthlyExpense)} bills · ${formatMoney(loans.monthlyEmi)} EMI`
              : "Bills and subscriptions"
          }
        />
      </div>

      {/*
        The three balances that are not cash: what is owed, what is set aside,
        what is invested. They are a different question from "how did this month
        go", so they are a separate row rather than three more tiles crammed
        onto the end of a seven-across grid.
      */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Stat
          label="Loan outstanding"
          value={loans.activeCount > 0 ? formatMoney(loans.outstanding) : "—"}
          icon={Landmark}
          to="/money/loans"
          sub={
            loans.activeCount > 0
              ? `${loans.activeCount} active · ${formatMoney(loans.monthlyEmi)}/mo`
              : "No active loans"
          }
        />
        <Stat
          label="Saved towards goals"
          value={goals.totals.count > 0 ? formatMoney(goals.totals.saved) : "—"}
          icon={Target}
          to="/money/goals"
          sub={
            goals.totals.count > 0
              ? `${goals.totals.completed} of ${goals.totals.count} complete`
              : "No goals yet"
          }
        />
        <Stat
          label="Portfolio value"
          value={investments.count > 0 ? formatMoney(investments.current) : "—"}
          icon={LineChart}
          to="/money/investments"
          tone={investments.count === 0 ? "default" : investments.gain >= 0 ? "positive" : "negative"}
          sub={
            investments.count > 0 ? (
              <span className="tnum">
                {investments.gain >= 0 ? "+" : ""}
                {formatMoney(investments.gain)} ({investments.gainPercent >= 0 ? "+" : ""}
                {investments.gainPercent}%)
              </span>
            ) : (
              "Nothing tracked yet"
            )
          }
        />
      </div>

      {/* ---------- Charts ---------- */}
      <div className="grid gap-4 xl:grid-cols-5">
        <Section
          className="xl:col-span-3"
          title="Cash flow"
          description="Income against spending, last six months"
        >
          <Card className="p-5">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={monthlyTrend} barGap={4} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <CartesianGrid stroke={theme.grid} vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke={theme.axis}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  dy={6}
                />
                <YAxis
                  stroke={theme.axis}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatMoneyShort}
                  width={52}
                />
                <Tooltip content={<ChartTooltip theme={theme} />} cursor={{ fill: theme.cursor }} />
                <Bar dataKey="income" name="Income" fill={theme.income} radius={[3, 3, 0, 0]} maxBarSize={22} />
                <Bar dataKey="expense" name="Expense" fill={theme.expense} radius={[3, 3, 0, 0]} maxBarSize={22} />
              </BarChart>
            </ResponsiveContainer>
            {/* A hand-written legend, because Recharts' own one cannot be given
                the app's type scale without fighting its inline styles. */}
            <div className="mt-1 flex items-center justify-center gap-5 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm" style={{ background: theme.income }} />
                Income
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2 rounded-sm" style={{ background: theme.expense }} />
                Expense
              </span>
            </div>
          </Card>
        </Section>

        <Section
          className="xl:col-span-2"
          title="Where it went"
          description="This month's spending by category"
        >
          <Card className="p-5">
            {categories.length === 0 ? (
              <div className="flex h-[300px] items-center justify-center text-sm text-muted-foreground">
                No expenses this month yet
              </div>
            ) : (
              <>
                <div className="relative">
                  <ResponsiveContainer width="100%" height={190}>
                    <PieChart>
                      <Pie
                        data={categories}
                        dataKey="amount"
                        nameKey="category"
                        cx="50%"
                        cy="50%"
                        innerRadius={62}
                        outerRadius={86}
                        paddingAngle={2}
                        strokeWidth={0}
                      >
                        {categories.map((_, i) => (
                          <Cell key={i} fill={theme.palette[i % theme.palette.length]} />
                        ))}
                      </Pie>
                      <Tooltip content={<PieTooltip theme={theme} />} />
                    </PieChart>
                  </ResponsiveContainer>
                  {/* The total in the hole. A donut without one makes the reader
                      add the slices up themselves. */}
                  <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
                    <p className="tnum text-lg font-semibold">
                      {formatMoneyShort(categories.reduce((n, c) => n + c.amount, 0))}
                    </p>
                    <p className="text-[0.6875rem] text-muted-foreground">this month</p>
                  </div>
                </div>
                <ul className="mt-3 max-h-32 space-y-1.5 overflow-y-auto pr-1">
                  {categories.map((c, i) => (
                    <li key={c.category} className="flex items-center justify-between gap-3 text-xs">
                      <span className="flex min-w-0 items-center gap-2">
                        <span
                          className="size-2 shrink-0 rounded-full"
                          style={{ background: theme.palette[i % theme.palette.length] }}
                        />
                        <span className="truncate">{c.category}</span>
                      </span>
                      <span className="tnum shrink-0 text-muted-foreground">
                        {formatMoney(c.amount)} · {c.percent}%
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </Card>
        </Section>
      </div>

      {/* ---------- Net trend + insights ---------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Section
          className="lg:col-span-2"
          title="Net savings"
          description="What was left over, month by month"
        >
          <Card className="p-5">
            <ResponsiveContainer width="100%" height={190}>
              <AreaChart data={monthlyTrend} margin={{ top: 4, right: 4, left: 0, bottom: 0 }}>
                <defs>
                  <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={theme.net} stopOpacity={0.28} />
                    <stop offset="100%" stopColor={theme.net} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid stroke={theme.grid} vertical={false} />
                <XAxis
                  dataKey="label"
                  stroke={theme.axis}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  dy={6}
                />
                <YAxis
                  stroke={theme.axis}
                  fontSize={11}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={formatMoneyShort}
                  width={52}
                />
                <Tooltip content={<ChartTooltip theme={theme} />} />
                <Area
                  type="monotone"
                  dataKey="net"
                  name="Net"
                  stroke={theme.net}
                  strokeWidth={2}
                  fill="url(#netGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </Card>
        </Section>

        <Section title="Insights" description="What the numbers are saying">
          <Card className="h-full p-5">
            {insights.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Add a few transactions and this fills in with what changed, what is drifting and
                what is about to be due.
              </p>
            ) : (
              <ul className="space-y-3.5">
                {insights.map((ins, i) => (
                  <li key={i} className="flex gap-2.5 text-sm leading-relaxed">
                    <InsightIcon tone={ins.tone} />
                    <span className="text-muted-foreground">{ins.message}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Section>
      </div>

      {/* ---------- Budgets + goals ---------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="Budget health"
          description={
            budgets.totals.limit > 0
              ? `${formatMoney(budgets.totals.spent)} of ${formatMoney(budgets.totals.limit)} used`
              : undefined
          }
          actions={<ViewAll to="/money/budgets" label="Manage" />}
        >
          {budgets.items.length === 0 ? (
            <EmptyState
              compact
              icon={PiggyBank}
              title="No budgets set"
              description="Cap a category and this screen starts warning you before you go over, not after."
              action={
                <Button size="sm" asChild>
                  <Link to="/money/budgets">Set a budget</Link>
                </Button>
              }
            />
          ) : (
            <Card className="divide-y divide-border">
              {budgets.items.map((b) => {
                const Icon = getCategoryIcon(b.category);
                return (
                  <div key={b.id} className="p-4">
                    <div className="mb-2 flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <Icon className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate font-medium">{b.category}</span>
                        {b.over && <Badge variant="danger">over</Badge>}
                      </span>
                      <span
                        className={cn(
                          "tnum shrink-0 text-xs",
                          b.over ? "font-medium text-rose-400" : "text-muted-foreground",
                        )}
                      >
                        {formatMoney(b.spent)} / {formatMoney(b.limit)}
                      </span>
                    </div>
                    <Meter
                      value={b.percent / 100}
                      tone={b.over ? "danger" : b.percent >= 80 ? "warning" : "positive"}
                    />
                  </div>
                );
              })}
            </Card>
          )}
        </Section>

        <Section
          title="Savings goals"
          description={
            goals.totals.count > 0
              ? `${formatMoney(goals.totals.saved)} of ${formatMoney(goals.totals.target)} saved`
              : undefined
          }
          actions={<ViewAll to="/money/goals" />}
        >
          {goals.items.length === 0 ? (
            <EmptyState
              compact
              icon={Target}
              title="No goals yet"
              description="Name what you are saving for and watch the bar fill. It works better than willpower."
              action={
                <Button size="sm" asChild>
                  <Link to="/money/goals">Create a goal</Link>
                </Button>
              }
            />
          ) : (
            <Card className="divide-y divide-border">
              {goals.items.map((g) => (
                <div key={g.id} className="flex items-center gap-3 p-4">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-base">
                    {g.emoji || "🎯"}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex justify-between gap-3 text-sm">
                      <span className="truncate font-medium">{g.name}</span>
                      <span className="tnum shrink-0 text-muted-foreground">{g.percent}%</span>
                    </div>
                    <Meter
                      className="mt-2"
                      value={g.percent / 100}
                      tone={g.completed ? "positive" : "default"}
                    />
                  </div>
                </div>
              ))}
            </Card>
          )}
        </Section>
      </div>

      {/* ---------- Upcoming + recent ---------- */}
      <div className="grid gap-4 lg:grid-cols-2">
        <Section
          title="Upcoming payments"
          description="Bills and subscriptions, soonest first"
          actions={<ViewAll to="/money/recurring" label="All bills" />}
        >
          {recurring.upcoming.length === 0 ? (
            <EmptyState
              compact
              icon={Repeat}
              title="No recurring items"
              description="Add the bills you pay every month and MyX rolls their due dates forward for you."
              action={
                <Button size="sm" asChild>
                  <Link to="/money/recurring">Add a bill</Link>
                </Button>
              }
            />
          ) : (
            <Card className="divide-y divide-border overflow-hidden">
              {recurring.upcoming.slice(0, 5).map((r) => (
                <Link
                  key={r.id}
                  to="/money/recurring"
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
                >
                  <span
                    className={cn(
                      "flex size-9 shrink-0 items-center justify-center rounded-lg",
                      r.overdue
                        ? "bg-rose-400/10 text-rose-400"
                        : r.type === "income"
                          ? "bg-emerald-400/10 text-emerald-400"
                          : "bg-secondary text-muted-foreground",
                    )}
                  >
                    <Repeat className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{r.name}</p>
                    <p
                      className={cn(
                        "text-xs",
                        r.overdue
                          ? "font-medium text-rose-400"
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
                  <span className="tnum shrink-0 text-sm font-medium">{formatMoney(r.amount)}</span>
                </Link>
              ))}
            </Card>
          )}
        </Section>

        <Section
          title="Recent transactions"
          description={`${summary.transactionCount.toLocaleString("en-IN")} in total`}
          actions={<ViewAll to="/money/transactions" />}
        >
          {recentTransactions.length === 0 ? (
            <EmptyState
              compact
              icon={Wallet}
              title="No transactions yet"
              description="Everything on this page fills in from the ledger. Start with one entry."
              action={
                <AddTransactionDialog
                  onCreated={reload}
                  trigger={
                    <Button size="sm">
                      <Plus />
                      Add transaction
                    </Button>
                  }
                />
              }
            />
          ) : (
            <Card className="divide-y divide-border overflow-hidden">
              {recentTransactions.map((t) => {
                const income = t.type === "income";
                const Icon = getCategoryIcon(t.category);
                return (
                  <Link
                    key={t.id}
                    to={`/money/transactions/${t.id}`}
                    className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
                  >
                    <span
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-lg",
                        income
                          ? "bg-emerald-400/10 text-emerald-400"
                          : "bg-secondary text-muted-foreground",
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{t.category}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(t.occurred_on)}</p>
                    </div>
                    <span
                      className={cn(
                        "tnum shrink-0 text-sm font-medium",
                        income ? "text-emerald-400" : "text-foreground",
                      )}
                    >
                      {income ? "+" : "−"}
                      {formatMoney(t.amount)}
                    </span>
                    {income ? (
                      <ArrowUpRight className="size-3.5 shrink-0 text-emerald-400/50" />
                    ) : (
                      <ArrowDownLeft className="size-3.5 shrink-0 text-muted-foreground/30" />
                    )}
                  </Link>
                );
              })}
            </Card>
          )}
        </Section>
      </div>
    </PageShell>
  );
}
