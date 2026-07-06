import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Repeat,
  Trash2,
  Loader2,
  Check,
  Pause,
  Play,
  ArrowUpRight,
  ArrowDownLeft,
  CalendarClock,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import NewRecurringDialog from "@/components/NewRecurringDialog";
import { getCategoryIcon } from "@/components/CategoryPicker";
import { api, formatMoney, type Recurring, type Frequency } from "@/lib/api";
import { cn } from "@/lib/utils";

function freqLabel(frequency: Frequency, interval: number): string {
  const unit = { daily: "day", weekly: "week", monthly: "month", yearly: "year" }[frequency];
  return interval === 1 ? `Every ${unit}` : `Every ${interval} ${unit}s`;
}

function dueStatus(iso: string): { text: string; tone: "overdue" | "soon" | "normal" } {
  const days = Math.ceil((new Date(iso + "T00:00:00").getTime() - Date.now()) / 86400000);
  if (days < 0) return { text: `Overdue by ${-days}d`, tone: "overdue" };
  if (days === 0) return { text: "Due today", tone: "soon" };
  if (days === 1) return { text: "Due tomorrow", tone: "soon" };
  if (days <= 7) return { text: `Due in ${days} days`, tone: "soon" };
  const d = new Date(iso + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
  return { text: `Due ${d}`, tone: "normal" };
}

export default function Recurring() {
  const [items, setItems] = useState<Recurring[]>([]);
  const [summary, setSummary] = useState<{ monthlyIncome: number; monthlyExpense: number } | null>(
    null,
  );
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [r, s] = await Promise.all([api.listRecurring(), api.recurringSummary()]);
    setItems(r.recurring);
    setSummary(s);
    setLoading(false);
  }, []);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  async function pay(id: number) {
    setBusyId(id);
    try {
      await api.payRecurring(id);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(r: Recurring) {
    setBusyId(r.id);
    try {
      await api.updateRecurring(r.id, { active: !r.active });
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: number) {
    setBusyId(id);
    try {
      await api.deleteRecurring(id);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Header + monthly commitment summary */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Recurring</h2>
          {summary && items.length > 0 && (
            <p className="text-sm text-muted-foreground">
              ~{formatMoney(summary.monthlyExpense)}/mo out
              {summary.monthlyIncome > 0 && <> · {formatMoney(summary.monthlyIncome)}/mo in</>}
            </p>
          )}
        </div>
        <NewRecurringDialog
          onCreated={load}
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Add recurring
            </Button>
          }
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : items.length === 0 ? (
        <Card className="glass flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Repeat className="h-7 w-7 text-primary" />
          </div>
          <div>
            <p className="font-medium">No recurring items yet</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-xs">
              Add your bills and subscriptions (Netflix, rent, EMIs) or regular income. Mark them
              paid to log a transaction automatically.
            </p>
          </div>
          <NewRecurringDialog
            onCreated={load}
            trigger={
              <Button size="sm" variant="secondary">
                <Plus className="h-4 w-4" />
                Add recurring
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {items.map((r, i) => {
            const Icon = getCategoryIcon(r.category);
            const income = r.type === "income";
            const status = dueStatus(r.next_due);
            return (
              <Card
                key={r.id}
                className={cn(
                  "glass group relative p-5 animate-in-up",
                  !r.active && "opacity-60",
                )}
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="flex items-start gap-4">
                  <div
                    className={cn(
                      "flex h-11 w-11 shrink-0 items-center justify-center rounded-xl",
                      income ? "bg-emerald-500/15 text-emerald-400" : "bg-primary/15 text-primary",
                    )}
                  >
                    <Icon className="h-5 w-5" />
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold">{r.name}</span>
                      {!r.active && (
                        <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                          Paused
                        </span>
                      )}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1">
                        <Repeat className="h-3 w-3" />
                        {freqLabel(r.frequency, r.interval)}
                      </span>
                      <span>·</span>
                      <span>{r.category}</span>
                    </div>
                  </div>

                  <div className="text-right">
                    <div
                      className={cn(
                        "flex items-center gap-1 font-semibold tabular-nums",
                        income ? "text-emerald-400" : "text-foreground",
                      )}
                    >
                      {income ? (
                        <ArrowUpRight className="h-4 w-4" />
                      ) : (
                        <ArrowDownLeft className="h-4 w-4" />
                      )}
                      {formatMoney(r.amount)}
                    </div>
                  </div>
                </div>

                {/* Footer: status + actions */}
                <div className="mt-4 flex items-center justify-between gap-2">
                  <span
                    className={cn(
                      "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium",
                      status.tone === "overdue" && "bg-rose-500/15 text-rose-300",
                      status.tone === "soon" && "bg-amber-500/15 text-amber-300",
                      status.tone === "normal" && "bg-background/60 text-muted-foreground",
                    )}
                  >
                    <CalendarClock className="h-3.5 w-3.5" />
                    {status.text}
                  </span>

                  <div className="flex items-center gap-1.5">
                    <button
                      onClick={() => toggleActive(r)}
                      disabled={busyId === r.id}
                      title={r.active ? "Pause" : "Resume"}
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      {r.active ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
                    </button>
                    <button
                      onClick={() => remove(r.id)}
                      disabled={busyId === r.id}
                      title="Delete"
                      className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                    <Button size="sm" onClick={() => pay(r.id)} disabled={busyId === r.id}>
                      {busyId === r.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <Check className="h-4 w-4" />
                          Mark paid
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
