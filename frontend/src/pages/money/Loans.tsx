import { useCallback, useRef, useState } from "react";
import {
  Plus,
  Landmark,
  Trash2,
  Check,
  CalendarCheck,
  ListChecks,
  CheckCircle2,
  TrendingDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Stat, Meter } from "@/components/ui/stat";
import { PageShell, PageHeader, EmptyState } from "@/components/ui/page";
import { SkeletonCards } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
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
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();
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
      toast.success(`EMI recorded for ${loan.name}`, `${formatMoney(loan.emi)} logged as an expense.`);
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

  async function remove(loan: Loan) {
    const ok = await confirm({
      title: `Delete "${loan.name}"?`,
      description:
        "The loan and its whole payment history go with it. Expenses already logged against it stay in your ledger.",
      confirmLabel: "Delete loan",
    });
    if (!ok) return;
    setBusyId(loan.id);
    try {
      await api.deleteLoan(loan.id);
      toast.success(`"${loan.name}" deleted`);
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  const activeLoans = loans.filter((l) => l.status === "active");
  const totalOutstanding = activeLoans.reduce((s, l) => s + l.outstanding, 0);
  const monthlyEmi = activeLoans.reduce((s, l) => s + l.emi, 0);
  const interestLeft = activeLoans.reduce((s, l) => s + l.interest_remaining, 0);

  return (
    <PageShell className="space-y-6">
      {confirmDialog}
      <PageHeader
        title="Loans"
        description="Reducing-balance amortization, to the paise. Enter the EMI and rate your bank gave you and MyX derives the rest."
        actions={
          <NewLoanDialog
            onCreated={reload}
            trigger={
              <Button>
                <Plus />
                Add loan
              </Button>
            }
          />
        }
      />

      {!loading && !error && activeLoans.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label="Outstanding"
            value={formatMoney(totalOutstanding)}
            icon={Landmark}
            sub={`${activeLoans.length} active loan${activeLoans.length === 1 ? "" : "s"}`}
          />
          <Stat
            label="EMI each month"
            value={formatMoney(monthlyEmi)}
            icon={CalendarCheck}
            sub="Committed until payoff"
          />
          <Stat
            label="Interest still to pay"
            value={formatMoney(interestLeft)}
            icon={TrendingDown}
            sub="On the current schedule — prepaying cuts it"
          />
        </div>
      )}

      {loading ? (
        <SkeletonCards count={2} />
      ) : error ? (
        <Card className="p-4">
          <LoadError message={error} onRetry={reload} />
        </Card>
      ) : loans.length === 0 ? (
        <EmptyState
          icon={Landmark}
          title="No loans yet"
          description="Add an education, home or car loan. Enter your EMI and rate, and MyX computes the exact reducing-balance schedule your bank uses — including what a lump-sum prepayment would save."
          action={
            <NewLoanDialog
              onCreated={reload}
              trigger={
                <Button>
                  <Plus />
                  Add a loan
                </Button>
              }
            />
          }
        />
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {loans.map((l) => {
            const closed = l.status === "closed";
            return (
              <Card key={l.id} className={cn("p-5", closed && "opacity-75")}>
                <div className="flex items-start gap-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                    <Landmark className="size-4" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate text-sm font-semibold">{l.name}</span>
                      {closed && (
                        <Badge variant="success">
                          <CheckCircle2 className="size-3" /> Closed
                        </Badge>
                      )}
                    </div>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {l.lender ? `${l.lender} · ` : ""}
                      {l.annual_rate}% p.a. · EMI {formatMoney(l.emi)}
                    </p>
                  </div>
                  <button
                    onClick={() => remove(l)}
                    disabled={busyId === l.id}
                    aria-label={`Delete ${l.name}`}
                    className="-mr-1.5 -mt-1.5 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-rose-400"
                  >
                    <Trash2 className="size-4" />
                  </button>
                </div>

                {/* Outstanding + progress */}
                <div className="mt-5">
                  <div className="flex items-baseline justify-between gap-3">
                    <div>
                      <p className="eyebrow">Outstanding</p>
                      <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight">
                        {formatMoney(l.outstanding)}
                      </p>
                    </div>
                    <p className="tnum text-xs text-muted-foreground">
                      of {formatMoney(l.principal)} borrowed
                    </p>
                  </div>
                  <Meter
                    className="mt-3"
                    value={l.progress_percent / 100}
                    tone={closed ? "positive" : "default"}
                  />
                  <div className="tnum mt-2 flex justify-between text-xs text-muted-foreground">
                    <span className="font-medium text-foreground">{l.progress_percent}% repaid</span>
                    <span>{l.paid_count} EMIs paid</span>
                  </div>
                </div>

                {!closed && (
                  <>
                    <div className="mt-4 grid grid-cols-3 divide-x divide-border rounded-lg border border-border">
                      {[
                        { label: "Months left", value: `${l.months_remaining}` },
                        { label: "Payoff", value: fmtDate(l.payoff_date) },
                        { label: "Interest left", value: formatMoney(l.interest_remaining) },
                      ].map((s) => (
                        <div key={s.label} className="min-w-0 px-3 py-2.5 text-center">
                          <p className="truncate text-[0.6875rem] text-muted-foreground">
                            {s.label}
                          </p>
                          <p className="tnum mt-0.5 truncate text-sm font-medium">{s.value}</p>
                        </div>
                      ))}
                    </div>

                    <p className="tnum mt-3 text-xs text-muted-foreground">
                      Next EMI splits {formatMoney(l.next_payment.interest)} interest +{" "}
                      {formatMoney(l.next_payment.principal)} principal
                    </p>
                  </>
                )}

                <div className="mt-4 flex items-center gap-2">
                  <LoanDetailsDialog
                    loanId={l.id}
                    onChanged={reload}
                    trigger={
                      <Button variant="outline" className="flex-1">
                        <ListChecks />
                        Schedule
                      </Button>
                    }
                  />
                  {!closed ? (
                    <>
                      <Button
                        variant="outline"
                        onClick={() => askToPrepay(l)}
                        disabled={busyId === l.id}
                        title="Pay a lump sum off the principal"
                      >
                        <TrendingDown />
                        Prepay
                      </Button>
                      <Button
                        className="flex-1"
                        onClick={() => askToPay(l)}
                        loading={busyId === l.id}
                      >
                        {busyId !== l.id && <CalendarCheck />}
                        Pay EMI
                      </Button>
                    </>
                  ) : (
                    <div className="flex flex-1 items-center justify-center gap-1.5 text-sm font-medium text-emerald-400">
                      <Check className="size-4" /> Fully repaid
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
            <div className="space-y-4">
              <div className="rounded-lg border border-border p-4">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm text-muted-foreground">EMI amount</span>
                  <span className="tnum text-xl font-semibold tracking-tight">
                    {formatMoney(confirming.emi)}
                  </span>
                </div>
                <div className="mt-3 space-y-1.5 border-t border-border pt-3 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Interest</span>
                    <span className="tnum">{formatMoney(confirming.next_payment.interest)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Principal</span>
                    <span className="tnum">{formatMoney(confirming.next_payment.principal)}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-1.5 font-medium">
                    <span>Balance after</span>
                    <span className="tnum">
                      {formatMoney(
                        Math.max(confirming.outstanding - confirming.next_payment.principal, 0),
                      )}
                    </span>
                  </div>
                </div>
              </div>

              <div>
                <Label htmlFor="paid-on">Paid on</Label>
                <Input
                  id="paid-on"
                  type="date"
                  value={paidOn}
                  max={todayIso()}
                  onChange={(e) => setPaidOn(e.target.value || todayIso())}
                  className="mt-1.5"
                />
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
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

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button
                  variant="outline"
                  onClick={() => {
                    setConfirming(null);
                    payKey.current = null;
                    setPayError(null);
                  }}
                  disabled={busyId !== null}
                >
                  Cancel
                </Button>
                <Button onClick={confirmPay} loading={busyId !== null}>
                  {busyId === null && <CalendarCheck />}
                  {payError ? "Retry" : "Confirm payment"}
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
                <Label htmlFor="prepay-amount">Amount</Label>
                <Input
                  id="prepay-amount"
                  type="number"
                  inputMode="decimal"
                  min={1}
                  max={prepaying.outstanding}
                  value={prepayAmount}
                  onChange={(e) => setPrepayAmount(e.target.value)}
                  placeholder="50000"
                  autoFocus
                  className="tnum mt-1.5 h-11 text-lg font-semibold"
                />
                <p className="tnum mt-1.5 text-xs text-muted-foreground">
                  {formatMoney(prepaying.outstanding)} outstanding.
                </p>
              </div>

              <div>
                <Label htmlFor="prepay-date">Paid on</Label>
                <Input
                  id="prepay-date"
                  type="date"
                  value={paidOn}
                  max={todayIso()}
                  onChange={(e) => setPaidOn(e.target.value || todayIso())}
                  className="mt-1.5"
                />
              </div>

              {payError && (
                <div className="rounded-md border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
                  {payError}
                </div>
              )}

              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => setPrepaying(null)}>
                  Cancel
                </Button>
                <Button onClick={confirmPrepay} loading={busyId === prepaying.id}>
                  {busyId !== prepaying.id && <TrendingDown />}
                  Record prepayment
                </Button>
              </div>
            </div>
          )}

          {prepaySaved && (
            <div className="space-y-4">
              <div className="rounded-lg border border-emerald-400/30 bg-emerald-400/[0.07] p-4">
                <p className="eyebrow text-emerald-400/80">Interest saved</p>
                <p className="tnum mt-1.5 text-3xl font-semibold tracking-tight text-emerald-400">
                  {formatMoney(prepaySaved.interest)}
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
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
    </PageShell>
  );
}
