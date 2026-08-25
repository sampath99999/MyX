import { useState, type ReactNode } from "react";
import { Loader2, ArrowDownLeft, ArrowUpRight } from "lucide-react";
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
import { api, ApiError, type Transaction } from "@/lib/api";
import { amountToWords } from "@/lib/numberToWords";
import { sanitizeAmount } from "@/lib/money";
import { cn } from "@/lib/utils";

/*
  Doubles as the edit dialog when given an existing transaction.

  A separate edit form would mean two places to keep the amount-in-words, the
  category picker and the validation in step — and correcting an entry should
  feel like the thing you already know how to use, not a lesser version of it.
*/
export default function AddTransactionDialog({
  onCreated,
  trigger,
  open: controlledOpen,
  onOpenChange: onControlledChange,
  transaction,
}: {
  onCreated?: () => void;
  trigger?: ReactNode;
  /** Controlled open. Omit to let the dialog manage itself. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  transaction?: Transaction;
}) {
  const editing = transaction !== undefined;
/*
  `open`/`onOpenChange` are optional. Left out, the dialog owns its own state and
  is driven by its trigger, which is how every existing caller uses it. Passed
  in, the caller drives it and the trigger becomes optional — which is what lets
  the app-wide Add menu open this form on arrival (see lib/addIntent.ts) without
  every page growing a hidden button to click.
*/
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = (next: boolean) => {
    if (controlledOpen === undefined) setUncontrolledOpen(next);
    onControlledChange?.(next);
  };
  const [type, setType] = useState<"income" | "expense">(transaction?.type ?? "expense");
  const [amount, setAmount] = useState(transaction ? String(transaction.amount) : "");
  const [category, setCategory] = useState(transaction?.category ?? "");
  const [note, setNote] = useState(transaction?.note ?? "");
  const [date, setDate] = useState(
    () => transaction?.occurred_on ?? new Date().toISOString().slice(0, 10),
  );
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const value = parseFloat(amount);
  const words = amountToWords(value);

  /* Closing an edit restores the saved values, not blanks. */
  function reset() {
    setType(transaction?.type ?? "expense");
    setAmount(transaction ? String(transaction.amount) : "");
    setCategory(transaction?.category ?? "");
    setNote(transaction?.note ?? "");
    setDate(transaction?.occurred_on ?? new Date().toISOString().slice(0, 10));
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a valid amount greater than 0.");
      return;
    }
    if (!category.trim()) {
      setError("Please choose or enter a category.");
      return;
    }
    setLoading(true);
    try {
      if (editing) {
        await api.updateTransaction(transaction.id, {
          type,
          amount: value,
          category: category.trim(),
          // null rather than undefined, so clearing a note actually clears it.
          note: note.trim() || null,
          occurred_on: date,
        });
      } else {
        await api.createTransaction({
          type,
          amount: value,
          category: category.trim(),
          note: note.trim() || undefined,
          occurred_on: date,
        });
      }
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
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit transaction" : "Add transaction"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Change any of it — the balance and this month's totals follow."
              : "Record income or an expense in a few taps."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-5">
          {/* Type segmented toggle */}
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
                    active && t === "income" && "bg-emerald-500/20 text-emerald-300 shadow-sm",
                    active && t === "expense" && "bg-rose-500/20 text-rose-300 shadow-sm",
                    !active && "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" />
                  {t}
                </button>
              );
            })}
          </div>

          {/*
            Hero amount input.

            It was text-5xl and py-6 at every width. On a 375px phone that is a
            48px figure in a 100px-tall box, inside a sheet that also has to fit
            a type switch, a category picker, a date, a note and a submit — and
            the amount is the one field that is never long. Scaled down below
            sm; unchanged on a desktop, where the room exists.
          */}
          <div className="rounded-2xl border border-border/60 bg-background/40 px-4 py-4 text-center sm:py-6">
            <div className="flex items-center justify-center gap-1">
              <span
                className={cn(
                  "text-2xl font-semibold transition-colors sm:text-3xl",
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
                autoFocus
                aria-label="Amount"
                className={cn(
                  "w-full max-w-[15rem] bg-transparent text-center text-4xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/30 sm:text-5xl",
                  isIncome && value > 0 && "text-emerald-400",
                )}
              />
            </div>
            <p className="mt-3 min-h-5 text-sm text-muted-foreground capitalize">
              {words || <span className="text-muted-foreground/50">Enter an amount</span>}
            </p>
          </div>

          {/* Category */}
          <div className="space-y-2.5">
            <Label>Category</Label>
            <CategoryPicker type={type} value={category} onChange={setCategory} />
          </div>

          {/* Date + note */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="date">Date</Label>
              <Input id="date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="note">Note (optional)</Label>
              <Input
                id="note"
                placeholder="e.g. weekly"
                value={note}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
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
                {editing ? "Save changes" : isIncome ? "Add income" : "Add expense"}
                {value > 0 && ` · ₹${amount}`}
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
