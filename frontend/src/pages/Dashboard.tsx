import { useCallback, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  CheckCircle2,
  ListChecks,
  ArrowDownLeft,
  ArrowUpRight,
  CalendarClock,
  ArrowRight,
  RotateCcw,
  Receipt,
  Plus,
  Wallet,
  Sun,
  Check,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Delta, Meter } from "@/components/ui/stat";
import { PageShell, PageHeader, Section, EmptyState } from "@/components/ui/page";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/switch";
import AddTransactionDialog from "@/components/AddTransactionDialog";
import LoadError from "@/components/LoadError";
import { useAuth } from "@/lib/auth";
import { api, formatMoney } from "@/lib/api";
import { useAuthenticatedLoad, announceDataChanged } from "@/lib/useAuthenticatedLoad";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/*
  The dashboard.

  The previous version stacked six blocks down 1,370px of a 744px window:
  a greeting, four KPI tiles, the list of things due, recent activity beside a
  checklist, four module shortcut cards, and a line counting notes and memories.
  Three things were wrong with that, and none of them were about the paint.

  The order buried the point. The greeting announced "6 things need you today"
  and then put the list of those six things 240px further down, underneath four
  money totals. The one part of this screen that is a reason to open the app in
  the morning was the third thing on it.

  It repeated itself. "Add transaction" sat here and in the app header. "Open
  Money" sat here and in the sidebar. The four module cards at the bottom
  duplicated the sidebar entirely — and now that a phone has the drawer, they
  duplicate that too. Roughly 300px of the page was navigation the shell
  already provides.

  And the totals were disconnected. Balance, spend, savings rate and open tasks
  as four equal tiles says those are four comparable facts; they are not. The
  first three are one story about this month, and the fourth belongs with the
  things that are due.

  So: what needs you, and where the money stands, side by side and both above
  the fold. Then what just happened, and the checklist. Two rows, no furniture.
*/

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
    const h = 32;
    const step = w / (points.length - 1);
    const coords = points.map((p, i) => [i * step, h - (p.amount / max) * h] as const);
    const line = coords
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
      .join(" ");
    return { line, area: `${line} L${w} ${h} L0 ${h} Z` };
  }, [points]);

  if (!path) return null;
  return (
    <svg
      viewBox="0 0 100 32"
      preserveAspectRatio="none"
      className="h-8 w-full text-brand"
      aria-hidden
    >
      <path d={path.area} fill="currentColor" opacity="0.14" />
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

/** One row in the "Needs you" card. Bills and tasks are the same shape. */
function DueRow({
  to,
  icon: Icon,
  tone,
  title,
  amount,
  due,
}: {
  to: string;
  icon: React.ElementType;
  tone: "overdue" | "soon" | "neutral";
  title: string;
  amount?: number;
  due: string;
}) {
  return (
    <Link
      to={to}
      className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/50"
    >
      <span
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-lg",
          tone === "overdue"
            ? "bg-rose-400/10 text-rose-400"
            : tone === "soon"
              ? "bg-amber-400/10 text-amber-400"
              : "bg-secondary text-muted-foreground",
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1 truncate text-sm font-medium">{title}</span>
      {amount != null && (
        <span className="tnum shrink-0 text-sm font-medium">{formatMoney(amount)}</span>
      )}
      {/*
        A fixed width lines the badges up into a column, which is worth having
        when there is room for it. At 320px it was taking 72px from a title that
        had 66 — "Broadband" lost its last letter to keep a badge reading "in
        2d" the same width as one reading "overdue". Content-width on a phone,
        aligned column from `sm` up.
      */}
      <Badge
        variant={tone === "overdue" ? "danger" : tone === "soon" ? "warning" : "outline"}
        className="shrink-0 justify-center sm:w-[4.5rem]"
      >
        {due}
      </Badge>
    </Link>
  );
}

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
  const s = summary?.stats;
  const bills = summary?.today.bills ?? [];
  const tasks = summary?.today.tasks ?? [];
  const needsYou = bills.length + tasks.length;
  const overdue =
    bills.filter((b) => b.next_due < todayIso).length +
    tasks.filter((t) => t.due_date < todayIso).length;

  /*
    A genuinely empty account, as opposed to a quiet day. Four empty panels tell
    a new user that the app is broken; one panel telling them where to start
    tells them what it is for. Checked across every module rather than on
    transactions alone, so someone who came for the tasks and never logged a
    rupee is not told to start over.
  */
  const isNewAccount =
    !!s &&
    s.balance === 0 &&
    s.openTasks === 0 &&
    s.notes === 0 &&
    s.checklists === 0 &&
    s.memories === 0 &&
    (summary?.recent.length ?? 0) === 0;

  const statusLine = !summary
    ? "Pulling everything together…"
    : isNewAccount
      ? "Let's get the first few things in."
      : overdue > 0
        ? `${overdue} ${overdue === 1 ? "thing is" : "things are"} overdue${needsYou > overdue ? `, and ${needsYou - overdue} more ${needsYou - overdue === 1 ? "is" : "are"} due.` : "."}`
        : needsYou > 0
          ? `${needsYou} ${needsYou === 1 ? "thing needs" : "things need"} you today.`
          : "Nothing is due. Here is where everything stands.";

  return (
    <PageShell className="space-y-6">
      {/*
        Signing in is what cancels a scheduled deletion, and it happens
        server-side without ceremony — so this is the only place the user finds
        out it worked. Worth a banner, not a toast: "did my data come back?" is
        not a question to answer for two seconds and then hide.
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
        The greeting is the page title, and it carries no buttons. "Add
        transaction" is in the app header on every screen and is the floating
        button on a phone; "Open Money" is in the sidebar and the drawer. Both
        used to sit here as well.
      */}
      <PageHeader
        eyebrow={new Date().toLocaleDateString("en-IN", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
        title={summary?.greeting ?? `Welcome back, ${firstName}`}
        description={statusLine}
      />

      {isNewAccount ? (
        <FirstRun onAdded={reload} />
      ) : (
        <>
          {/* ---------- What needs you, and where the money stands ---------- */}
          <div className="grid items-start gap-4 lg:grid-cols-3">
            <Section
              className="lg:col-span-2"
              title="Needs you"
              description={
                needsYou > 0
                  ? "Bills due inside a week, and tasks due today or overdue."
                  : undefined
              }
              actions={
                needsYou > 0 ? (
                  <Button variant="ghost" size="sm" asChild>
                    <Link to="/tasks">
                      All tasks
                      <ArrowRight />
                    </Link>
                  </Button>
                ) : undefined
              }
            >
              {!summary ? (
                <Card className="divide-y divide-border">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="flex items-center gap-3 p-4">
                      <Skeleton className="size-8 shrink-0 rounded-lg" />
                      <Skeleton className="h-3.5 flex-1" />
                      <Skeleton className="h-5 w-16 rounded-full" />
                    </div>
                  ))}
                </Card>
              ) : needsYou === 0 ? (
                /*
                  A calm day still gets a card. The section used to disappear
                  entirely when nothing was due, so the page had a different
                  shape depending on the morning — and "nothing is due" is a
                  useful thing to be told plainly, not by absence.
                */
                <Card className="flex flex-col items-center px-6 py-12 text-center">
                  <span className="mb-3 flex size-10 items-center justify-center rounded-xl bg-emerald-400/10 text-emerald-400">
                    <Check className="size-5" />
                  </span>
                  <p className="text-sm font-semibold">You are clear for today</p>
                  <p className="mt-1 max-w-xs text-sm text-muted-foreground">
                    No bills due this week and nothing on the task list with today's date.
                  </p>
                </Card>
              ) : (
                <Card className="divide-y divide-border overflow-hidden">
                  {bills.map((b) => (
                    <DueRow
                      key={`bill-${b.id}`}
                      to="/money/recurring"
                      icon={CalendarClock}
                      tone={b.next_due < todayIso ? "overdue" : "soon"}
                      title={b.name}
                      amount={b.amount}
                      due={dueLabel(b.next_due)}
                    />
                  ))}
                  {tasks.map((t) => (
                    <DueRow
                      key={`task-${t.id}`}
                      to="/tasks"
                      icon={CheckCircle2}
                      tone={t.due_date < todayIso ? "overdue" : "neutral"}
                      title={t.title}
                      due={dueLabel(t.due_date)}
                    />
                  ))}
                </Card>
              )}
            </Section>

            {/*
              Money, as one story rather than three tiles. Balance is the
              headline; in and out are what moved it this month; the sparkline
              is the shape of the spending behind that; the meter is what is
              left of what came in.
            */}
            <Section
              title="Money"
              actions={
                <Button variant="ghost" size="sm" asChild>
                  <Link to="/money">
                    Open
                    <ArrowRight />
                  </Link>
                </Button>
              }
            >
              {!summary ? (
                <Card className="p-5">
                  <Skeleton className="h-3 w-24" />
                  <Skeleton className="mt-3 h-8 w-40" />
                  <Skeleton className="mt-6 h-3 w-full" />
                  <Skeleton className="mt-3 h-8 w-full" />
                </Card>
              ) : (
                <Card className="p-5">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-medium text-muted-foreground">Current balance</p>
                    <Wallet className="size-4 shrink-0 text-muted-foreground/70" />
                  </div>
                  <p className="tnum mt-1.5 text-[1.75rem] font-semibold leading-none tracking-tight">
                    {formatMoney(s!.balance)}
                  </p>

                  <div className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-4">
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <ArrowUpRight className="size-3.5 text-emerald-400" />
                        In this month
                      </p>
                      <p className="tnum mt-1 truncate text-sm font-semibold">
                        {formatMoney(s!.monthIncome)}
                      </p>
                      <p className="mt-0.5 text-xs">
                        <Delta value={s!.incomeDelta} />
                      </p>
                    </div>
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                        <ArrowDownLeft className="size-3.5 text-muted-foreground" />
                        Out this month
                      </p>
                      <p className="tnum mt-1 truncate text-sm font-semibold">
                        {formatMoney(s!.monthSpend)}
                      </p>
                      <p className="mt-0.5 text-xs">
                        <Delta value={s!.spendDelta} invert />
                      </p>
                    </div>
                  </div>

                  <div className="mt-4">
                    <p className="mb-1 text-[11px] text-muted-foreground">Last 14 days</p>
                    <Sparkline points={summary.spark} />
                  </div>

                  {s!.savingsRate != null && (
                    <div className="mt-4 border-t border-border pt-4">
                      <div className="flex items-baseline justify-between gap-2">
                        <p className="text-xs text-muted-foreground">Kept this month</p>
                        <p className="tnum text-sm font-semibold">
                          {Math.round(s!.savingsRate)}%
                        </p>
                      </div>
                      <Meter
                        className="mt-2"
                        value={Math.max(0, s!.savingsRate) / 100}
                        tone={
                          s!.savingsRate >= 20
                            ? "positive"
                            : s!.savingsRate >= 0
                              ? "warning"
                              : "danger"
                        }
                      />
                      <p className="mt-2 text-xs text-muted-foreground">
                        {formatMoney(Math.max(0, s!.monthIncome - s!.monthSpend))} left of what came
                        in
                      </p>
                    </div>
                  )}
                </Card>
              )}
            </Section>
          </div>

          {/* ---------- What just happened, and the checklist ---------- */}
          <div className="grid items-start gap-4 lg:grid-cols-3">
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
                  compact
                  icon={Receipt}
                  title="No transactions yet"
                  description="Log your first income or expense and the balance, budgets and charts all start filling in."
                  action={
                    <AddTransactionDialog
                      onCreated={() => {
                        announceDataChanged();
                        reload();
                      }}
                      trigger={
                        <Button size="sm">
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
                      to={`/money/transactions?view_id=${t.id}`}
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
                  <ul className="mt-4 space-y-0.5">
                    {summary.checklist.items.map((item) => (
                      <li key={item.id}>
                        <button
                          onClick={() => toggleItem(item.id, !item.done)}
                          className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors hover:bg-accent/60"
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
        </>
      )}
    </PageShell>
  );
}

/*
  Day one.

  An account with nothing in it used to render the full dashboard: four zeroes,
  an empty activity list, an empty checklist card and a row of module shortcuts.
  That is a screen reporting, accurately, that the product is empty — which is
  the least useful thing it could say to the one person who has never used it.

  Three things to do, in the order that makes the rest of the app light up: a
  transaction gives the balance, budgets and charts something to work with; a
  task gives "needs you" something to show; a checklist is the cheapest habit to
  start. Each is a real link, not a tour.
*/
function FirstRun({ onAdded }: { onAdded: () => void }) {
  const steps = [
    {
      icon: Receipt,
      title: "Log something you spent",
      body: "The balance, budgets, charts and the monthly summary all build from this.",
      action: (
        <AddTransactionDialog
          onCreated={() => {
            announceDataChanged();
            onAdded();
          }}
          trigger={
            <Button size="sm">
              <Plus />
              Add a transaction
            </Button>
          }
        />
      ),
    },
    {
      icon: CheckCircle2,
      title: "Add a task with a date",
      body: "Anything due today or overdue shows up on this screen, and in the morning email.",
      action: (
        <Button size="sm" variant="outline" asChild>
          <Link to="/tasks">Open Tasks</Link>
        </Button>
      ),
    },
    {
      icon: ListChecks,
      title: "Make a checklist",
      body: "For the things you do again and again — leaving home, packing, a weekly reset.",
      action: (
        <Button size="sm" variant="outline" asChild>
          <Link to="/checklists">Open Checklists</Link>
        </Button>
      ),
    },
  ];

  return (
    <Card className="overflow-hidden">
      <div className="flex items-start gap-3 border-b border-border bg-brand/[0.06] px-5 py-4">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-brand/15 text-brand">
          <Sun className="size-[1.15rem]" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Your account is ready</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Three things fill this screen in. None of them take a minute, and nothing here is
            required.
          </p>
        </div>
      </div>

      <ol className="divide-y divide-border">
        {steps.map((step, i) => (
          <li
            key={step.title}
            className="flex flex-col gap-3 px-5 py-4 sm:flex-row sm:items-center sm:gap-4"
          >
            <span className="tnum flex size-7 shrink-0 items-center justify-center rounded-full border border-border text-xs font-semibold text-muted-foreground">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2 text-sm font-medium">
                <step.icon className="size-4 shrink-0 text-muted-foreground" />
                {step.title}
              </p>
              <p className="mt-0.5 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
            </div>
            <div className="shrink-0 sm:pl-4">{step.action}</div>
          </li>
        ))}
      </ol>
    </Card>
  );
}
