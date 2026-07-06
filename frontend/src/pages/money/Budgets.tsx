import { useCallback, useState } from "react";
import { Plus, Target, Trash2, Loader2, Pencil, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import BudgetDialog from "@/components/BudgetDialog";
import LoadError from "@/components/LoadError";
import { getCategoryIcon } from "@/components/CategoryPicker";
import { api, formatMoney, type Budget } from "@/lib/api";
import { useAuthenticatedLoad } from "@/lib/useAuthenticatedLoad";
import { cn } from "@/lib/utils";

type Totals = { limit: number; spent: number; remaining: number };

// Colour by how close spend is to the limit.
function tone(percent: number, over: boolean) {
  if (over) return { bar: "bg-gradient-to-r from-rose-500 to-rose-400", text: "text-rose-400" };
  if (percent >= 80)
    return { bar: "bg-gradient-to-r from-amber-500 to-amber-400", text: "text-amber-400" };
  return { bar: "bg-gradient-to-r from-emerald-500 to-emerald-400", text: "text-emerald-400" };
}

export default function Budgets() {
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [totals, setTotals] = useState<Totals | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { budgets, totals } = await api.listBudgets();
    setBudgets(budgets);
    setTotals(totals);
  }, []);

  const { loading, error, reload } = useAuthenticatedLoad(load);

  async function remove(id: number) {
    setBusyId(id);
    try {
      await api.deleteBudget(id);
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  const overallPercent =
    totals && totals.limit > 0 ? Math.round((totals.spent / totals.limit) * 100) : 0;
  const overallOver = totals ? totals.spent > totals.limit : false;

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Budgets</h2>
          <p className="text-sm text-muted-foreground">Monthly spending limits by category</p>
        </div>
        <BudgetDialog
          onSaved={reload}
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Add budget
            </Button>
          }
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : error ? (
        <LoadError message={error} onRetry={reload} />
      ) : budgets.length === 0 ? (
        <Card className="glass flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Target className="h-7 w-7 text-primary" />
          </div>
          <div>
            <p className="font-medium">No budgets yet</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-xs">
              Set a monthly limit for categories like Groceries or Food &amp; Dining, and track your
              spending against it as the month goes.
            </p>
          </div>
          <BudgetDialog
            onSaved={reload}
            trigger={
              <Button size="sm" variant="secondary">
                <Plus className="h-4 w-4" />
                Create a budget
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          {/* Overall summary */}
          {totals && (
            <Card className="glass p-5">
              <div className="flex items-baseline justify-between">
                <div>
                  <div className="text-sm text-muted-foreground">Spent this month</div>
                  <div className="mt-0.5 text-2xl font-bold tracking-tight">
                    {formatMoney(totals.spent)}{" "}
                    <span className="text-base font-medium text-muted-foreground">
                      of {formatMoney(totals.limit)}
                    </span>
                  </div>
                </div>
                <div className={cn("text-right text-sm font-semibold", tone(overallPercent, overallOver).text)}>
                  {overallOver
                    ? `${formatMoney(-totals.remaining)} over`
                    : `${formatMoney(totals.remaining)} left`}
                </div>
              </div>
              <div className="mt-3 h-2.5 w-full overflow-hidden rounded-full bg-background/60">
                <div
                  className={cn("h-full rounded-full transition-all", tone(overallPercent, overallOver).bar)}
                  style={{ width: `${Math.min(overallPercent, 100)}%` }}
                />
              </div>
            </Card>
          )}

          {/* Budget cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {budgets.map((b, i) => {
              const Icon = getCategoryIcon(b.category);
              const t = tone(b.percent, b.over);
              return (
                <Card
                  key={b.id}
                  className="glass group relative p-5 animate-in-up"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-background/50">
                      <Icon className={cn("h-5 w-5", t.text)} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate font-semibold">{b.category}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatMoney(b.limit)} / month
                      </div>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                      <BudgetDialog
                        budget={b}
                        onSaved={reload}
                        trigger={
                          <button
                            title="Edit limit"
                            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                        }
                      />
                      <button
                        onClick={() => remove(b.id)}
                        disabled={busyId === b.id}
                        title="Delete"
                        className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
                      >
                        {busyId === b.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Trash2 className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Progress */}
                  <div className="mt-5">
                    <div className="flex items-baseline justify-between">
                      <span className="text-lg font-bold tracking-tight">{formatMoney(b.spent)}</span>
                      <span className={cn("text-sm font-semibold", t.text)}>{b.percent}%</span>
                    </div>
                    <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-background/60">
                      <div
                        className={cn("h-full rounded-full transition-all duration-500", t.bar)}
                        style={{ width: `${Math.min(b.percent, 100)}%` }}
                      />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-xs">
                      {b.over ? (
                        <span className="flex items-center gap-1 font-medium text-rose-400">
                          <AlertTriangle className="h-3.5 w-3.5" />
                          {formatMoney(-b.remaining)} over budget
                        </span>
                      ) : (
                        <span className="text-muted-foreground">
                          {formatMoney(b.remaining)} left
                        </span>
                      )}
                      <span className="text-muted-foreground">of {formatMoney(b.limit)}</span>
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
