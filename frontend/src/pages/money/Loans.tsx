import { useCallback, useEffect, useState } from "react";
import {
  Plus,
  Landmark,
  Trash2,
  Loader2,
  Check,
  CalendarCheck,
  ListChecks,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import NewLoanDialog from "@/components/NewLoanDialog";
import LoanDetailsDialog from "@/components/LoanDetailsDialog";
import { api, formatMoney, type Loan } from "@/lib/api";
import { cn } from "@/lib/utils";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });
}

export default function Loans() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { loans } = await api.listLoans();
    setLoans(loans);
    setLoading(false);
  }, []);

  useEffect(() => {
    load().catch(() => setLoading(false));
  }, [load]);

  async function pay(id: number) {
    setBusyId(id);
    try {
      await api.payLoan(id, true);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: number) {
    setBusyId(id);
    try {
      await api.deleteLoan(id);
      await load();
    } finally {
      setBusyId(null);
    }
  }

  const totalOutstanding = loans
    .filter((l) => l.status === "active")
    .reduce((s, l) => s + l.outstanding, 0);

  return (
    <div className="p-6 lg:p-8 space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Loans</h2>
          {loans.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {formatMoney(totalOutstanding)} outstanding across{" "}
              {loans.filter((l) => l.status === "active").length} active loan
              {loans.filter((l) => l.status === "active").length === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <NewLoanDialog
          onCreated={load}
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" />
              Add loan
            </Button>
          }
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : loans.length === 0 ? (
        <Card className="glass flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Landmark className="h-7 w-7 text-primary" />
          </div>
          <div>
            <p className="font-medium">No loans yet</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-xs">
              Add an education, home, or car loan. Enter your EMI and rate — we compute the exact
              reducing-balance schedule the bank uses.
            </p>
          </div>
          <NewLoanDialog
            onCreated={load}
            trigger={
              <Button size="sm" variant="secondary">
                <Plus className="h-4 w-4" />
                Add loan
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {loans.map((l, i) => {
            const closed = l.status === "closed";
            return (
              <Card
                key={l.id}
                className={cn("glass group relative p-5 animate-in-up", closed && "opacity-70")}
                style={{ animationDelay: `${i * 50}ms` }}
              >
                <div className="flex items-start gap-3">
                  <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
                    <Landmark className="h-5 w-5" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold">{l.name}</span>
                      {closed && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" /> Closed
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {l.lender ? `${l.lender} · ` : ""}
                      {l.annual_rate}% p.a. · EMI {formatMoney(l.emi)}
                    </div>
                  </div>
                  <button
                    onClick={() => remove(l.id)}
                    disabled={busyId === l.id}
                    title="Delete loan"
                    className="absolute right-4 top-4 text-muted-foreground/40 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                {/* Outstanding + progress */}
                <div className="mt-5">
                  <div className="flex items-baseline justify-between">
                    <div>
                      <div className="text-xs text-muted-foreground">Outstanding</div>
                      <div className="text-2xl font-bold tracking-tight">
                        {formatMoney(l.outstanding)}
                      </div>
                    </div>
                    <div className="text-right text-xs text-muted-foreground">
                      of {formatMoney(l.principal)}
                    </div>
                  </div>
                  <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-background/60">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-primary to-violet-400 transition-all duration-500"
                      style={{ width: `${Math.min(l.progress_percent, 100)}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex justify-between text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{l.progress_percent}% paid</span>
                    <span>{l.paid_count} EMIs paid</span>
                  </div>
                </div>

                {/* Stats */}
                {!closed && (
                  <div className="mt-4 grid grid-cols-3 gap-2 rounded-xl border border-border/50 bg-background/30 p-3 text-center">
                    <div>
                      <div className="text-xs text-muted-foreground">Left</div>
                      <div className="text-sm font-semibold">{l.months_remaining} mo</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Payoff</div>
                      <div className="text-sm font-semibold">{fmtDate(l.payoff_date)}</div>
                    </div>
                    <div>
                      <div className="text-xs text-muted-foreground">Interest left</div>
                      <div className="text-sm font-semibold">{formatMoney(l.interest_remaining)}</div>
                    </div>
                  </div>
                )}

                {/* Next EMI split */}
                {!closed && (
                  <p className="mt-3 text-xs text-muted-foreground">
                    Next EMI: {formatMoney(l.next_payment.interest)} interest +{" "}
                    {formatMoney(l.next_payment.principal)} principal
                  </p>
                )}

                {/* Actions */}
                <div className="mt-4 flex items-center gap-2">
                  <LoanDetailsDialog
                    loanId={l.id}
                    onChanged={load}
                    trigger={
                      <Button variant="secondary" size="sm" className="flex-1">
                        <ListChecks className="h-4 w-4" />
                        Schedule
                      </Button>
                    }
                  />
                  {!closed && (
                    <Button size="sm" className="flex-1" onClick={() => pay(l.id)} disabled={busyId === l.id}>
                      {busyId === l.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <>
                          <CalendarCheck className="h-4 w-4" />
                          Pay EMI
                        </>
                      )}
                    </Button>
                  )}
                  {closed && (
                    <div className="flex flex-1 items-center justify-center gap-1.5 text-sm font-medium text-emerald-400">
                      <Check className="h-4 w-4" /> Fully repaid
                    </div>
                  )}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
