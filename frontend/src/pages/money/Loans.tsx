import { useCallback, useRef, useState } from "react";
import {
  Plus,
  Landmark,
  Trash2,
  Loader2,
  Check,
  CalendarCheck,
  ListChecks,
  CheckCircle2,
  TrendingDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import NewLoanDialog from "@/components/NewLoanDialog";
import LoanDetailsDialog from "@/components/LoanDetailsDialog";
import LoadError from "@/components/LoadError";
import { api, ApiError, formatMoney, type Loan } from "@/lib/api";
import { useAuthenticatedLoad } from "@/lib/useAuthenticatedLoad";
import { cn } from "@/lib/utils";

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Date(iso + "T00:00:00").toLocaleDateString("en-IN", {
    month: "short",
    year: "numeric",
  });
}

/** Local calendar date, not UTC — "today" must match the user's, not the server's. */
function todayIso(): string {
  const d = new Date();
  return new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
}

export default function Loans() {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [confirming, setConfirming] = useState<Loan | null>(null);
  const [payError, setPayError] = useState<string | null>(null);
  /*
    EMIs get logged days or weeks after they were actually paid. This date is
    also the expense's date, so leaving it at "today" would put last month's
    instalment into this month's spending, budgets and cash-flow chart.
  */
  const [paidOn, setPaidOn] = useState(todayIso);

  // Prepayment is a separate intent from an EMI: a free amount, all principal.
  const [prepaying, setPrepaying] = useState<Loan | null>(null);
  const [prepayAmount, setPrepayAmount] = useState("");
  const [prepaySaved, setPrepaySaved] = useState<{
    interest: number;
    months: number;
    closed: boolean;
  } | null>(null);

  // One key per payment *intent*, minted when the confirm dialog opens. Every
  // retry of that intent reuses it, so the server can collapse duplicates.
  const payKey = useRef<string | null>(null);

  const load = useCallback(async () => {
    const { loans } = await api.listLoans();
    setLoans(loans);
  }, []);

  const { loading, error, reload } = useAuthenticatedLoad(load);

  function askToPay(loan: Loan) {
    payKey.current = crypto.randomUUID();
    setPayError(null);
    setPaidOn(todayIso());
    setConfirming(loan);
  }

  async function confirmPay() {
    const loan = confirming;
    const key = payKey.current;
    if (!loan || !key) return;
    setBusyId(loan.id);
    setPayError(null);
    try {
      await api.payLoan(loan.id, key, true, paidOn);
      setConfirming(null);
      payKey.current = null;
      await reload();
    } catch (err) {
      // The key is deliberately kept so a retry is treated as the same intent
      // rather than booking a second EMI.
      setPayError(err instanceof ApiError ? err.message : "Could not record the payment.");
    } finally {
      setBusyId(null);
    }
  }

  function askToPrepay(loan: Loan) {
    payKey.current = crypto.randomUUID();
    setPayError(null);
    setPaidOn(todayIso());
    setPrepayAmount("");
    setPrepaySaved(null);
    setPrepaying(loan);
  }

  async function confirmPrepay() {
    const loan = prepaying;
    const key = payKey.current;
    const amount = Number(prepayAmount);
    if (!loan || !key) return;
    if (!Number.isFinite(amount) || amount <= 0) {
      setPayError("Enter an amount greater than 0.");
      return;
    }
    if (amount > loan.outstanding) {
      setPayError(`That is more than the ${formatMoney(loan.outstanding)} outstanding.`);
      return;
    }

    setBusyId(loan.id);
    setPayError(null);
    try {
      const res = await api.prepayLoan(loan.id, amount, key, paidOn);
      // Hold the dialog open on the result: what it saved is the whole point,
      // and closing straight away would throw that away.
      setPrepaySaved(res.saved ?? null);
      payKey.current = null;
      await reload();
    } catch (err) {
      setPayError(err instanceof ApiError ? err.message : "Could not record the prepayment.");
    } finally {
      setBusyId(null);
    }
  }

  async function remove(id: number) {
    setBusyId(id);
    try {
      await api.deleteLoan(id);
      await reload();
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
          onCreated={reload}
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
      ) : error ? (
        <LoadError message={error} onRetry={reload} />
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
            onCreated={reload}
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
                    onChanged={reload}
                    trigger={
                      <Button variant="secondary" size="sm" className="flex-1">
                        <ListChecks className="h-4 w-4" />
                        Schedule
                      </Button>
                    }
                  />
                  {!closed && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => askToPrepay(l)}
                        disabled={busyId === l.id}
                        title="Pay a lump sum off the principal"
                      >
                        <TrendingDown className="h-4 w-4" />
                        Prepay
                      </Button>
                      <Button size="sm" className="flex-1" onClick={() => askToPay(l)} disabled={busyId === l.id}>
                        {busyId === l.id ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <>
                            <CalendarCheck className="h-4 w-4" />
                            Pay EMI
                          </>
                        )}
                      </Button>
                    </>
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

      {/*
        "Pay EMI" writes a payment row, moves the outstanding balance and books a
        real expense. It used to do all that on a single unguarded tap, so this
        confirms the exact split first — and the request carries an idempotency
        key so a double-tap still books one payment.
      */}
      <Dialog
        open={confirming !== null}
        onOpenChange={(open) => {
          if (!open && busyId === null) {
            setConfirming(null);
            payKey.current = null;
            setPayError(null);
          }
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record this EMI?</DialogTitle>
            <DialogDescription>
              {confirming
                ? `${confirming.name}${confirming.lender ? ` · ${confirming.lender}` : ""}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {confirming && (
            <div className="space-y-3">
              <div className="rounded-xl border border-border/60 bg-background/40 p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">EMI amount</span>
                  <span className="text-xl font-bold tracking-tight">
                    {formatMoney(confirming.emi)}
                  </span>
                </div>
                <div className="mt-3 space-y-1.5 border-t border-border/50 pt-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Interest</span>
                    <span className="tabular-nums">
                      {formatMoney(confirming.next_payment.interest)}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Principal</span>
                    <span className="tabular-nums">
                      {formatMoney(confirming.next_payment.principal)}
                    </span>
                  </div>
                  <div className="flex justify-between border-t border-border/50 pt-1.5 font-medium">
                    <span>Balance after</span>
                    <span className="tabular-nums">
                      {formatMoney(
                        Math.max(confirming.outstanding - confirming.next_payment.principal, 0),
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <label htmlFor="paid-on" className="text-sm font-medium">
                  Paid on
                </label>
                <input
                  id="paid-on"
                  type="date"
                  value={paidOn}
                  max={todayIso()}
                  onChange={(e) => setPaidOn(e.target.value || todayIso())}
                  className="mt-1.5 w-full rounded-lg border border-input bg-transparent px-3 py-2.5 outline-none focus:border-ring"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {paidOn === todayIso()
                    ? `Logs an expense of ${formatMoney(confirming.emi)} under “Loan EMI”, dated today.`
                    : `Logs the expense under “Loan EMI”, dated ${new Date(
                        paidOn + "T00:00:00",
                      ).toLocaleDateString("en-IN", {
                        day: "numeric",
                        month: "long",
                        year: "numeric",
                      })} — so it counts towards that month's spending and budgets, not this one.`}
                </p>
              </div>

              {payError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                  {payError}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => {
                    setConfirming(null);
                    payKey.current = null;
                    setPayError(null);
                  }}
                  disabled={busyId !== null}
                >
                  Cancel
                </Button>
                <Button className="flex-1" onClick={confirmPay} disabled={busyId !== null}>
                  {busyId !== null ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <CalendarCheck className="h-4 w-4" />
                      {payError ? "Retry" : "Confirm payment"}
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/*
        Prepayment. Unlike an EMI there is nothing to preview beforehand — the
        interesting number is what it saved, so the dialog stays open afterwards
        to show it rather than closing on a silent success.
      */}
      <Dialog
        open={prepaying !== null}
        onOpenChange={(v) => {
          if (!v) {
            setPrepaying(null);
            setPrepaySaved(null);
            payKey.current = null;
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{prepaySaved ? "Prepayment recorded" : "Pay off a lump sum"}</DialogTitle>
            <DialogDescription>
              {prepaying
                ? `${prepaying.name}${prepaying.lender ? ` · ${prepaying.lender}` : ""}`
                : ""}
            </DialogDescription>
          </DialogHeader>

          {prepaying && !prepaySaved && (
            <div className="space-y-4">
              <p className="text-sm leading-relaxed text-muted-foreground">
                A prepayment goes entirely against the principal — no part of it is interest. Every
                month after this is then charged on a smaller balance, which is why it saves more
                than the amount you pay.
              </p>

              <div>
                <label htmlFor="prepay-amount" className="text-sm font-medium">
                  Amount
                </label>
                <input
                  id="prepay-amount"
                  type="number"
                  inputMode="decimal"
                  min={1}
                  max={prepaying.outstanding}
                  value={prepayAmount}
                  onChange={(e) => setPrepayAmount(e.target.value)}
                  placeholder="50000"
                  autoFocus
                  className="mt-1.5 w-full rounded-lg border border-input bg-transparent px-3 py-2.5 text-lg font-semibold tabular-nums outline-none focus:border-ring"
                />
                <p className="mt-1.5 text-xs text-muted-foreground">
                  {formatMoney(prepaying.outstanding)} outstanding.
                </p>
              </div>

              <div>
                <label htmlFor="prepay-date" className="text-sm font-medium">
                  Paid on
                </label>
                <input
                  id="prepay-date"
                  type="date"
                  value={paidOn}
                  max={todayIso()}
                  onChange={(e) => setPaidOn(e.target.value || todayIso())}
                  className="mt-1.5 w-full rounded-lg border border-input bg-transparent px-3 py-2.5 outline-none focus:border-ring"
                />
              </div>

              {payError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                  {payError}
                </div>
              )}

              <div className="flex gap-2 pt-1">
                <Button
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setPrepaying(null)}
                >
                  Cancel
                </Button>
                <Button
                  className="flex-1"
                  onClick={confirmPrepay}
                  disabled={busyId === prepaying.id}
                >
                  {busyId === prepaying.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <>
                      <TrendingDown className="h-4 w-4" />
                      Record prepayment
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}

          {prepaySaved && (
            <div className="space-y-4">
              <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <div className="text-xs uppercase tracking-wider text-emerald-300/80">
                  Interest saved
                </div>
                <div className="mt-1 text-3xl font-bold tracking-tight text-emerald-300">
                  {formatMoney(prepaySaved.interest)}
                </div>
                <p className="mt-2 text-sm text-muted-foreground">
                  {prepaySaved.closed
                    ? "That clears the loan — it is now closed."
                    : `The loan finishes ${prepaySaved.months} month${
                        prepaySaved.months === 1 ? "" : "s"
                      } earlier than it would have.`}
                </p>
              </div>
              <Button className="w-full" onClick={() => setPrepaying(null)}>
                Done
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
