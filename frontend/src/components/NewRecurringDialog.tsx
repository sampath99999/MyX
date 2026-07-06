import { useState, type ReactNode } from "react";
import { Loader2, ArrowDownLeft, ArrowUpRight, Repeat } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import CategoryPicker from "@/components/CategoryPicker";
import { api, ApiError, type Frequency } from "@/lib/api";
import { amountToWords } from "@/lib/numberToWords";
import { sanitizeAmount } from "@/lib/money";
import { cn } from "@/lib/utils";

const FREQUENCIES: { value: Frequency; label: string; unit: string }[] = [
  { value: "daily", label: "Daily", unit: "day" },
  { value: "weekly", label: "Weekly", unit: "week" },
  { value: "monthly", label: "Monthly", unit: "month" },
  { value: "yearly", label: "Yearly", unit: "year" },
];

export default function NewRecurringDialog({
  onCreated,
  trigger,
}: {
  onCreated?: () => void;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [frequency, setFrequency] = useState<Frequency>("monthly");
  const [interval, setInterval] = useState("1");
  const [nextDue, setNextDue] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const value = parseFloat(amount);
  const words = amountToWords(value);
  const unit = FREQUENCIES.find((f) => f.value === frequency)!.unit;
  const n = Math.max(parseInt(interval || "1", 10) || 1, 1);

  function reset() {
    setName("");
    setType("expense");
    setAmount("");
    setCategory("");
    setFrequency("monthly");
    setInterval("1");
    setNextDue(new Date().toISOString().slice(0, 10));
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Give it a name (e.g. Netflix, Rent).");
    if (!Number.isFinite(value) || value <= 0) return setError("Enter an amount greater than 0.");
    if (!category.trim()) return setError("Choose or enter a category.");
    setLoading(true);
    try {
      await api.createRecurring({
        name: name.trim(),
        type,
        amount: value,
        category: category.trim(),
        frequency,
        interval: n,
        next_due: nextDue,
      });
      setOpen(false);
      reset();
      onCreated?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save. Try again.");
    } finally {
      setLoading(false);
    }
  }

  const isIncome = type === "income";

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New recurring</DialogTitle>
          <DialogDescription>Set up a bill, subscription, or regular income.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-5">
          {/* Type toggle */}
          <div className="grid grid-cols-2 gap-1.5 rounded-xl bg-background/50 p-1.5 border border-border/60">
            {(["expense", "income"] as const).map((t) => {
              const active = type === t;
              const Icon = t === "income" ? ArrowUpRight : ArrowDownLeft;
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setType(t);
                    setCategory("");
                  }}
                  className={cn(
                    "flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold capitalize transition-all",
                    active && t === "income" && "bg-emerald-500/20 text-emerald-300",
                    active && t === "expense" && "bg-rose-500/20 text-rose-300",
                    !active && "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t === "income" ? "Income" : "Bill / Expense"}
                </button>
              );
            })}
          </div>

          <div className="space-y-2">
            <Label htmlFor="rec-name">Name</Label>
            <Input
              id="rec-name"
              placeholder="e.g. Netflix, Rent, Gym, Salary"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Hero amount */}
          <div className="rounded-2xl border border-border/60 bg-background/40 px-4 py-5 text-center">
            <div className="flex items-center justify-center gap-1">
              <span
                className={cn(
                  "text-2xl font-semibold",
                  value > 0 ? (isIncome ? "text-emerald-400" : "text-foreground") : "text-muted-foreground/50",
                )}
              >
                ₹
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(sanitizeAmount(e.target.value))}
                placeholder="0"
                aria-label="Amount"
                className={cn(
                  "w-full max-w-[13rem] bg-transparent text-center text-4xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/30",
                  isIncome && value > 0 && "text-emerald-400",
                )}
              />
            </div>
            <p className="mt-2 min-h-5 text-xs text-muted-foreground capitalize">
              {words || <span className="text-muted-foreground/50">Enter an amount</span>}
            </p>
          </div>

          {/* Category */}
          <div className="space-y-2.5">
            <Label>Category</Label>
            <CategoryPicker type={type} value={category} onChange={setCategory} />
          </div>

          {/* Frequency */}
          <div className="space-y-2.5">
            <Label>Repeats</Label>
            <div className="flex flex-wrap gap-2">
              {FREQUENCIES.map((f) => {
                const active = frequency === f.value;
                return (
                  <button
                    key={f.value}
                    type="button"
                    onClick={() => setFrequency(f.value)}
                    className={cn(
                      "rounded-full border px-3.5 py-2 text-sm font-medium transition-all active:scale-95",
                      active
                        ? "border-primary/50 bg-primary/15 text-foreground"
                        : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {f.label}
                  </button>
                );
              })}
            </div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Every</span>
              <Input
                type="number"
                min="1"
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
                className="h-9 w-16 text-center"
              />
              <span>
                {unit}
                {n > 1 ? "s" : ""}
              </span>
            </div>
          </div>

          {/* Next due */}
          <div className="space-y-2">
            <Label htmlFor="rec-due">{isIncome ? "Next date" : "Next due date"}</Label>
            <Input
              id="rec-due"
              type="date"
              value={nextDue}
              onChange={(e) => setNextDue(e.target.value)}
            />
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <>
                <Repeat className="h-4 w-4" />
                Create recurring
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
