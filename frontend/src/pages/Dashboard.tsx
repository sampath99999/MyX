import { useCallback, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Sparkles,
  Wallet,
  CheckCircle2,
  ListChecks,
  ArrowDownLeft,
  ArrowUpRight,
  Bell,
  CalendarClock,
  Check,
  ArrowRight,
  RotateCcw,
} from "lucide-react";
import { Card } from "@/components/ui/card";
import LoadError from "@/components/LoadError";
import { useAuth } from "@/lib/auth";
import { api, formatMoney } from "@/lib/api";
import { useAuthenticatedLoad } from "@/lib/useAuthenticatedLoad";

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
    openTasks: number;
    notes: number;
    checklists: number;
  };
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
    (new Date(`${iso}T00:00:00`).getTime() - new Date(`${todayIso}T00:00:00`).getTime()) / 86_400_000,
  );
  return days === 1 ? "tomorrow" : `${days}d`;
}

/** "5 Aug" — enough to place a transaction without the noise of a full date. */
function shortDate(iso: string): string {
  const d = new Date(`${iso}T00:00:00`);
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export default function Dashboard() {
  const { user } = useAuth();
  // Set by the sign-in that cancelled a pending deletion (see pages/Login.tsx).
  const [params] = useSearchParams();
  const restored = params.get("restored") === "1";
  const [summary, setSummary] = useState<Summary | null>(null);

  const load = useCallback(async () => {
    setSummary(await api.dashboardSummary());
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
      reload();
    }
  }

  const firstName = user?.name?.split(" ")[0] ?? "there";
  const needsYou = (summary?.today.tasks.length ?? 0) + (summary?.today.bills.length ?? 0);

  const stats = [
    {
      label: "Current Balance",
      value: summary ? formatMoney(summary.stats.balance) : "—",
      icon: Wallet,
      hint: "Across all accounts",
      accent: "text-emerald-400",
      to: "/money",
    },
    {
      label: "Spent This Month",
      value: summary ? formatMoney(summary.stats.monthSpend) : "—",
      icon: ArrowDownLeft,
      hint: "So far this month",
      accent: "text-amber-400",
      to: "/money",
    },
    {
      label: "Open Tasks",
      value: summary ? summary.stats.openTasks : "—",
      icon: CheckCircle2,
      hint: "Still to do",
      accent: "text-sky-400",
      to: "/tasks",
    },
    {
      label: "Checklists",
      value: summary ? summary.stats.checklists : "—",
      icon: ListChecks,
      hint: "Reusable routines",
      accent: "text-violet-400",
      to: "/checklists",
    },
  ];

  return (
    <>
      <div className="p-6 lg:p-8 space-y-8">
        {/*
          Signing in is what cancels a scheduled deletion, and it happens
          server-side without ceremony — so this is the only place the user
          finds out it worked. Worth a banner, not a toast: "did my data come
          back?" is not a question to answer for two seconds and then hide.
        */}
        {restored && (
          <Card className="glass flex items-start gap-3 border-emerald-500/30 p-4">
            <RotateCcw className="mt-0.5 h-5 w-5 shrink-0 text-emerald-400" />
            <div>
              <p className="font-medium">Welcome back — your account is restored.</p>
              <p className="mt-1 text-sm text-muted-foreground">
                The deletion was cancelled and nothing was lost. Everything is exactly where you
                left it.
              </p>
            </div>
          </Card>
        )}

        {error && (
          <Card className="glass p-4">
            <LoadError message={error} onRetry={reload} />
          </Card>
        )}

        {/*
          The greeting is the page title now. A sticky bar reading "Dashboard"
          above a screen that already said "Welcome back, Sampath" was labelling
          the obvious and costing 60px of a phone screen to do it.
        */}
        <div className="animate-in-up">
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {new Date().toLocaleDateString("en-US", {
              weekday: "long",
              month: "long",
              day: "numeric",
            })}
          </p>
          <h2 className="mt-1 text-3xl font-bold tracking-tight">
            {summary?.greeting ?? `Welcome back, ${firstName}`} 👋
          </h2>
          <p className="mt-1.5 text-muted-foreground">
            {needsYou > 0
              ? `${needsYou} thing${needsYou === 1 ? "" : "s"} need you, and here's where everything else stands.`
              : "Nothing is due. Here's where everything stands."}
          </p>
        </div>

        {/* Stat cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
          {stats.map((s, i) => {
            const inner = (
              <Card
                className="glass p-5 h-full animate-in-up transition-transform duration-300 hover:-translate-y-1"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-center justify-between">
                  <div className={`rounded-lg bg-background/40 p-2 ${s.accent}`}>
                    <s.icon className="h-5 w-5" />
                  </div>
                  {s.to && <ArrowRight className="h-4 w-4 text-muted-foreground/50" />}
                </div>
                <div className="mt-4 text-2xl font-bold tracking-tight">{s.value}</div>
                <div className="mt-1 text-sm font-medium text-muted-foreground">{s.label}</div>
                <div className="mt-0.5 text-xs text-muted-foreground/70">{s.hint}</div>
              </Card>
            );
            return s.to ? (
              <Link key={s.label} to={s.to} className="block">
                {inner}
              </Link>
            ) : (
              <div key={s.label}>{inner}</div>
            );
          })}
        </div>

        {/*
          Needs you today. A dashboard that only totals things is a report —
          this is the part that gives a reason to open it in the morning, and it
          is the same set the daily digest emails.
        */}
        {needsYou > 0 && (
          <Card className="glass p-6 animate-in-up">
            <div className="flex items-center gap-2">
              <Bell className="h-4 w-4 text-amber-300" />
              <h3 className="font-semibold">
                Needs you {summary!.today.tasks.length > 0 ? "today" : "this week"}
              </h3>
            </div>

            <div className="mt-4 grid gap-x-8 gap-y-2 sm:grid-cols-2">
              {summary!.today.bills.map((b) => (
                <Link
                  key={`bill-${b.id}`}
                  to="/money/recurring"
                  className="flex items-center gap-3 rounded-lg py-2 transition-colors hover:bg-accent/40"
                >
                  <CalendarClock
                    className={`h-4 w-4 shrink-0 ${
                      b.next_due < todayIso ? "text-rose-300" : "text-amber-300"
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{b.name}</span>
                  <span className="shrink-0 text-sm font-semibold tabular-nums">
                    {formatMoney(b.amount)}
                  </span>
                  <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                    {dueLabel(b.next_due)}
                  </span>
                </Link>
              ))}

              {summary!.today.tasks.map((t) => (
                <Link
                  key={`task-${t.id}`}
                  to="/tasks"
                  className="flex items-center gap-3 rounded-lg py-2 transition-colors hover:bg-accent/40"
                >
                  <CheckCircle2
                    className={`h-4 w-4 shrink-0 ${
                      t.due_date < todayIso ? "text-rose-300" : "text-sky-300"
                    }`}
                  />
                  <span className="min-w-0 flex-1 truncate text-sm">{t.title}</span>
                  <span className="w-16 shrink-0 text-right text-xs text-muted-foreground">
                    {dueLabel(t.due_date)}
                  </span>
                </Link>
              ))}
            </div>
          </Card>
        )}

        {/* Panels */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <Card className="glass lg:col-span-2 p-6 min-h-56">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Recent activity</h3>
              <Link
                to="/money/transactions"
                className="text-xs text-primary hover:underline underline-offset-4"
              >
                View money →
              </Link>
            </div>
            {summary && summary.recent.length === 0 ? (
              <div className="mt-8 flex flex-col items-center justify-center gap-3 py-8 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <p className="text-sm text-muted-foreground max-w-xs">
                  Head to the Money module to log income and expenses — your balance updates here
                  instantly.
                </p>
              </div>
            ) : (
              <ul className="mt-4 divide-y divide-border/40">
                {(summary?.recent ?? []).map((t) => (
                  <li key={t.id} className="flex items-center gap-3 py-2.5">
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
                        t.type === "income"
                          ? "bg-emerald-400/15 text-emerald-300"
                          : "bg-rose-400/15 text-rose-300"
                      }`}
                    >
                      {t.type === "income" ? (
                        <ArrowUpRight className="h-4 w-4" />
                      ) : (
                        <ArrowDownLeft className="h-4 w-4" />
                      )}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{t.note || t.category}</div>
                      <div className="text-xs text-muted-foreground">
                        {t.category} · {shortDate(t.occurred_on)}
                      </div>
                    </div>
                    <div
                      className={`shrink-0 text-sm font-semibold tabular-nums ${
                        t.type === "income" ? "text-emerald-300" : "text-foreground/80"
                      }`}
                    >
                      {t.type === "income" ? "+" : "−"}
                      {formatMoney(t.amount)}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card className="glass p-6 min-h-56">
            {summary?.checklist ? (
              <>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate font-semibold">
                    {summary.checklist.emoji ? `${summary.checklist.emoji} ` : ""}
                    {summary.checklist.name}
                  </h3>
                  <Link
                    to={`/checklists/${summary.checklist.id}`}
                    className="shrink-0 text-xs text-primary hover:underline underline-offset-4"
                  >
                    Open →
                  </Link>
                </div>
                <p className="text-xs text-muted-foreground">
                  {summary.checklist.items.filter((i) => i.done).length} of{" "}
                  {summary.checklist.items.length} done
                </p>
                <ul className="mt-4 space-y-2.5">
                  {summary.checklist.items.map((item) => (
                    <li key={item.id}>
                      <button
                        onClick={() => toggleItem(item.id, !item.done)}
                        className="flex w-full items-center gap-3 text-left text-sm"
                      >
                        <span
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors ${
                            item.done ? "border-primary bg-primary" : "border-border"
                          }`}
                        >
                          {item.done && <Check className="h-3 w-3 text-primary-foreground" />}
                        </span>
                        <span
                          className={
                            item.done ? "text-muted-foreground line-through" : "text-foreground"
                          }
                        >
                          {item.title}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <>
                <h3 className="font-semibold">Checklists</h3>
                <p className="text-xs text-muted-foreground">Routines you run again and again</p>
                <div className="mt-8 flex flex-col items-center justify-center gap-3 text-center">
                  <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <ListChecks className="h-6 w-6 text-primary" />
                  </div>
                  <p className="max-w-xs text-sm text-muted-foreground">
                    Build one for the things you always forget — leaving home, travel packing.
                  </p>
                  <Link
                    to="/checklists"
                    className="text-sm font-medium text-primary hover:underline underline-offset-4"
                  >
                    Create a checklist →
                  </Link>
                </div>
              </>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
