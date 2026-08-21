import { useCallback, useState } from "react";
import {
  Plus,
  PiggyBank,
  Trash2,
  Pencil,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Meter } from "@/components/ui/stat";
import { PageShell, PageHeader, EmptyState } from "@/components/ui/page";
import { SkeletonCards } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import BudgetDialog from "@/components/BudgetDialog";
import LoadError from "@/components/LoadError";
import { getCategoryIcon } from "@/components/CategoryPicker";
import { api, formatMoney, type Budget } from "@/lib/api";
import { useAuthenticatedLoad } from "@/lib/useAuthenticatedLoad";
import { cn } from "@/lib/utils";

type Totals = { limit: number; spent: number; remaining: number };

/** Green under 80%, amber approaching, red past the line. */
function tone(percent: number, over: boolean): "positive" | "warning" | "danger" {
  if (over) return "danger";
  if (percent >= 80) return "warning";
  return "positive";
}

const TONE_TEXT = {
  positive: "text-emerald-400",
  warning: "text-amber-400",
  danger: "text-rose-400",
} as const;

/** YYYY-MM for the user's local month, and the label people read. */
function monthKey(offset = 0): string {
  const d = new Date();
  d.setDate(1);
  d.setMonth(d.getMonth() + offset);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  return new Date(y, m - 1, 1).toLocaleDateString("en-IN", { month: "long", year: "numeric" });
}

/**
 * How far through the month we are, as a fraction.
 *
 * The single most useful thing a budget screen can tell you is not "you have
 * spent 70%" but "you have spent 70% on day 12" — the same number is fine in
 * one case and a problem in the other. Past months are complete by definition.
 */
function monthProgress(key: string): number {
  if (key !== monthKey()) return 1;
  const now = new Date();
  const days = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  return now.getDate() / days;
}

export default function Budgets() {
  /*
    Budgets were current-month only, so there was no way to see whether last
    month actually went well — which is the only way to know a limit is doing
    anything. Spend is derived from transactions, so any past month can be
    reconstructed without storing it.
  */
  const [month, setMonth] = useState(monthKey);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const isCurrentMonth = month === monthKey();
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();

  const load = useCallback(async () => {
    const { budgets, totals } = await api.listBudgets(month);
    setBudgets(budgets);
    setTotals(totals);
  }, [month]);

  const { loading, error, reload } = useAuthenticatedLoad(load);

  async function remove(b: Budget) {
    const ok = await confirm({
      title: `Remove the ${b.category} budget?`,
      description: "Your transactions are untouched — this only stops tracking against a limit.",
      confirmLabel: "Remove budget",
    });
    if (!ok) return;
    setBusyId(b.id);
    try {
      await api.deleteBudget(b.id);
      toast.success(`${b.category} budget removed`);
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  const overallPercent =
    totals && totals.limit > 0 ? Math.round((totals.spent / totals.limit) * 100) : 0;
  const overallOver = totals ? totals.spent > totals.limit : false;
  const elapsed = monthProgress(month);
  const overCount = budgets.filter((b) => b.over).length;

  return (
    <PageShell className="space-y-6">
      {confirmDialog}
      <PageHeader
        title="Budgets"
        description="A monthly ceiling per category. The bar turns amber at 80% and red when you cross it."
        actions={
          <>
            {/* Month stepper. It used to be three unlabelled chevrons under the
                heading; it is a single control now, which is what it is. */}
            <div className="flex items-center rounded-md border border-border">
              <button
                onClick={() => setMonth(monthKey(-1))}
                aria-label="Previous month"
                className="flex size-9 items-center justify-center rounded-l-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:size-8"
              >
                <ChevronLeft className="size-4" />
              </button>
              <span className="min-w-36 border-x border-border px-3 text-center text-[0.8125rem] font-medium leading-8">
                {monthLabel(month)}
              </span>
              <button
                onClick={() => setMonth(monthKey())}
                disabled={isCurrentMonth}
                aria-label="This month"
                className="flex size-9 items-center justify-center rounded-r-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent sm:size-8"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
            <BudgetDialog
              onSaved={reload}
              trigger={
                <Button>
                  <Plus />
                  Add budget
                </Button>
              }
            />
          </>
        }
      />

      {loading ? (
        <SkeletonCards count={6} />
      ) : error ? (
        <Card className="p-4">
          <LoadError message={error} onRetry={reload} />
        </Card>
      ) : budgets.length === 0 ? (
        <EmptyState
          icon={PiggyBank}
          title={isCurrentMonth ? "No budgets yet" : `No budgets in ${monthLabel(month)}`}
          description="Set a monthly limit on the categories that get away from you — groceries, dining, shopping — and watch the bar rather than the balance."
          action={
            <BudgetDialog
              onSaved={reload}
              trigger={
                <Button>
                  <Plus />
                  Create a budget
                </Button>
              }
            />
          }
        />
      ) : (
        <>
          {/* Everything, at a glance */}
          {totals && (
            <Card className="p-5">
              <div className="flex flex-wrap items-end justify-between gap-4">
                <div>
                  <p className="eyebrow">Spent in {monthLabel(month).split(" ")[0]}</p>
                  <p className="tnum mt-2 text-3xl font-semibold tracking-tight">
                    {formatMoney(totals.spent)}
                    <span className="ml-2 text-base font-normal text-muted-foreground">
                      of {formatMoney(totals.limit)}
                    </span>
                  </p>
                </div>
                <div className="text-right">
                  <p
                    className={cn(
                      "tnum text-sm font-medium",
                      TONE_TEXT[tone(overallPercent, overallOver)],
                    )}
                  >
                    {overallOver
                      ? `${formatMoney(-totals.remaining)} over`
                      : `${formatMoney(totals.remaining)} left`}
                  </p>
                  {overCount > 0 && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      {overCount} categor{overCount === 1 ? "y is" : "ies are"} over
                    </p>
                  )}
                </div>
              </div>

              <div className="relative mt-4">
                <Meter value={overallPercent / 100} tone={tone(overallPercent, overallOver)} />
                {/*
                  The pace marker: where spending would be if it were even across
                  the month. Being left of it is the whole game, and no amount of
                  percentage text says it as fast as a line does.
                */}
                {isCurrentMonth && (
                  <div
                    className="absolute -top-1 h-3.5 w-px bg-foreground/50"
                    style={{ left: `${elapsed * 100}%` }}
                    title="Where an even month would be by today"
                  />
                )}
              </div>
              {isCurrentMonth && (
                <p className="mt-2 text-xs text-muted-foreground">
                  {Math.round(elapsed * 100)}% through the month · the marker shows an even pace
                </p>
              )}
            </Card>
          )}

          {/* Per-category */}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {budgets.map((b) => {
              const Icon = getCategoryIcon(b.category);
              const t = tone(b.percent, b.over);
              // Ahead of pace by more than 10 points is worth flagging even when
              // the category is nowhere near its limit yet.
              const paceOff = isCurrentMonth && !b.over && b.percent / 100 - elapsed > 0.1;
              return (
                <Card key={b.id} className="p-5">
                  <div className="flex items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary">
                      <Icon className={cn("size-4", TONE_TEXT[t])} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{b.category}</p>
                      <p className="tnum text-xs text-muted-foreground">
                        {formatMoney(b.limit)} a month
                      </p>
                    </div>
                    {/*
                      Both controls are always visible. They used to appear on
                      hover, which meant that on a phone — where there is no
                      hover — a budget could be created and then never edited or
                      removed again.
                    */}
                    <div className="flex shrink-0 items-center">
                      <BudgetDialog
                        budget={b}
                        onSaved={reload}
                        trigger={
                          <button
                            aria-label={`Edit the ${b.category} limit`}
                            className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:size-8"
                          >
                            <Pencil className="size-4" />
                          </button>
                        }
                      />
                      <button
                        onClick={() => remove(b)}
                        disabled={busyId === b.id}
                        aria-label={`Remove the ${b.category} budget`}
                        className="flex size-9 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-rose-400 sm:size-8"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>
                  </div>

                  <div className="mt-5">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="tnum text-xl font-semibold tracking-tight">
                        {formatMoney(b.spent)}
                      </span>
                      <span className={cn("tnum text-sm font-medium", TONE_TEXT[t])}>
                        {b.percent}%
                      </span>
                    </div>
                    <div className="relative mt-2.5">
                      <Meter value={b.percent / 100} tone={t} />
                      {isCurrentMonth && (
                        <div
                          className="absolute -top-1 h-3.5 w-px bg-foreground/40"
                          style={{ left: `${elapsed * 100}%` }}
                        />
                      )}
                    </div>
                    <div className="mt-2.5 flex items-center justify-between gap-2 text-xs">
                      {b.over ? (
                        <span className="tnum flex items-center gap-1.5 font-medium text-rose-400">
                          <AlertTriangle className="size-3.5" />
                          {formatMoney(-b.remaining)} over
                        </span>
                      ) : (
                        <span className="tnum text-muted-foreground">
                          {formatMoney(b.remaining)} left
                        </span>
                      )}
                      {paceOff && <Badge variant="warning">Ahead of pace</Badge>}
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </PageShell>
  );
}
