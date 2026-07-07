import { useState, type ReactNode } from "react";
import { Loader2 } from "lucide-react";
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
import { api, ApiError, type Investment } from "@/lib/api";
import { sanitizeAmount } from "@/lib/money";

export default function EditInvestmentDialog({
  investment,
  onDone,
  trigger,
}: {
  investment: Investment;
  onDone?: () => void;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [invested, setInvested] = useState(String(investment.invested));
  const [current, setCurrent] = useState(String(investment.current));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function reset() {
    setInvested(String(investment.invested));
    setCurrent(String(investment.current));
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const investedVal = parseFloat(invested);
    const currentVal = parseFloat(current);
    if (!Number.isFinite(investedVal) || investedVal < 0) {
      setError("Enter a valid invested amount.");
      return;
    }
    if (!Number.isFinite(currentVal) || currentVal < 0) {
      setError("Enter a valid current value.");
      return;
    }
    setLoading(true);
    try {
      await api.updateInvestment(investment.id, { invested: investedVal, current: currentVal });
      setOpen(false);
      onDone?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to update investment.");
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
          <DialogTitle>{investment.name}</DialogTitle>
          <DialogDescription>Update invested amount or current value.</DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="edit-inv-invested">Invested (₹)</Label>
              <Input
                id="edit-inv-invested"
                type="text"
                inputMode="decimal"
                value={invested}
                onChange={(e) => setInvested(sanitizeAmount(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-inv-current">Current value (₹)</Label>
              <Input
                id="edit-inv-current"
                type="text"
                inputMode="decimal"
                value={current}
                onChange={(e) => setCurrent(sanitizeAmount(e.target.value))}
                autoFocus
              />
            </div>
          </div>

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save changes"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
