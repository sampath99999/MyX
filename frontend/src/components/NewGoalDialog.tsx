import { useState, type ReactNode } from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api";
import { amountToWords } from "@/lib/numberToWords";
import { sanitizeAmount } from "@/lib/money";
import { cn } from "@/lib/utils";

const EMOJIS = ["🎯", "✈️", "💻", "🏠", "🚗", "📱", "🎓", "💍", "🏖️", "🎁", "🛡️", "💰"];

export default function NewGoalDialog({
  onCreated,
  trigger,
}: {
  onCreated?: () => void;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [emoji, setEmoji] = useState("🎯");
  const [target, setTarget] = useState("");
  const [saved, setSaved] = useState("");
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const targetVal = parseFloat(target);
  const words = amountToWords(targetVal);

  function reset() {
    setName("");
    setEmoji("🎯");
    setTarget("");
    setSaved("");
    setDate("");
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Give your goal a name.");
      return;
    }
    if (!Number.isFinite(targetVal) || targetVal <= 0) {
      setError("Enter a target amount greater than 0.");
      return;
    }
    const savedVal = saved ? parseFloat(saved) : 0;
    if (savedVal < 0) {
      setError("Saved amount can't be negative.");
      return;
    }
    setLoading(true);
    try {
      await api.createGoal({
        name: name.trim(),
        emoji,
        target: targetVal,
        saved: savedVal,
        target_date: date || null,
      });
      setOpen(false);
      reset();
      onCreated?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create goal.");
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
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>New savings goal</DialogTitle>
          <DialogDescription>Set a target and watch your progress grow.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-5">
          {/* Emoji + name */}
          <div className="space-y-2">
            <Label>Icon</Label>
            <div className="flex flex-wrap gap-1.5">
              {EMOJIS.map((e) => (
                <button
                  key={e}
                  type="button"
                  onClick={() => setEmoji(e)}
                  className={cn(
                    "flex h-9 w-9 items-center justify-center rounded-lg border text-lg transition-all active:scale-90",
                    emoji === e
                      ? "border-primary/50 bg-primary/15"
                      : "border-border hover:bg-accent",
                  )}
                >
                  {e}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="goal-name">Goal name</Label>
            <Input
              id="goal-name"
              placeholder="e.g. New Laptop, Goa Trip, Emergency Fund"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          {/* Target amount hero */}
          <div className="rounded-2xl border border-border/60 bg-background/40 px-4 py-5 text-center">
            <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Target amount
            </div>
            <div className="mt-1 flex items-center justify-center gap-1">
              <span
                className={cn(
                  "text-2xl font-semibold",
                  targetVal > 0 ? "text-foreground" : "text-muted-foreground/50",
                )}
              >
                ₹
              </span>
              <input
                type="text"
                inputMode="decimal"
                value={target}
                onChange={(e) => setTarget(sanitizeAmount(e.target.value))}
                placeholder="0"
                aria-label="Target amount"
                className="w-full max-w-[12rem] bg-transparent text-center text-4xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/30"
              />
            </div>
            <p className="mt-2 min-h-5 text-xs text-muted-foreground capitalize">
              {words || <span className="text-muted-foreground/50">Enter your target</span>}
            </p>
          </div>

          {/* Optional: already saved + target date */}
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="goal-saved">Already saved (₹)</Label>
              <Input
                id="goal-saved"
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={saved}
                onChange={(e) => setSaved(sanitizeAmount(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="goal-date">Target date</Label>
              <Input
                id="goal-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
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
                <Target className="h-4 w-4" />
                Create goal
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
