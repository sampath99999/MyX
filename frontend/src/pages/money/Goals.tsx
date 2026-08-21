import { useCallback, useMemo, useState } from "react";
import { Plus, Target, Trash2, CheckCircle2, CalendarDays, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Stat, Meter } from "@/components/ui/stat";
import { PageShell, PageHeader, Section, EmptyState } from "@/components/ui/page";
import { SkeletonCards } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import NewGoalDialog from "@/components/NewGoalDialog";
import AddFundsDialog from "@/components/AddFundsDialog";
import LoadError from "@/components/LoadError";
import { api, formatMoney, type Goal } from "@/lib/api";
import { useAuthenticatedLoad } from "@/lib/useAuthenticatedLoad";
import { cn } from "@/lib/utils";

function daysUntil(date: string) {
  return Math.ceil((new Date(date + "T00:00:00").getTime() - Date.now()) / 86_400_000);
}

function deadlineLabel(date: string): string {
  const diff = daysUntil(date);
  if (diff < 0) return `${-diff} days past`;
  if (diff === 0) return "Due today";
  if (diff < 45) return `${diff} days left`;
  const months = Math.round(diff / 30);
  return `~${months} month${months === 1 ? "" : "s"} left`;
}

/**
 * What this goal needs per month to land on time.
 *
 * A goal screen that only shows a percentage answers "how far am I" and never
 * "am I going to make it" — which is the question that changes behaviour. With
 * a target date the answer is arithmetic, so the card does it.
 */
function monthlyNeeded(g: Goal): number | null {
  if (!g.target_date || g.percent >= 100) return null;
  const days = daysUntil(g.target_date);
  if (days <= 0) return null;
  return g.remaining / Math.max(1, days / 30);
}

export default function Goals() {
  const [goals, setGoals] = useState<Goal[]>([]);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();

  const load = useCallback(async () => {
    const { goals } = await api.listGoals();
    setGoals(goals);
  }, []);

  const { loading, error, reload } = useAuthenticatedLoad(load);

  async function onDelete(g: Goal) {
    const ok = await confirm({
      title: `Delete "${g.name}"?`,
      description: `The goal and its ${formatMoney(g.saved)} of recorded contributions are removed. Your balance is not affected — goals never moved real money.`,
      confirmLabel: "Delete goal",
    });
    if (!ok) return;
    setDeletingId(g.id);
    try {
      await api.deleteGoal(g.id);
      toast.success(`"${g.name}" deleted`);
      await reload();
    } finally {
      setDeletingId(null);
    }
  }

  const { active, done, totalTarget, totalSaved } = useMemo(() => {
    const done = goals.filter((g) => g.percent >= 100);
    return {
      active: goals.filter((g) => g.percent < 100),
      done,
      totalTarget: goals.reduce((s, g) => s + g.target, 0),
      totalSaved: goals.reduce((s, g) => s + g.saved, 0),
    };
  }, [goals]);

  const card = (g: Goal) => {
    const complete = g.percent >= 100;
    const perMonth = monthlyNeeded(g);
    const late = g.target_date != null && !complete && daysUntil(g.target_date) < 0;
    return (
      <Card key={g.id} className="flex flex-col p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-lg">
            {g.emoji || "🎯"}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{g.name}</p>
            {complete ? (
              <p className="mt-0.5 flex items-center gap-1.5 text-xs font-medium text-emerald-400">
                <CheckCircle2 className="size-3.5" /> Reached
              </p>
            ) : g.target_date ? (
              <p
                className={cn(
                  "mt-0.5 flex items-center gap-1.5 text-xs",
                  late ? "font-medium text-rose-400" : "text-muted-foreground",
                )}
              >
                <CalendarDays className="size-3.5" /> {deadlineLabel(g.target_date)}
              </p>
            ) : (
              <p className="mt-0.5 text-xs text-muted-foreground">No deadline</p>
            )}
          </div>
          {/*
            Always visible. It used to be `opacity-0 group-hover:opacity-100`,
            which on a touchscreen means a goal can be created and then never
            deleted.
          */}
          <button
            onClick={() => onDelete(g)}
            disabled={deletingId === g.id}
            aria-label={`Delete ${g.name}`}
            className="-mr-1.5 -mt-1.5 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-rose-400"
          >
            <Trash2 className="size-4" />
          </button>
        </div>

        <div className="mt-5">
          <div className="flex items-baseline justify-between gap-2">
            <span className="tnum text-xl font-semibold tracking-tight">{formatMoney(g.saved)}</span>
            <span className="tnum text-sm text-muted-foreground">of {formatMoney(g.target)}</span>
          </div>
          <Meter className="mt-2.5" value={g.percent / 100} tone={complete ? "positive" : "default"} />
          <div className="mt-2.5 flex items-center justify-between gap-2 text-xs">
            <span className="tnum font-medium">{g.percent}%</span>
            <span className="tnum text-muted-foreground">
              {complete ? "Complete" : `${formatMoney(g.remaining)} to go`}
            </span>
          </div>
        </div>

        {perMonth != null && (
          <p className="tnum mt-3 rounded-md bg-secondary/60 px-2.5 py-1.5 text-xs text-muted-foreground">
            Put aside <span className="font-medium text-foreground">{formatMoney(Math.round(perMonth))}</span>{" "}
            a month to land on time
          </p>
        )}

        <AddFundsDialog
          goal={g}
          onDone={reload}
          trigger={
            <Button variant="outline" className="mt-4 w-full">
              <Wallet />
              {complete ? "Manage funds" : "Add funds"}
            </Button>
          }
        />
      </Card>
    );
  };

  return (
    <PageShell className="space-y-6">
      {confirmDialog}
      <PageHeader
        title="Savings goals"
        description="What you are putting money aside for. Goals are a tracker — contributions never move your real balance."
        actions={
          <NewGoalDialog
            onCreated={reload}
            trigger={
              <Button>
                <Plus />
                New goal
              </Button>
            }
          />
        }
      />

      {!loading && !error && goals.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Saved so far" value={formatMoney(totalSaved)} icon={Wallet} tone="positive" />
          <Stat
            label="Total target"
            value={formatMoney(totalTarget)}
            icon={Target}
            sub={`Across ${goals.length} goal${goals.length === 1 ? "" : "s"}`}
          />
          <Stat
            label="Reached"
            value={`${done.length} of ${goals.length}`}
            icon={CheckCircle2}
            sub={
              totalTarget > 0
                ? `${Math.round((totalSaved / totalTarget) * 100)}% of everything you are saving for`
                : undefined
            }
          />
        </div>
      )}

      {loading ? (
        <SkeletonCards count={6} />
      ) : error ? (
        <Card className="p-4">
          <LoadError message={error} onRetry={reload} />
        </Card>
      ) : goals.length === 0 ? (
        <EmptyState
          icon={Target}
          title="No goals yet"
          description="Name the thing you are saving for — a trip, a laptop, six months of runway — and MyX works out what you need to put aside each month."
          action={
            <NewGoalDialog
              onCreated={reload}
              trigger={
                <Button>
                  <Plus />
                  Create a goal
                </Button>
              }
            />
          }
        />
      ) : (
        <div className="space-y-6">
          {active.length > 0 && (
            <Section title="In progress">
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{active.map(card)}</div>
            </Section>
          )}
          {done.length > 0 && (
            <Section
              title="Reached"
              description="Kept here rather than archived — finishing one is the point"
              actions={<Badge variant="success">{done.length}</Badge>}
            >
              <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{done.map(card)}</div>
            </Section>
          )}
        </div>
      )}
    </PageShell>
  );
}
