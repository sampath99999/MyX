import { useMemo, useState } from "react";
import { TrendingDown, ArrowRight } from "lucide-react";
import { previewLoan } from "@/lib/loan";
import { formatMoney, type Loan } from "@/lib/api";

/*
  "What if" for a loan, run against the current outstanding balance.

  Deliberately a simulation and not an action. Prepaying and raising an EMI are
  the two levers a borrower actually has, and both are irreversible in real life
  — being able to see what each is worth before committing is the point. Nothing
  here writes anything.

  Everything computes in the browser using the same reducing-balance projection
  the loan tracker and the public calculator use, so the numbers agree with what
  recording the payment would actually produce.
*/

function monthsLabel(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (!y) return `${m} month${m === 1 ? "" : "s"}`;
  if (!m) return `${y} year${y === 1 ? "" : "s"}`;
  return `${y}y ${m}m`;
}

export default function LoanSimulator({ loan }: { loan: Loan }) {
  const [prepay, setPrepay] = useState("");
  const [emi, setEmi] = useState(String(loan.emi));

  const baseline = useMemo(
    () => previewLoan(loan.outstanding, loan.annual_rate, loan.emi),
    [loan],
  );

  const simulated = useMemo(() => {
    const lump = Number(prepay) || 0;
    const newEmi = Number(emi) || loan.emi;
    const balance = Math.max(loan.outstanding - lump, 0);
    if (balance <= 0) return null; // Cleared outright.
    return previewLoan(balance, loan.annual_rate, newEmi);
  }, [prepay, emi, loan]);

  const lump = Number(prepay) || 0;
  const clearsLoan = lump >= loan.outstanding;
  const changed = lump > 0 || Number(emi) !== loan.emi;

  // A raised EMI has to at least cover the first month's interest, or the
  // balance never falls — previewLoan reports that rather than looping.
  const emiTooLow = simulated !== null && !simulated.coversInterest;

  const interestSaved =
    baseline && simulated && !emiTooLow ? baseline.totalInterest - simulated.totalInterest : 0;
  const monthsSaved = baseline && simulated && !emiTooLow ? baseline.months - simulated.months : 0;

  return (
    <div className="rounded-xl border border-border/60 p-4">
      <div className="flex items-center gap-2">
        <TrendingDown className="h-4 w-4 text-primary" />
        <h4 className="text-sm font-semibold">What if…</h4>
      </div>
      <p className="mt-1 text-xs text-muted-foreground">
        Try a lump sum or a bigger EMI. Nothing is saved — this only shows what it would be worth.
      </p>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <div>
          <label htmlFor="sim-prepay" className="text-xs font-medium text-muted-foreground">
            Pay a lump sum
          </label>
          <input
            id="sim-prepay"
            type="number"
            min={0}
            max={loan.outstanding}
            value={prepay}
            onChange={(e) => setPrepay(e.target.value)}
            placeholder="0"
            className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm font-semibold tabular-nums outline-none focus:border-ring"
          />
        </div>
        <div>
          <label htmlFor="sim-emi" className="text-xs font-medium text-muted-foreground">
            Change the EMI
          </label>
          <input
            id="sim-emi"
            type="number"
            min={1}
            value={emi}
            onChange={(e) => setEmi(e.target.value)}
            className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 text-sm font-semibold tabular-nums outline-none focus:border-ring"
          />
        </div>
      </div>

      {!changed ? (
        <p className="mt-4 text-xs text-muted-foreground">
          As it stands: {monthsLabel(baseline?.months ?? 0)} left,{" "}
          {formatMoney(baseline?.totalInterest ?? 0)} of interest still to pay.
        </p>
      ) : clearsLoan ? (
        <div className="mt-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
          <p className="text-sm font-semibold text-emerald-300">
            That clears the loan outright.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            It would save the whole {formatMoney(baseline?.totalInterest ?? 0)} of remaining
            interest and end it {monthsLabel(baseline?.months ?? 0)} early.
          </p>
        </div>
      ) : emiTooLow ? (
        <p className="mt-4 text-xs text-rose-300">
          That EMI would not cover even the first month's interest, so the balance would never fall.
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Time left</span>
            <span className="flex items-center gap-2 tabular-nums">
              <span className="text-muted-foreground line-through">
                {monthsLabel(baseline?.months ?? 0)}
              </span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="font-semibold">{monthsLabel(simulated?.months ?? 0)}</span>
            </span>
          </div>
          <div className="flex items-center justify-between gap-3 text-sm">
            <span className="text-muted-foreground">Interest still to pay</span>
            <span className="flex items-center gap-2 tabular-nums">
              <span className="text-muted-foreground line-through">
                {formatMoney(baseline?.totalInterest ?? 0)}
              </span>
              <ArrowRight className="h-3 w-3 text-muted-foreground" />
              <span className="font-semibold">{formatMoney(simulated?.totalInterest ?? 0)}</span>
            </span>
          </div>

          {interestSaved > 0 && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3">
              <div className="text-xs uppercase tracking-wider text-emerald-300/80">You would save</div>
              <div className="mt-0.5 text-xl font-bold tracking-tight text-emerald-300">
                {formatMoney(interestSaved)}
              </div>
              {monthsSaved > 0 && (
                <div className="mt-0.5 text-xs text-muted-foreground">
                  and finish {monthsLabel(monthsSaved)} earlier
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
