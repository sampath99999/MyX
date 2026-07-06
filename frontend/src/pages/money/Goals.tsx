import { useCallback, useState } from "react";
import { Plus, Target, Trash2, Loader2, CheckCircle2, CalendarDays, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import NewGoalDialog from "@/components/NewGoalDialog";
import AddFundsDialog from "@/components/AddFundsDialog";
import LoadError from "@/components/LoadError";
import { api, formatMoney, type Goal } from "@/lib/api";
import { useAuthenticatedLoad } from "@/lib/useAuthenticatedLoad";

function daysLeft(date: string): string {
  const diff = Math.ceil(
    (new Date(date + "T00:00:00").getTime() - Date.now()) / (1000 * 60 * 60 * 24),
  );
  if (diff < 0) return "Overdue";
  if (diff === 0) return "Due today";
  if (diff < 45) return `${diff} days left`;
  const months = Math.round(diff / 30);
  return `~${months} month${months === 1 ? "" : "s"} left`;
}

export default function Goals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { goals } = await api.listGoals();
    setGoals(goals);
  }, []);

  const { loading, error, reload } = useAuthenticatedLoad(load);

  async function onDelete(id: number) {
    setDeletingId(id);
    try {
      await api.deleteGoal(id);
      await reload();
    } finally {
      setDeletingId(null);
    }
  }

  const totalTarget = goals.reduce((s, g) => s + g.target, 0);
  const totalSaved = goals.reduce((s, g) => s + g.saved, 0);

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Header row */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Savings Goals</h2>
          {goals.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {formatMoney(totalSaved)} saved toward {formatMoney(totalTarget)} across{" "}
              {goals.length} goal{goals.length === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <NewGoalDialog
          onCreated={reload}
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" />
              New goal
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
      ) : goals.length === 0 ? (
        <Card className="glass flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Target className="h-7 w-7 text-primary" />
          </div>
          <div>
            <p className="font-medium">No goals yet</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-xs">
              Create your first savings goal — a trip, a gadget, or an emergency fund — and track
              your progress.
            </p>
          </div>
          <NewGoalDialog
            onCreated={reload}
            trigger={
              <Button size="sm" variant="secondary">
                <Plus className="h-4 w-4" />
                Create a goal
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {goals.map((g, i) => {
            const done = g.percent >= 100;
            return (
              <Card
                key={g.id}
                className="glass group relative p-5 animate-in-up"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <button
                  onClick={() => onDelete(g.id)}
                  disabled={deletingId === g.id}
                  title="Delete goal"
                  className="absolute right-4 top-4 text-muted-foreground/40 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 disabled:opacity-100"
                >
                  {deletingId === g.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>

                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-background/50 text-xl">
                    {g.emoji || "🎯"}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{g.name}</div>
                    {done ? (
                      <div className="flex items-center gap-1 text-xs font-medium text-emerald-400">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Goal reached!
                      </div>
                    ) : g.target_date ? (
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <CalendarDays className="h-3.5 w-3.5" /> {daysLeft(g.target_date)}
                      </div>
                    ) : (
                      <div className="text-xs text-muted-foreground">No deadline</div>
                    )}
                  </div>
                </div>

                {/* Progress */}
                <div className="mt-5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-lg font-bold tracking-tight">{formatMoney(g.saved)}</span>
                    <span className="text-sm text-muted-foreground">of {formatMoney(g.target)}</span>
                  </div>
                  <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-background/60">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        done
                          ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                          : "bg-gradient-to-r from-primary to-violet-400"
                      }`}
                      style={{ width: `${g.percent}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex items-center justify-between text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{g.percent}%</span>
                    <span>{done ? "Complete" : `${formatMoney(g.remaining)} to go`}</span>
                  </div>
                </div>

                <AddFundsDialog
                  goal={g}
                  onDone={reload}
                  trigger={
                    <Button variant="secondary" size="sm" className="mt-5 w-full">
                      <Wallet className="h-4 w-4" />
                      {done ? "Manage funds" : "Add funds"}
                    </Button>
                  }
                />
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
