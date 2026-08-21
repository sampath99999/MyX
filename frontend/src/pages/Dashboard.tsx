import { useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Wallet,
  CheckCircle2,
  ListChecks,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  ArrowRight,
  RotateCcw,
  PiggyBank,
  Receipt,
  StickyNote,
  Brain,
  Plus,
  Sparkles,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Stat, Delta, Meter } from "@/components/ui/stat";
import { PageShell, Section, EmptyState } from "@/components/ui/page";
import { SkeletonStats, Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/switch";
import AddTransactionDialog from "@/components/AddTransactionDialog";
import LoadError from "@/components/LoadError";
import { useAuth } from "@/lib/auth";
import { api, formatMoney } from "@/lib/api";
import { useAuthenticatedLoad, announceDataChanged } from "@/lib/useAuthenticatedLoad";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

interface RecentTransaction {
  id: number;
  type: "income" | "expense";
  amount: number;
  category: string;
  note: string | null;
  occurred_on: string;
}

interface DashboardChecklist {
  id: number;
  name: string;
  emoji: string | null;
  items: { id: number; title: string; done: boolean }[];
}

interface Summary {
  greeting: string;
  stats: {
    balance: number;
    monthSpend: number;
    monthIncome: number;
    prevMonthSpend: number;
    prevMonthIncome: number;
    spendDelta: number | null;
    incomeDelta: number | null;
    savingsRate: number | null;
    openTasks: number;
    overdueTasks: number;
    notes: number;
    checklists: number;
    memories: number;
  };
  spark: { day: string; amount: number }[];
  today: {
    tasks: { id: number; title: string; due_date: string; priority: number }[];
    bills: { id: number; name: string; amount: number; next_due: string }[];
  };
  recent: RecentTransaction[];
  checklist: DashboardChecklist | null;
}

/** Local calendar date — "today" must be the user's, not UTC's. */
const todayIso = (() => {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
})();

/** Relative and short, because a due date only matters as "when, relative to now". */
function dueLabel(iso: string): string {
  if (iso < todayIso) return "overdue";
  if (iso === todayIso) return "today";
  const days = Math.round(
    (new Date(`${iso}T00:00:00`).getTime() - new Date(`${todayIso}T00:00:00`).getTime()) /
      86_400_000,
  );
  return days === 1 ? "tomorrow" : `in ${days}d`;
}

/** "5 Aug" — enough to place a transaction without the noise of a full date. */
function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

/*
  A 14-day spend sparkline, drawn by hand.

  Recharts is already a dependency, but it is 90 kB of it and this is fourteen
  numbers — importing a charting library into the app's first screen to draw a
  polyline is how a dashboard ends up taking two seconds to appear.
*/
function Sparkline({ points }: { points: { day: string; amount: number }[] }) {
  const path = useMemo(() => {
    if (points.length < 2) return null;
    const max = Math.max(...points.map((p) => p.amount), 1);
    const w = 100;
    const h = 28;
    const step = w / (points.length - 1);
    const coords = points.map((p, i) => [i * step, h - (p.amount / max) * h] as const);
    const line = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`).join(" ");
    const area = `${line} L${w} ${h} L0 ${h} Z`;
    return { line, area };
  }, [points]);

  if (!path) return null;
  return (
    <svg
      viewBox="0 0 100 28"
      preserveAspectRatio="none"
      className="mt-3 h-7 w-full text-muted-foreground/70"
      aria-hidden
    >
      <path d={path.area} fill="currentColor" opacity="0.12" />
      <path
        d={path.line}
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

/** The four module shortcuts under the fold. */
const MODULES = [
  { to: "/money/transactions", label: "Transactions", icon: Receipt, blurb: "Log and review spending" },
  { to: "/tasks", label: "Tasks", icon: CheckCircle2, blurb: "Today, upcoming, projects" },
  { to: "/notes", label: "Notes", icon: StickyNote, blurb: "Markdown, folders, search" },
  { to: "/memories", label: "Memories", icon: Brain, blurb: "Things worth keeping" },
];

export default function Dashboard() {
  const { user } = useAuth();
  const toast = useToast();
  // Set by the sign-in that cancelled a pending deletion (see pages/Login.tsx).
  const [params] = useSearchParams();
  const restored = params.get("restored") === "1";
  const [summary, setSummary] = useState<Summary | null>(null);

  const load = useCallback(async () => {
    setSummary((await api.dashboardSummary()) as Summary);
  }, []);

  const { error, reload } = useAuthenticatedLoad(load);

  /*
    Ticking an item updates locally first. The dashboard is a glance surface —
    waiting on a round trip before the checkbox moves would make it feel broken
    — and a failed write is reconciled by reloading the real state.
  */
  async function toggleItem(itemId: number, done: boolean) {
    const checklist = summary?.checklist;
    if (!checklist) return;

    setSummary((prev) =>
      prev && prev.checklist
        ? {
            ...prev,
            checklist: {
              ...prev.checklist,
              items: prev.checklist.items.map((i) => (i.id === itemId ? { ...i, done } : i)),
            },
          }
        : prev,
    );

    try {
      await api.updateChecklistItem(checklist.id, itemId, { done });
    } catch {
      toast.error("Could not save that tick", "Reloading the checklist.");
      reload();
    }
  }

  const firstName = user?.name?.split(" ")[0] ?? "there";
  const needsYou = (summary?.today.tasks.length ?? 0) + (summary?.today.bills.length ?? 0);
  const s = summary?.stats;

  const dueSoonTotal = (summary?.today.bills ?? []).reduce((sum, b) => sum + b.amount, 0);

  return (
    <PageShell className="space-y-7">
      {/*
        Signing in is what cancels a scheduled deletion, and it happens
        server-side without ceremony — so this is the only place the user
        finds out it worked. Worth a banner, not a toast: "did my data come
        back?" is not a question to answer for two seconds and then hide.
      */}
      {restored && (
        <Card className="flex items-start gap-3 border-emerald-400/30 bg-emerald-400/[0.06] p-4">
          <RotateCcw className="mt-0.5 size-4 shrink-0 text-emerald-400" />
          <div>
            <p className="text-sm font-medium">Welcome back — your account is restored.</p>
            <p className="mt-1 text-sm text-muted-foreground">
              The deletion was cancelled and nothing was lost. Everything is exactly where you left
              it.
            </p>
          </div>
        </Card>
      )}

      {error && (
        <Card className="p-4">
          <LoadError message={error} onRetry={reload} />
        </Card>
      )}

      {/*
        The greeting is the page title. A sticky bar reading "Dashboard" above a
        screen that already said "Welcome back, Aarav" was labelling the obvious
        and costing 60px of a phone screen to do it.
      */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">
            {new Date().toLocaleDateString("en-IN", {
              weekday: "long",
              day: "numeric",
              month: "long",
            })}
          </p>
          <h1 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">
            {summary?.greeting ?? `Welcome back, ${firstName}`}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {!summary
              ? "Pulling everything together…"
              : needsYou > 0
                ? `${needsYou} thing${needsYou === 1 ? "" : "s"} need${needsYou === 1 ? "s" : ""} you today.`
                : "Nothing is due. Here is where everything stands."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" asChild>
            <Link to="/money">
              Open Money
              <ArrowRight />
            </Link>
          </Button>
          <AddTransactionDialog
            onCreated={() => {
              announceDataChanged();
              reload();
            }}
            trigger={
              <Button>
                <Plus />
                Add transaction
              </Button>
            }
          />
        </div>
      </div>

      {/* ---------- The four numbers ---------- */}
      {!summary ? (
        <SkeletonStats />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Stat
            label="Current balance"
            value={formatMoney(s!.balance)}
            icon={Wallet}
            to="/money"
            sub={
              <span>
                {formatMoney(s!.monthIncome)} in this month
              </span>
            }
          />
          <Stat
            label="Spent this month"
            value={formatMoney(s!.monthSpend)}
            icon={ArrowDownLeft}
            to="/money/transactions"
            sub={
              s!.spendDelta == null ? (
                "No previous month to compare"
              ) : (
                <span>
                  <Delta value={s!.spendDelta} invert /> vs {formatMoney(s!.prevMonthSpend)} last
                  month
                </span>
              )
            }
          >
            <Sparkline points={summary.spark} />
          </Stat>
          <Stat
            label="Saved this month"
            value={s!.savingsRate == null ? "—" : `${Math.round(s!.savingsRate)}%`}
            icon={PiggyBank}
            tone={s!.savingsRate != null && s!.savingsRate < 0 ? "negative" : "default"}
            sub={
              s!.savingsRate == null
                ? "Log income to see this"
                : `${formatMoney(Math.max(0, s!.monthIncome - s!.monthSpend))} left of what came in`
            }
          >
            {s!.savingsRate != null && (
              <Meter
                className="mt-3"
                value={Math.max(0, s!.savingsRate) / 100}
                tone={s!.savingsRate >= 20 ? "positive" : s!.savingsRate >= 0 ? "warning" : "danger"}
              />
            )}
          </Stat>
          <Stat
            label="Open tasks"
            value={s!.openTasks}
            icon={CheckCircle2}
            to="/tasks"
            tone={s!.overdueTasks > 0 ? "negative" : "default"}
            sub={
              s!.overdueTasks > 0
                ? `${s!.overdueTasks} overdue`
                : `${s!.checklists} checklist${s!.checklists === 1 ? "" : "s"} · ${s!.notes} note${s!.notes === 1 ? "" : "s"}`
            }
          />
        </div>
      )}

      {/*
        Needs you today. A dashboard that only totals things is a report — this
        is the part that gives a reason to open it in the morning, and it is the
        same set the daily digest emails.
      */}
      {summary && needsYou > 0 && (
        <Section
          title="Needs you today"
          description={
            dueSoonTotal > 0
              ? `${formatMoney(dueSoonTotal)} of bills due inside a week`
              : undefined
          }
        >
          <Card className="divide-y divide-border overflow-hidden">
            {summary.today.bills.map((b) => (
              <Link
                key={`bill-${b.id}`}
                to="/money/recurring"
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg",
                    b.next_due < todayIso
                      ? "bg-rose-400/10 text-rose-400"
                      : "bg-amber-400/10 text-amber-400",
                  )}
                >
                  <CalendarClock className="size-4" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{b.name}</span>
                <span className="tnum shrink-0 text-sm font-medium">{formatMoney(b.amount)}</span>
                <Badge
                  variant={b.next_due < todayIso ? "danger" : "warning"}
                  className="w-20 shrink-0 justify-center"
                >
                  {dueLabel(b.next_due)}
                </Badge>
              </Link>
            ))}

            {summary.today.tasks.map((t) => (
              <Link
                key={`task-${t.id}`}
                to="/tasks"
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
              >
                <span
                  className={cn(
                    "flex size-8 shrink-0 items-center justify-center rounded-lg",
                    t.due_date < todayIso
                      ? "bg-rose-400/10 text-rose-400"
                      : "bg-secondary text-muted-foreground",
                  )}
                >
                  <CheckCircle2 className="size-4" />
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{t.title}</span>
                <Badge
                  variant={t.due_date < todayIso ? "danger" : "outline"}
                  className="w-20 shrink-0 justify-center"
                >
                  {dueLabel(t.due_date)}
                </Badge>
              </Link>
            ))}
          </Card>
        </Section>
      )}

      {/* ---------- Recent activity + the first checklist ---------- */}
      <div className="grid gap-4 lg:grid-cols-3">
        <Section
          className="lg:col-span-2"
          title="Recent activity"
          actions={
            <Button variant="ghost" size="sm" asChild>
              <Link to="/money/transactions">
                View all
                <ArrowRight />
              </Link>
            </Button>
          }
        >
          {!summary ? (
            <Card className="divide-y divide-border">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 p-4">
                  <Skeleton className="size-8 shrink-0 rounded-lg" />
                  <div className="flex-1">
                    <Skeleton className="h-3.5 w-36" />
                    <Skeleton className="mt-2 h-3 w-20" />
                  </div>
                  <Skeleton className="h-4 w-16" />
                </div>
              ))}
            </Card>
          ) : summary.recent.length === 0 ? (
            <EmptyState
              icon={Receipt}
              title="No transactions yet"
              description="Log your first income or expense and your balance, budgets and charts all start filling in."
              action={
                <AddTransactionDialog
                  onCreated={() => {
                    announceDataChanged();
                    reload();
                  }}
                  trigger={
                    <Button>
                      <Plus />
                      Add a transaction
                    </Button>
                  }
                />
              }
            />
          ) : (
            <Card className="divide-y divide-border overflow-hidden">
              {summary.recent.map((t) => (
                <Link
                  key={t.id}
                  to={`/money/transactions/${t.id}`}
                  className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
                >
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg",
                      t.type === "income"
                        ? "bg-emerald-400/10 text-emerald-400"
                        : "bg-secondary text-muted-foreground",
                    )}
                  >
                    {t.type === "income" ? (
                      <ArrowUpRight className="size-4" />
                    ) : (
                      <ArrowDownLeft className="size-4" />
                    )}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{t.note || t.category}</div>
                    <div className="text-xs text-muted-foreground">
                      {t.category} · {shortDate(t.occurred_on)}
                    </div>
                  </div>
                  <div
                    className={cn(
                      "tnum shrink-0 text-sm font-medium",
                      t.type === "income" ? "text-emerald-400" : "text-foreground",
                    )}
                  >
                    {t.type === "income" ? "+" : "−"}
                    {formatMoney(t.amount)}
                  </div>
                </Link>
              ))}
            </Card>
          )}
        </Section>

        <Section
          title={summary?.checklist ? "Checklist" : "Checklists"}
          actions={
            summary?.checklist ? (
              <Button variant="ghost" size="sm" asChild>
                <Link to={`/checklists/${summary.checklist.id}`}>
                  Open
                  <ArrowRight />
                </Link>
              </Button>
            ) : undefined
          }
        >
          {!summary ? (
            <Card className="p-5">
              <Skeleton className="h-4 w-28" />
              <div className="mt-5 space-y-3">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-4 w-full" />
                ))}
              </div>
            </Card>
          ) : summary.checklist ? (
            <Card className="p-5">
              <div className="flex items-center gap-2">
                {summary.checklist.emoji && (
                  <span className="text-base leading-none">{summary.checklist.emoji}</span>
                )}
                <p className="min-w-0 flex-1 truncate text-sm font-semibold">
                  {summary.checklist.name}
                </p>
              </div>
              <p className="tnum mt-1 text-xs text-muted-foreground">
                {summary.checklist.items.filter((i) => i.done).length} of{" "}
                {summary.checklist.items.length} done
              </p>
              <Meter
                className="mt-3"
                value={
                  summary.checklist.items.length
                    ? summary.checklist.items.filter((i) => i.done).length /
                      summary.checklist.items.length
                    : 0
                }
                tone="positive"
              />
              <ul className="mt-4 space-y-1">
                {summary.checklist.items.map((item) => (
                  <li key={item.id}>
                    <button
                      onClick={() => toggleItem(item.id, !item.done)}
                      className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-accent/60"
                    >
                      {/* The row button owns the toggle; this only shows the
                          state. See ui/switch.tsx. */}
                      <Checkbox checked={item.done} />
                      <span
                        className={cn(
                          "min-w-0 flex-1 truncate",
                          item.done && "text-muted-foreground line-through",
                        )}
                      >
                        {item.title}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </Card>
          ) : (
            <EmptyState
              compact
              icon={ListChecks}
              title="No checklists yet"
              description="Build one for the things you always forget — leaving home, travel packing."
              action={
                <Button size="sm" asChild>
                  <Link to="/checklists">Create a checklist</Link>
                </Button>
              }
            />
          )}
        </Section>
      </div>

      {/*
        Module shortcuts. The sidebar already links all of these, but it is
        hidden on a phone and invisible to anyone who has not yet learned it —
        and on the day-one dashboard, where every panel above is empty, these
        four cards are the only thing telling the user what the app contains.
      */}
      <Section title="Everything else">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {MODULES.map((m) => (
            <Link
              key={m.to}
              to={m.to}
              className="card-interactive group rounded-xl border border-border bg-card p-4"
            >
              <div className="flex items-center justify-between">
                <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                  <m.icon className="size-4" />
                </span>
                <ArrowRight className="size-4 text-muted-foreground/40 transition-transform group-hover:translate-x-0.5" />
              </div>
              <p className="mt-3 text-sm font-medium">{m.label}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{m.blurb}</p>
            </Link>
          ))}
        </div>
      </Section>

      {summary && summary.stats.memories > 0 && (
        <p className="flex items-center justify-center gap-2 pb-2 text-xs text-muted-foreground">
          <Sparkles className="size-3.5" />
          {summary.stats.memories} memories kept · {summary.stats.notes} notes written
        </p>
      )}
    </PageShell>
  );
}
