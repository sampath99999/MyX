import { useEffect, useState, type ReactNode } from "react";
import { Loader2, Target } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import CategoryPicker, { getCategoryIcon } from "@/components/CategoryPicker";
import { api, ApiError, type Budget } from "@/lib/api";
import { amountToWords } from "@/lib/numberToWords";
import { sanitizeAmount } from "@/lib/money";

export default function BudgetDialog({
  budget,
  onSaved,
  trigger,
}: {
  budget?: Budget; // when present -> edit the monthly limit
  onSaved?: () => void;
  trigger: ReactNode;
}) {
  const editing = !!budget;
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState(budget?.category ?? "");
  const [amount, setAmount] = useState(budget ? String(budget.limit) : "");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Reset fields whenever the dialog opens.
  useEffect(() => {
    if (open) {
      setCategory(budget?.category ?? "");
      setAmount(budget ? String(budget.limit) : "");
      setError(null);
    }
  }, [open, budget]);

  const value = parseFloat(amount);
  const words = amountToWords(value);
  const Icon = editing ? getCategoryIcon(budget!.category) : null;

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!editing && !category.trim()) return setError("Choose a category to budget.");
    if (!Number.isFinite(value) || value <= 0) return setError("Enter a limit greater than 0.");
    setLoading(true);
    try {
      if (editing) {
        await api.updateBudget(budget!.id, value);
      } else {
        await api.createBudget({ category: category.trim(), amount: value });
      }
      setOpen(false);
      onSaved?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to save. Try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? "Edit budget" : "New monthly budget"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the monthly limit for this category."
              : "Set a monthly spending limit for a category."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-5">
          {editing ? (
            <div className="flex items-center gap-3 rounded-xl border border-border/60 bg-background/40 p-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
                {Icon && <Icon className="h-5 w-5" />}
              </div>
              <span className="font-medium">{budget!.category}</span>
            </div>
          ) : (
            <div className="space-y-2.5">
              <Label>Category</Label>
              <CategoryPicker type="expense" value={category} onChange={setCategory} />
            </div>
          )}

          {/* Hero limit */}
          <div className="rounded-2xl border border-border/60 bg-background/40 px-4 py-5 text-center">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Monthly limit
            </div>
            <div className="mt-1 flex items-center justify-center gap-1">
              <span className={value > 0 ? "text-2xl font-semibold" : "text-2xl font-semibold text-muted-foreground/50"}>
                ₹
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={amount}
                onChange={(e) => setAmount(sanitizeAmount(e.target.value))}
                placeholder="0"
                autoFocus
                aria-label="Monthly limit"
                className="w-full max-w-[13rem] bg-transparent text-center text-4xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/30"
              />
            </div>
            <p className="mt-2 min-h-5 text-xs text-muted-foreground capitalize">
              {words || <span className="text-muted-foreground/50">Enter a limit</span>}
            </p>
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
                <Target className="h-4 w-4" />
                {editing ? "Save limit" : "Create budget"}
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
