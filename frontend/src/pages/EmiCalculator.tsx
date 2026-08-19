import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, ArrowRight, ChevronDown } from "lucide-react";
import { calculateLoan, formatRupees, formatTenure } from "@/lib/emi";

/*
  Public EMI calculator — no account, no gate, indexable.

  It exists for two reasons at once. It is the most-searched thing MyX is
  already good at, so it is the page most likely to bring anyone here at all;
  and it is an honest demo of the app's hardest feature, since it runs the same
  integer-paise reducing-balance maths the loan tracker does.

  Everything computes in the browser. No request leaves the page, which is worth
  saying out loud on a page where people type what they owe.
*/

const PRESETS = [
  { label: "Home loan", principal: 2_500_000, rate: 8.75, months: 240 },
  { label: "Car loan", principal: 800_000, rate: 9.5, months: 60 },
  { label: "Personal loan", principal: 300_000, rate: 13.5, months: 36 },
];

const FAQS = [
  {
    q: "How is EMI calculated?",
    a: "EMI = P × r × (1+r)^n ÷ ((1+r)^n − 1), where P is the principal, r is the monthly interest rate (annual rate ÷ 12 ÷ 100) and n is the number of months. This calculator uses that formula and then walks the loan month by month on a reducing balance, so the schedule matches what your bank posts.",
  },
  {
    q: "What is a reducing balance loan?",
    a: "Interest each month is charged only on what you still owe, not on the original amount. As the balance falls, the interest portion of every EMI falls with it and the principal portion grows. Flat-rate calculators ignore this and overstate the interest badly on long loans.",
  },
  {
    q: "Why is most of my early EMI going to interest?",
    a: "Because interest is charged on the outstanding balance, which is at its highest at the start. On a 20-year home loan the first instalment can be more than 80% interest. The schedule below shows the crossover month where principal finally overtakes it.",
  },
  {
    q: "Does prepaying a loan actually help?",
    a: "Yes, and more than most people expect. A prepayment reduces the balance that every future month's interest is calculated on, so it saves far more than the amount you pay in. The earlier in the tenure you do it, the larger the saving.",
  },
  {
    q: "Is my loan data sent anywhere?",
    a: "No. This calculator runs entirely in your browser — nothing you type is sent to a server, stored, or logged.",
  },
];

function Field({
  label,
  suffix,
  value,
  min,
  max,
  step,
  onChange,
}: {
  label: string;
  suffix: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (n: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label className="text-sm font-medium">{label}</label>
        <span className="text-xs text-muted-foreground">{suffix}</span>
      </div>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="tnum mt-1.5 w-full rounded-lg border border-input bg-transparent px-3 py-2.5 text-lg font-semibold outline-none focus:border-ring"
      />
      <input
        type="range"
        value={Math.min(Math.max(value, min), max)}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={`${label} slider`}
        className="mt-3 w-full accent-primary"
      />
    </div>
  );
}

export default function EmiCalculator() {
  const [principal, setPrincipal] = useState(2_500_000);
  const [rate, setRate] = useState(8.75);
  const [months, setMonths] = useState(240);
  const [showAll, setShowAll] = useState(false);

  const result = useMemo(
    () => calculateLoan(principal, rate, months),
    [principal, rate, months],
  );

  const valid = result.months > 0;
  const interestShare = valid
    ? Math.round((result.totalInterest / result.totalPayable) * 100)
    : 0;
  // The month principal repayment finally overtakes interest — the single most
  // surprising number on a long loan.
  const crossover = useMemo(
    () => result.schedule.find((r) => r.principal > r.interest)?.month ?? null,
    [result],
  );

  const rows = showAll ? result.schedule : result.schedule.slice(0, 12);

  return (
    <div className="min-h-dvh">
      <header className="border-b border-border/40">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3.5">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary glow">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold tracking-tight">MyX</span>
          </Link>
          <Link
            to="/login?mode=register"
            className="rounded-lg bg-foreground px-4 py-2 text-sm font-semibold text-background transition-opacity hover:opacity-90"
          >
            Track this loan free
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-6 py-12">
        <h1 className="max-w-3xl text-3xl font-extrabold tracking-tight sm:text-5xl">
          EMI calculator with the full repayment schedule
        </h1>
        <p className="mt-4 max-w-2xl text-lg leading-relaxed text-muted-foreground">
          Work out the EMI on a home, car or personal loan — and see every month of it. Interest is
          calculated on the reducing balance to the paise, the same way your bank does it. Nothing
          you type leaves your browser.
        </p>

        <div className="mt-8 flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => {
                setPrincipal(p.principal);
                setRate(p.rate);
                setMonths(p.months);
              }}
              className="rounded-lg border border-border/60 px-3.5 py-1.5 text-sm text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="mt-8 grid gap-6 lg:grid-cols-[1fr_1.15fr]">
          <section className="space-y-6 rounded-2xl border border-border/50 p-6">
            <Field
              label="Loan amount"
              suffix="₹"
              value={principal}
              min={10_000}
              max={50_000_000}
              step={10_000}
              onChange={setPrincipal}
            />
            <Field
              label="Interest rate"
              suffix="% per year"
              value={rate}
              min={0}
              max={30}
              step={0.05}
              onChange={setRate}
            />
            <Field
              label="Tenure"
              suffix={`months · ${formatTenure(months)}`}
              value={months}
              min={1}
              max={360}
              step={1}
              onChange={setMonths}
            />
          </section>

          <section className="rounded-2xl border border-border/50 p-6">
            {valid ? (
              <>
                <div className="text-sm text-muted-foreground">Monthly EMI</div>
                <div className="tnum text-4xl font-extrabold tracking-tight sm:text-5xl">
                  {formatRupees(result.emi)}
                </div>

                <dl className="mt-8 space-y-4">
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-sm text-muted-foreground">Principal</dt>
                    <dd className="tnum font-semibold">{formatRupees(principal * 100)}</dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-sm text-muted-foreground">Total interest</dt>
                    <dd className="tnum font-semibold text-amber-300">
                      {formatRupees(result.totalInterest)}
                    </dd>
                  </div>
                  <div className="flex items-baseline justify-between gap-4 border-t border-border/50 pt-4">
                    <dt className="text-sm text-muted-foreground">Total payable</dt>
                    <dd className="tnum text-lg font-bold">{formatRupees(result.totalPayable)}</dd>
                  </div>
                </dl>

                {/* Interest as a share of everything paid — the number that lands. */}
                <div className="mt-8">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>Principal</span>
                    <span>{interestShare}% of what you pay is interest</span>
                  </div>
                  <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-muted">
                    <div
                      className="bg-primary"
                      style={{ width: `${100 - interestShare}%` }}
                      aria-hidden="true"
                    />
                    <div
                      className="bg-amber-400/80"
                      style={{ width: `${interestShare}%` }}
                      aria-hidden="true"
                    />
                  </div>
                </div>

                {crossover && crossover > 1 && (
                  <p className="mt-6 text-sm leading-relaxed text-muted-foreground">
                    Until month <span className="text-foreground">{crossover}</span> more of each
                    EMI goes to interest than to clearing the loan.
                  </p>
                )}
              </>
            ) : (
              <p className="text-muted-foreground">
                At this rate the EMI would not cover even the first month's interest, so the balance
                would never fall. Raise the tenure or lower the rate.
              </p>
            )}
          </section>
        </div>

        {valid && (
          <section className="mt-12">
            <h2 className="text-2xl font-bold tracking-tight">Repayment schedule</h2>
            <p className="mt-2 text-sm text-muted-foreground">
              {result.months} instalments. The final one is trimmed to whatever is left.
            </p>

            <div className="mt-6 overflow-x-auto rounded-2xl border border-border/50">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b border-border/50 text-left text-xs uppercase tracking-wider text-muted-foreground">
                    <th className="px-4 py-3 font-medium">Month</th>
                    <th className="px-4 py-3 text-right font-medium">Interest</th>
                    <th className="px-4 py-3 text-right font-medium">Principal</th>
                    <th className="px-4 py-3 text-right font-medium">Balance</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.month} className="border-b border-border/30 last:border-0">
                      <td className="px-4 py-2.5 text-muted-foreground">{row.month}</td>
                      <td className="tnum px-4 py-2.5 text-right text-amber-300/90">
                        {formatRupees(row.interest)}
                      </td>
                      <td className="tnum px-4 py-2.5 text-right">{formatRupees(row.principal)}</td>
                      <td className="tnum px-4 py-2.5 text-right text-muted-foreground">
                        {formatRupees(row.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {result.schedule.length > 12 && (
              <button
                onClick={() => setShowAll((v) => !v)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-border/60 px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
              >
                {showAll ? "Show first 12 months" : `Show all ${result.months} months`}
                <ChevronDown className={`h-4 w-4 ${showAll ? "rotate-180" : ""}`} />
              </button>
            )}
          </section>
        )}

        <section className="mt-16 rounded-2xl border border-primary/25 bg-primary/5 p-8 sm:p-10">
          <h2 className="text-2xl font-bold tracking-tight">
            A calculator tells you the plan. MyX tells you where you are.
          </h2>
          <p className="mt-3 max-w-2xl leading-relaxed text-muted-foreground">
            Track the loan for real: log each EMI as you pay it, watch the outstanding balance fall,
            handle a floating-rate change mid-tenure, and see what a prepayment actually saves —
            alongside your budgets, bills and everything else.
          </p>
          <Link
            to="/login?mode=register"
            className="mt-7 inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 font-semibold text-primary-foreground glow transition-transform hover:-translate-y-0.5"
          >
            Start tracking free
            <ArrowRight className="h-4 w-4" />
          </Link>
        </section>

        <section className="mt-16">
          <h2 className="text-2xl font-bold tracking-tight">Common questions</h2>
          <dl className="mt-6 divide-y divide-border/50 border-y border-border/50">
            {FAQS.map((f) => (
              <div key={f.q} className="py-5">
                <dt className="font-semibold">{f.q}</dt>
                <dd className="mt-2 leading-relaxed text-muted-foreground">{f.a}</dd>
              </div>
            ))}
          </dl>
        </section>
      </main>

      <footer className="border-t border-border/40">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground">
          <span>© {new Date().getFullYear()} MyX</span>
          <div className="flex flex-wrap gap-6">
            <Link to="/" className="hover:text-foreground">
              Home
            </Link>
            <Link to="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}

/** FAQ copy, exported so index.html can carry it as FAQPage structured data. */
export { FAQS };
