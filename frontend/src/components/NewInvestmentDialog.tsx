import { useState, type ReactNode } from "react";
import { Loader2, PlusCircle } from "lucide-react";
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
import { api, ApiError, type InvestmentType } from "@/lib/api";
import { sanitizeAmount } from "@/lib/money";
import { INVESTMENT_TYPES } from "@/lib/investmentTypes";
import { cn } from "@/lib/utils";

export default function NewInvestmentDialog({
  onCreated,
  trigger,
}: {
  onCreated?: () => void;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [type, setType] = useState<InvestmentType>("stocks");
  const [invested, setInvested] = useState("");
  const [current, setCurrent] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const investedVal = parseFloat(invested);

  function reset() {
    setName("");
    setType("stocks");
    setInvested("");
    setCurrent("");
    setNotes("");
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Give this holding a name.");
      return;
    }
    if (!Number.isFinite(investedVal) || investedVal < 0) {
      setError("Enter a valid invested amount.");
      return;
    }
    const currentVal = current ? parseFloat(current) : investedVal;
    if (!Number.isFinite(currentVal) || currentVal < 0) {
      setError("Enter a valid current value.");
      return;
    }
    setLoading(true);
    try {
      await api.createInvestment({
        name: name.trim(),
        type,
        invested: investedVal,
        current: currentVal,
        notes: notes.trim() || undefined,
      });
      setOpen(false);
      reset();
      onCreated?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to create investment.");
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
          <DialogTitle>New investment</DialogTitle>
          <DialogDescription>Track a holding you already own — update its value anytime.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label>Type</Label>
            <div className="grid grid-cols-4 gap-1.5">
              {INVESTMENT_TYPES.map((t) => (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setType(t.value)}
                  title={t.label}
                  className={cn(
                    "flex flex-col items-center gap-1 rounded-lg border px-2 py-2.5 text-[11px] transition-all active:scale-95",
                    type === t.value
                      ? "border-primary/50 bg-primary/15 text-foreground"
                      : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  <t.icon className="h-4 w-4" />
                  <span className="truncate">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="inv-name">Name</Label>
            <Input
              id="inv-name"
              placeholder="e.g. HDFC Flexicap, Reliance, SBI FD"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="inv-invested">Invested (₹)</Label>
              <Input
                id="inv-invested"
                type="text"
                inputMode="decimal"
                placeholder="0"
                value={invested}
                onChange={(e) => setInvested(sanitizeAmount(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="inv-current">Current value (₹)</Label>
              <Input
                id="inv-current"
                type="text"
                inputMode="decimal"
                placeholder="Same as invested"
                value={current}
                onChange={(e) => setCurrent(sanitizeAmount(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="inv-notes">Notes (optional)</Label>
            <Input
              id="inv-notes"
              placeholder="Folio number, broker, etc."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
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
                <PlusCircle className="h-4 w-4" />
                Add investment
              </>
            )}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
