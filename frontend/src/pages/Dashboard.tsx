import { useCallback, useState } from "react";
import { Link } from "react-router-dom";
import {
  Sparkles,
  Wallet,
  CheckCircle2,
  ListChecks,
  ArrowDownLeft,
  ArrowUpRight,
  Check,
  Plus,
  ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import PageHeader from "@/components/PageHeader";
import AddTransactionDialog from "@/components/AddTransactionDialog";
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
  recent: RecentTransaction[];
  checklist: DashboardChecklist | null;
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
      <PageHeader
        title="Dashboard"
        subtitle={new Date().toLocaleDateString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
        })}
      >
        <AddTransactionDialog
          onCreated={reload}
          trigger={
            <Button variant="secondary" size="sm">
              <Plus className="h-4 w-4" />
              Quick add
            </Button>
          }
        />
      </PageHeader>

      <div className="p-6 lg:p-8 space-y-8">
        {error && (
          <Card className="glass p-4">
            <LoadError message={error} onRetry={reload} />
          </Card>
        )}

        {/* Greeting */}
        <div className="animate-in-up">
          <h2 className="text-3xl font-bold tracking-tight">
            {summary?.greeting ?? `Welcome back, ${firstName}`} 👋
          </h2>
          <p className="mt-1.5 text-muted-foreground">
            Here's a snapshot of your life today. Modules light up as you add them.
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
