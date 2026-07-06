import { useMemo, useRef, useState, type ReactNode } from "react";
import {
  Loader2,
  ArrowDownLeft,
  ArrowUpRight,
  Search,
  Plus,
  Check,
  // income icons
  Banknote,
  Laptop,
  Briefcase,
  PiggyBank,
  Gift,
  RotateCcw,
  LineChart,
  // expense icons
  ShoppingCart,
  UtensilsCrossed,
  Car,
  Home,
  ReceiptText,
  ShoppingBag,
  HeartPulse,
  Clapperboard,
  GraduationCap,
  Plane,
  Fuel,
  Repeat,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";
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
import { api, ApiError } from "@/lib/api";
import { amountToWords } from "@/lib/numberToWords";
import { sanitizeAmount } from "@/lib/money";
import { cn } from "@/lib/utils";

interface Category {
  label: string;
  icon: LucideIcon;
}

const CATEGORIES: Record<"income" | "expense", Category[]> = {
  income: [
    { label: "Salary", icon: Banknote },
    { label: "Freelance", icon: Laptop },
    { label: "Business", icon: Briefcase },
    { label: "Interest", icon: PiggyBank },
    { label: "Investment", icon: LineChart },
    { label: "Gift", icon: Gift },
    { label: "Refund", icon: RotateCcw },
  ],
  expense: [
    { label: "Groceries", icon: ShoppingCart },
    { label: "Food & Dining", icon: UtensilsCrossed },
    { label: "Transport", icon: Car },
    { label: "Fuel", icon: Fuel },
    { label: "Rent", icon: Home },
    { label: "Bills & Utilities", icon: ReceiptText },
    { label: "Shopping", icon: ShoppingBag },
    { label: "Health", icon: HeartPulse },
    { label: "Entertainment", icon: Clapperboard },
    { label: "Education", icon: GraduationCap },
    { label: "Travel", icon: Plane },
    { label: "Subscriptions", icon: Repeat },
  ],
};

export default function AddTransactionDialog({
  onCreated,
  trigger,
}: {
  onCreated?: () => void;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<"income" | "expense">("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [isCustom, setIsCustom] = useState(false);
  const [search, setSearch] = useState("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const customRef = useRef<HTMLInputElement>(null);

  const value = parseFloat(amount);
  const words = amountToWords(value);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return CATEGORIES[type];
    return CATEGORIES[type].filter((c) => c.label.toLowerCase().includes(q));
  }, [type, search]);

  // Show a "use custom" chip when the search doesn't exactly match a known category.
  const showUseCustom =
    search.trim().length > 0 &&
    !CATEGORIES[type].some((c) => c.label.toLowerCase() === search.trim().toLowerCase());

  const effectiveCategory = isCustom ? customCategory.trim() : category;

  function reset() {
    setType("expense");
    setAmount("");
    setCategory("");
    setCustomCategory("");
    setIsCustom(false);
    setSearch("");
    setNote("");
    setDate(new Date().toISOString().slice(0, 10));
    setError(null);
  }

  function pickCategory(label: string) {
    setCategory(label);
    setIsCustom(false);
    setCustomCategory("");
  }

  function enableCustom(seed: string) {
    setIsCustom(true);
    setCategory("");
    setCustomCategory(seed);
    setTimeout(() => customRef.current?.focus(), 0);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!Number.isFinite(value) || value <= 0) {
      setError("Enter a valid amount greater than 0.");
      return;
    }
    if (!effectiveCategory) {
      setError("Please choose or enter a category.");
      return;
    }
    setLoading(true);
    try {
      await api.createTransaction({
        type,
        amount: value,
        category: effectiveCategory,
        note: note.trim() || undefined,
        occurred_on: date,
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
          <DialogTitle>Add transaction</DialogTitle>
          <DialogDescription>Record income or an expense in a few taps.</DialogDescription>
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
                    pickCategory("");
                    setSearch("");
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

          {/* Hero amount input */}
          <div className="rounded-2xl border border-border/60 bg-background/40 px-4 py-6 text-center">
            <div className="flex items-center justify-center gap-1">
              <span
                className={cn(
                  "text-3xl font-semibold transition-colors",
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
                  "w-full max-w-[15rem] bg-transparent text-center text-5xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/30",
                  isIncome && value > 0 && "text-emerald-400",
                )}
              />
            </div>
            <p className="mt-3 min-h-5 text-sm text-muted-foreground capitalize">
              {words || <span className="text-muted-foreground/50">Enter an amount</span>}
            </p>
          </div>

          {/* Category picker */}
          <div className="space-y-2.5">
            <Label>Category</Label>

            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search or type a category…"
                className="pl-9 h-10"
              />
            </div>

            <div className="flex max-h-44 flex-wrap gap-2 overflow-y-auto pr-1">
              {filtered.map((c) => {
                const active = !isCustom && category === c.label;
                return (
                  <button
                    key={c.label}
                    type="button"
                    onClick={() => pickCategory(c.label)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-all active:scale-95",
                      active
                        ? "border-primary/50 bg-primary/15 text-foreground"
                        : "border-border text-muted-foreground hover:border-border hover:bg-accent hover:text-foreground",
                    )}
                  >
                    <c.icon className={cn("h-4 w-4", active ? "text-primary" : "text-muted-foreground")} />
                    {c.label}
                    {active && <Check className="h-3.5 w-3.5 text-primary" />}
                  </button>
                );
              })}

              {/* Use the typed text as a custom category */}
              {showUseCustom && (
                <button
                  type="button"
                  onClick={() => enableCustom(search.trim())}
                  className="inline-flex items-center gap-2 rounded-full border border-dashed border-primary/50 px-3.5 py-2 text-sm font-medium text-primary transition-all hover:bg-primary/10 active:scale-95"
                >
                  <Plus className="h-4 w-4" />
                  Use "{search.trim()}"
                </button>
              )}

              {/* Always-available "Other" */}
              <button
                type="button"
                onClick={() => enableCustom("")}
                className={cn(
                  "inline-flex items-center gap-2 rounded-full border px-3.5 py-2 text-sm font-medium transition-all active:scale-95",
                  isCustom
                    ? "border-primary/50 bg-primary/15 text-foreground"
                    : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
                )}
              >
                <MoreHorizontal className={cn("h-4 w-4", isCustom ? "text-primary" : "text-muted-foreground")} />
                Other
              </button>
            </div>

            {isCustom && (
              <Input
                ref={customRef}
                value={customCategory}
                onChange={(e) => setCustomCategory(e.target.value)}
                placeholder="Enter a custom category name"
                className="h-10 animate-in-up"
              />
            )}
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
                {isIncome ? "Add income" : "Add expense"}
                {value > 0 && ` · ₹${amount}`}
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
