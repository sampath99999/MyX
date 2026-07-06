import { useMemo, useState, type ReactNode } from "react";
import { Loader2, Landmark, TriangleAlert } from "lucide-react";
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
import { api, ApiError, formatMoney } from "@/lib/api";
import { previewLoan } from "@/lib/loan";
import { sanitizeAmount } from "@/lib/money";

export default function NewLoanDialog({
  onCreated,
  trigger,
}: {
  onCreated?: () => void;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [lender, setLender] = useState("");
  const [principal, setPrincipal] = useState("");
  const [rate, setRate] = useState("");
  const [emi, setEmi] = useState("");
  const [startDate, setStartDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const preview = useMemo(
    () => previewLoan(parseFloat(principal), parseFloat(rate), parseFloat(emi)),
    [principal, rate, emi],
  );

  function reset() {
    setName("");
    setLender("");
    setPrincipal("");
    setRate("");
    setEmi("");
    setStartDate(new Date().toISOString().slice(0, 10));
    setError(null);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) return setError("Give the loan a name.");
    if (!preview) return setError("Fill in principal, rate and EMI.");
    if (!preview.coversInterest)
      return setError("EMI is too low to cover the monthly interest — it would never close.");
    setLoading(true);
    try {
      await api.createLoan({
        name: name.trim(),
        lender: lender.trim() || undefined,
        principal: parseFloat(principal),
        annual_rate: parseFloat(rate),
        emi: parseFloat(emi),
        start_date: startDate,
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
          <DialogTitle>Add a loan</DialogTitle>
          <DialogDescription>
            Enter your EMI and rate — we compute the schedule the same way the bank does.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="loan-name">Name</Label>
              <Input
                id="loan-name"
                placeholder="Education Loan"
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loan-lender">Lender (optional)</Label>
              <Input
                id="loan-lender"
                placeholder="SBI"
                value={lender}
                onChange={(e) => setLender(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="loan-principal">Loan amount (₹)</Label>
            <Input
              id="loan-principal"
              inputMode="decimal"
              placeholder="2200000"
              value={principal}
              onChange={(e) => setPrincipal(sanitizeAmount(e.target.value))}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="loan-rate">Interest rate (% p.a.)</Label>
              <Input
                id="loan-rate"
                inputMode="decimal"
                placeholder="9.9"
                value={rate}
                onChange={(e) => setRate(sanitizeAmount(e.target.value))}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="loan-emi">EMI (₹)</Label>
              <Input
                id="loan-emi"
                inputMode="decimal"
                placeholder="68513"
                value={emi}
                onChange={(e) => setEmi(sanitizeAmount(e.target.value))}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="loan-start">First EMI date</Label>
            <Input
              id="loan-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          {/* Live preview */}
          {preview && !preview.coversInterest && (
            <div className="flex items-center gap-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-3.5 py-2.5 text-sm text-rose-300">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              EMI ₹{emi} doesn't cover the first month's interest ({formatMoney(preview.firstInterest)}).
            </div>
          )}
          {preview && preview.coversInterest && (
            <div className="rounded-xl border border-primary/25 bg-primary/5 p-4">
              <div className="mb-3 flex items-center gap-2 text-sm font-medium text-primary">
                <Landmark className="h-4 w-4" />
                Schedule preview
              </div>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <Stat label="Tenure" value={`${preview.months} months (${preview.years})`} />
                <Stat label="Total interest" value={formatMoney(preview.totalInterest)} />
                <Stat label="Total repayment" value={formatMoney(preview.totalPaid)} />
                <Stat
                  label="1st EMI split"
                  value={`${formatMoney(preview.firstInterest)} int · ${formatMoney(preview.firstPrincipal)} pr`}
                />
              </div>
            </div>
          )}

          {error && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
              {error}
            </div>
          )}

          <Button type="submit" size="lg" className="w-full" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add loan"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-semibold tracking-tight">{value}</div>
    </div>
  );
}
