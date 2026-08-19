import { useState, type ReactNode } from "react";

/** Local calendar date — "today" must be the user's, not UTC's. */
function todayIso(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}
import { Loader2, Plus, Minus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api, ApiError, formatMoney, type Goal } from "@/lib/api";
import { sanitizeAmount } from "@/lib/money";
import { cn } from "@/lib/utils";

const QUICK = [500, 1000, 2000, 5000];

export default function AddFundsDialog({
  goal,
  onDone,
  trigger,
}: {
  goal: Goal;
  onDone?: () => void;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"add" | "withdraw">("add");
  const [amount, setAmount] = useState("");
  // Money is usually moved before it is logged, and the contribution history
  // is only useful if it records when that actually happened.
  const [occurredOn, setOccurredOn] = useState(todayIso);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const value = parseFloat(amount);

  function reset() {
    setMode("add");
    setAmount("");
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter an amount greater than 0.");
      return;
    }
    setLoading(true);
    try {
      await api.contributeGoal(goal.id, mode === "add" ? value : -value, occurredOn);
      setOpen(false);
      reset();
      onDone?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update goal.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {goal.emoji ? `${goal.emoji} ` : ""}
            {goal.name}
          </DialogTitle>
          <DialogDescription>
            {formatMoney(goal.saved)} of {formatMoney(goal.target)} saved · {goal.percent}%
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-1.5 rounded-xl border border-border/60 bg-background/50 p-1.5">
            {(["add", "withdraw"] as const).map((m) => {
              const active = mode === m;
              const Icon = m === "add" ? Plus : Minus;
              return (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold capitalize transition-all",
                    active && m === "add" && "bg-emerald-500/20 text-emerald-300",
                    active && m === "withdraw" && "bg-amber-500/20 text-amber-300",
                    !active && "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {m === "add" ? "Add funds" : "Withdraw"}
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-center gap-1 rounded-2xl border border-border/60 bg-background/40 py-5">
            <span className="text-2xl font-semibold text-muted-foreground">₹</span>
            <input
              type="text"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(sanitizeAmount(e.target.value))}
              placeholder="0"
              autoFocus
              aria-label="Amount"
              className="w-full max-w-[10rem] bg-transparent text-center text-4xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/30"
            />
          </div>

          <div className="flex flex-wrap gap-2">
            {QUICK.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setAmount(String(q))}
                className="rounded-full border border-border px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                +₹{q.toLocaleString("en-IN")}
              </button>
            ))}
          </div>

          <div>
            <label htmlFor="funds-date" className="text-sm font-medium">
              Moved on
            </label>
            <input
              id="funds-date"
              type="date"
              value={occurredOn}
              max={todayIso()}
              onChange={(e) => setOccurredOn(e.target.value || todayIso())}
              className="mt-1.5 w-full rounded-lg border border-input bg-transparent px-3 py-2.5 outline-none focus:border-ring"
            />
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : mode === "add" ? (
              "Add to goal"
            ) : (
              "Withdraw from goal"
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
