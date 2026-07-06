import { useEffect, useState, type ReactNode } from "react";
import { Loader2, Percent, Check } from "lucide-react";
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
import { api, formatMoney, type Loan, type LoanScheduleRow, type LoanPayment } from "@/lib/api";
import { cn } from "@/lib/utils";

export default function LoanDetailsDialog({
  loanId,
  onChanged,
  trigger,
}: {
  loanId: number;
  onChanged?: () => void;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<"schedule" | "history">("schedule");
  const [loan, setLoan] = useState<Loan | null>(null);
  const [schedule, setSchedule] = useState<LoanScheduleRow[]>([]);
  const [payments, setPayments] = useState<LoanPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [newRate, setNewRate] = useState("");
  const [savingRate, setSavingRate] = useState(false);

  async function load() {
    setLoading(true);
    const res = await api.getLoan(loanId);
    setLoan(res.loan);
    setSchedule(res.schedule);
    setPayments(res.payments);
    setNewRate(String(res.loan.annual_rate));
    setLoading(false);
  }

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function saveRate(e: React.FormEvent) {
    e.preventDefault();
    const r = parseFloat(newRate);
    if (!Number.isFinite(r) || r < 0) return;
    setSavingRate(true);
    try {
      await api.changeLoanRate(loanId, r);
      await load();
      onChanged?.();
    } finally {
      setSavingRate(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{loan?.name ?? "Loan"}</DialogTitle>
          <DialogDescription>
            {loan
              ? `${formatMoney(loan.outstanding)} outstanding · ${loan.annual_rate}% p.a. · EMI ${formatMoney(loan.emi)}`
              : "Loading…"}
          </DialogDescription>
        </DialogHeader>

        {loading || !loan ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-4">
            {/* Floating rate change */}
            <form
              onSubmit={saveRate}
              className="flex flex-wrap items-end gap-2 rounded-xl border border-border/60 bg-background/40 p-3"
            >
              <div className="flex-1 min-w-40">
                <div className="mb-1 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Percent className="h-3.5 w-3.5" />
                  Update rate (floating)
                </div>
                <Input
                  inputMode="decimal"
                  value={newRate}
                  onChange={(e) => setNewRate(e.target.value.replace(/[^\d.]/g, ""))}
                  className="h-9"
                />
              </div>
              <Button type="submit" size="sm" variant="secondary" disabled={savingRate}>
                {savingRate ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
                Apply rate
              </Button>
            </form>

            {/* Tabs */}
            <div className="flex gap-1 border-b border-border/50">
              {(["schedule", "history"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setTab(t)}
                  className={cn(
                    "relative px-3 py-2 text-sm font-medium capitalize transition-colors",
                    tab === t ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t === "schedule" ? `Schedule (${schedule.length})` : `History (${payments.length})`}
                  {tab === t && (
                    <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-primary" />
                  )}
                </button>
              ))}
            </div>

            <div className="max-h-[45vh] overflow-y-auto rounded-lg border border-border/50">
              {tab === "schedule" ? (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card/95 backdrop-blur">
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2 font-medium">#</th>
                      <th className="px-3 py-2 text-right font-medium">Interest</th>
                      <th className="px-3 py-2 text-right font-medium">Principal</th>
                      <th className="px-3 py-2 text-right font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schedule.map((r) => (
                      <tr key={r.month} className="border-t border-border/40 tabular-nums">
                        <td className="px-3 py-2 text-muted-foreground">{r.month}</td>
                        <td className="px-3 py-2 text-right text-rose-300/90">{formatMoney(r.interest)}</td>
                        <td className="px-3 py-2 text-right text-emerald-300/90">{formatMoney(r.principal)}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(r.balance)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : payments.length === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  No EMIs paid yet.
                </div>
              ) : (
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-card/95 backdrop-blur">
                    <tr className="text-left text-xs text-muted-foreground">
                      <th className="px-3 py-2 font-medium">Paid on</th>
                      <th className="px-3 py-2 text-right font-medium">Interest</th>
                      <th className="px-3 py-2 text-right font-medium">Principal</th>
                      <th className="px-3 py-2 text-right font-medium">Balance</th>
                    </tr>
                  </thead>
                  <tbody>
                    {payments.map((p) => (
                      <tr key={p.id} className="border-t border-border/40 tabular-nums">
                        <td className="px-3 py-2 text-muted-foreground">{p.paid_on}</td>
                        <td className="px-3 py-2 text-right text-rose-300/90">{formatMoney(p.interest_part)}</td>
                        <td className="px-3 py-2 text-right text-emerald-300/90">{formatMoney(p.principal_part)}</td>
                        <td className="px-3 py-2 text-right">{formatMoney(p.balance_after)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
