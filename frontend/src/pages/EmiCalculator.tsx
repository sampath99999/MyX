import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronDown, ShieldCheck, Calculator, TableProperties } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Segmented } from "@/components/ui/tabs";
import NumberField from "@/components/calculators/NumberField";
import PublicHeader, { PUBLIC_HEADER_OFFSET } from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";
import Faq from "@/components/landing/Faq";
import { Reveal } from "@/components/landing/motion";
import { calculateLoan, formatRupees, formatTenure } from "@/lib/emi";
import { cn } from "@/lib/utils";

/*
  Public EMI calculator — no account, no gate, indexable.

  It exists for two reasons at once. It is the most-searched thing MyX is
  already good at, so it is the page most likely to bring anyone here at all;
  and it is an honest demo of the app's hardest feature, since it runs the same
  integer-paise reducing-balance maths the loan tracker does.

  Everything computes in the browser. No request leaves the page, which is worth
  saying out loud on a page where people type what they owe.

  Nothing here may import a charting library. This page is eagerly imported (it
  is prerendered), so anything it pulls in is paid for by every visitor to every
  route — the split chart below is hand-drawn SVG for exactly that reason.
*/

type PresetKey = "home" | "car" | "personal";

const PRESETS: { key: PresetKey; label: string; principal: number; rate: number; months: number }[] =
  [
    { key: "home", label: "Home loan", principal: 2_500_000, rate: 8.75, months: 240 },
    { key: "car", label: "Car loan", principal: 800_000, rate: 9.5, months: 60 },
    { key: "personal", label: "Personal loan", principal: 300_000, rate: 13.5, months: 36 },
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

/* ---------------------------------------------------------------- chart */

/**
 * How each EMI splits, month by month.
 *
 * The EMI is constant, so the bar height is constant and the only thing moving
 * is the line between principal (below) and interest (above). That makes the
 * crossover — the month the loan finally starts clearing faster than it accrues
 * — a shape rather than a sentence, which is the single most surprising fact
 * about a long loan.
 *
 * Drawn by hand rather than with Recharts: see the note at the top of the file.
 */
function SplitChart({
  schedule,
  crossover,
}: {
  schedule: { month: number; interest: number; principal: number }[];
  crossover: number | null;
}) {
  const path = useMemo(() => {
    if (schedule.length < 2) return null;
    // 360 months is a lot of path nodes for a 100-unit-wide SVG; sampling keeps
    // the markup small without changing the shape.
    const step = Math.max(1, Math.floor(schedule.length / 120));
    const points = schedule.filter((_, i) => i % step === 0 || i === schedule.length - 1);
    const w = 100;
    const h = 40;
    const dx = w / (points.length - 1);
    const coords = points.map((r, i) => {
      const total = r.principal + r.interest;
      const share = total > 0 ? r.principal / total : 0;
      // y is the top of the principal band, measured from the bottom.
      return [i * dx, h - share * h] as const;
    });
    const line = coords
      .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`)
      .join(" ");
    /*
      Both bands are explicit fills rather than one painted over a coloured
      background. With a background doing half the work the two swapped visual
      weight between themes — principal went dark on white and light on black,
      while the amber washed out to beige — so the same chart told a different
      story depending on the theme.
    */
    return {
      principal: `${line} L${w} ${h} L0 ${h} Z`,
      interest: `${line} L${w} 0 L0 0 Z`,
      line,
    };
  }, [schedule]);

  if (!path) return null;

  const crossoverX =
    crossover && schedule.length > 1 ? ((crossover - 1) / (schedule.length - 1)) * 100 : null;

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">Where each instalment goes</h3>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-foreground/12 ring-1 ring-inset ring-border" /> Principal
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-foreground/75" /> Interest
          </span>
        </div>
      </div>

      <div className="relative mt-3 overflow-hidden rounded-lg border border-border">
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="block h-28 w-full">
          <path d={path.interest} className="fill-foreground/75" />
          <path d={path.principal} className="fill-foreground/12" />
          <path
            d={path.line}
            fill="none"
            stroke="currentColor"
            strokeWidth="1"
            vectorEffect="non-scaling-stroke"
            className="text-background/50"
          />
        </svg>
        {crossoverX != null && crossoverX > 2 && crossoverX < 98 && (
          <div
            className="pointer-events-none absolute inset-y-0 w-px bg-foreground/40"
            style={{ left: `${crossoverX}%` }}
            aria-hidden
          />
        )}
      </div>

      <div className="tnum mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>Month 1</span>
        {crossover && crossover > 1 && <span>Crossover · month {crossover}</span>}
        <span>Month {schedule.length}</span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- page */

export default function EmiCalculator() {
  const [principal, setPrincipal] = useState(2_500_000);
  const [rate, setRate] = useState(8.75);
  const [months, setMonths] = useState(240);
  const [showAll, setShowAll] = useState(false);
  const [preset, setPreset] = useState<PresetKey>("home");

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

  function applyPreset(key: PresetKey) {
    const p = PRESETS.find((x) => x.key === key);
    if (!p) return;
    setPreset(key);
    setPrincipal(p.principal);
    setRate(p.rate);
    setMonths(p.months);
    setShowAll(false);
  }

  return (
    <div className="min-h-dvh">
      <PublicHeader />

      {/* ---------------- Hero ---------------- */}
      <section className={cn("grain relative overflow-hidden", PUBLIC_HEADER_OFFSET)}>
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div
            className="aurora drift-a left-[-8%] top-[-40%] size-[34rem]"
            style={{ background: "color-mix(in oklab, var(--brand) 75%, transparent)" }}
          />
          <div
            className="aurora drift-b right-[-12%] top-[-30%] size-[30rem]"
            style={{ background: "oklch(0.62 0.16 220)" }}
          />
          <div className="grid-bg absolute inset-0" />
        </div>

        <div className="relative mx-auto max-w-6xl px-5 pb-10 pt-14 sm:px-6 sm:pt-20">
          <p className="eyebrow">Free tool · No signup</p>
          <h1 className="mt-4 max-w-3xl text-3xl font-semibold leading-[1.08] tracking-[-0.03em] sm:text-5xl">
            EMI calculator with the full repayment schedule
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            Work out the EMI on a home, car or personal loan — and see every month of it. Interest
            is calculated on the reducing balance to the paise, the same way your bank does it.
          </p>
          <ul className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-muted-foreground">
            {[
              { icon: Calculator, text: "Reducing balance, to the paise" },
              { icon: TableProperties, text: "Every instalment, not just the total" },
              { icon: ShieldCheck, text: "Nothing you type leaves your browser" },
            ].map((t) => (
              <li key={t.text} className="inline-flex items-center gap-1.5">
                <t.icon className="size-3.5" />
                {t.text}
              </li>
            ))}
          </ul>
        </div>

        {/*
          The section clips the aurora, which drew a hard horizontal line across
          the page exactly where the colour stopped — the same seam the header
          used to make. This fades it into the page background instead.
        */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-28 bg-gradient-to-b from-transparent to-background"
        />
      </section>

      <main className="mx-auto max-w-6xl px-5 pb-24 sm:px-6">
        {/* ---------------- Calculator ---------------- */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
          <div className="space-y-4">
            <Segmented
              className="w-full [&>button]:flex-1"
              value={preset}
              onChange={applyPreset}
              options={PRESETS.map((p) => ({ value: p.key, label: p.label }))}
            />
            <Card className="space-y-6 p-5">
              <NumberField
                id="loan-amount"
                label="Loan amount"
                suffix="₹"
                value={principal}
                min={10_000}
                max={50_000_000}
                step={10_000}
                onChange={setPrincipal}
              />
              <NumberField
                id="interest-rate"
                label="Interest rate"
                suffix="% per year"
                value={rate}
                min={0}
                max={30}
                step={0.05}
                onChange={setRate}
              />
              <NumberField
                id="tenure"
                label="Tenure"
                suffix={`months · ${formatTenure(months)}`}
                value={months}
                min={1}
                max={360}
                step={1}
                onChange={setMonths}
              />
            </Card>
          </div>

          <Card className="p-5 sm:p-6">
            {valid ? (
              <>
                <div className="flex flex-wrap items-end justify-between gap-4">
                  <div>
                    <p className="eyebrow">Monthly EMI</p>
                    <p className="tnum mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
                      {formatRupees(result.emi)}
                    </p>
                  </div>
                  <Button asChild>
                    <Link to="/login?mode=register">
                      Track this loan free
                      <ArrowRight />
                    </Link>
                  </Button>
                </div>

                <dl className="mt-7 grid grid-cols-1 divide-y divide-border rounded-lg border border-border sm:grid-cols-3 sm:divide-x sm:divide-y-0">
                  {[
                    { term: "Principal", value: formatRupees(principal * 100), tone: "" },
                    { term: "Total interest", value: formatRupees(result.totalInterest), tone: "" },
                    { term: "Total payable", value: formatRupees(result.totalPayable), tone: "" },
                  ].map((row) => (
                    <div key={row.term} className="min-w-0 px-4 py-3">
                      <dt className="truncate text-xs text-muted-foreground">{row.term}</dt>
                      <dd className={cn("tnum mt-1 truncate text-lg font-semibold", row.tone)}>
                        {row.value}
                      </dd>
                    </div>
                  ))}
                </dl>

                {/* Interest as a share of everything paid — the number that lands. */}
                <div className="mt-6">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>What you actually pay</span>
                    <span className="tnum">
                      {interestShare}% of it is interest
                    </span>
                  </div>
                  <div className="mt-2 flex h-2.5 overflow-hidden rounded-full border border-border">
                    <div
                      className="bg-foreground/12"
                      style={{ width: `${100 - interestShare}%` }}
                      aria-hidden="true"
                    />
                    <div
                      className="bg-foreground/75"
                      style={{ width: `${interestShare}%` }}
                      aria-hidden="true"
                    />
                  </div>
                </div>

                <div className="mt-7 border-t border-border pt-6">
                  <SplitChart schedule={result.schedule} crossover={crossover} />
                </div>

                {crossover && crossover > 1 && (
                  <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
                    Until month <span className="font-medium text-foreground">{crossover}</span>,
                    more of every instalment goes to interest than to clearing the loan.
                  </p>
                )}
              </>
            ) : (
              <div className="py-10 text-center">
                <p className="mx-auto max-w-sm text-sm leading-relaxed text-muted-foreground">
                  At this rate the EMI would not cover even the first month's interest, so the
                  balance would never fall. Raise the tenure or lower the rate.
                </p>
              </div>
            )}
          </Card>
        </div>

        {/* ---------------- Schedule ---------------- */}
        {valid && (
          <Reveal className="mt-14">
            <h2 className="text-2xl font-semibold tracking-tight">Repayment schedule</h2>
            <p className="tnum mt-2 text-sm text-muted-foreground">
              {result.months} instalments. The final one is trimmed to whatever is left.
            </p>

            <div className="mt-5 overflow-x-auto rounded-xl border border-border">
              <table className="w-full min-w-[34rem] text-sm">
                <thead>
                  <tr className="border-b border-border bg-secondary/40 text-left">
                    <th className="px-4 py-2.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Month
                    </th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Interest
                    </th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Principal
                    </th>
                    <th className="px-4 py-2.5 text-right text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
                      Balance
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={row.month}
                      className={cn(
                        "border-b border-border last:border-0 transition-colors hover:bg-accent/40",
                        // The crossover row is the one worth finding in a wall
                        // of 240 numbers.
                        crossover === row.month && "bg-accent/50",
                      )}
                    >
                      <td className="tnum px-4 py-2.5 text-muted-foreground">{row.month}</td>
                      <td className="tnum px-4 py-2.5 text-right text-muted-foreground">
                        {formatRupees(row.interest)}
                      </td>
                      <td className="tnum px-4 py-2.5 text-right font-medium">
                        {formatRupees(row.principal)}
                      </td>
                      <td className="tnum px-4 py-2.5 text-right text-muted-foreground">
                        {formatRupees(row.balance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {result.schedule.length > 12 && (
              <Button variant="outline" className="mt-4" onClick={() => setShowAll((v) => !v)}>
                {showAll ? "Show first 12 months" : `Show all ${result.months} months`}
                <ChevronDown className={cn("transition-transform", showAll && "rotate-180")} />
              </Button>
            )}
          </Reveal>
        )}

        {/* ---------------- CTA ---------------- */}
        <Reveal className="mt-16">
          <div className="grain relative overflow-hidden rounded-2xl border border-border px-6 py-12 sm:px-10">
            <div aria-hidden className="pointer-events-none absolute inset-0">
              <div
                className="aurora drift-c left-1/2 top-[-45%] size-[30rem] -translate-x-1/2"
                style={{ background: "color-mix(in oklab, var(--brand) 60%, transparent)" }}
              />
              <div className="grid-bg absolute inset-0" />
            </div>
            <div className="relative">
              <h2 className="max-w-2xl text-2xl font-semibold tracking-tight sm:text-3xl">
                A calculator tells you the plan. MyX tells you where you are.
              </h2>
              <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
                Track the loan for real: log each EMI as you pay it, watch the outstanding balance
                fall, handle a floating-rate change mid-tenure, and see what a prepayment actually
                saves — alongside your budgets, bills and everything else.
              </p>
              <Button size="xl" className="mt-8" asChild>
                <Link to="/login?mode=register">
                  Start tracking free
                  <ArrowRight />
                </Link>
              </Button>
            </div>
          </div>
        </Reveal>

        {/* ---------------- FAQ ---------------- */}
        <Reveal className="mt-16">
          <h2 className="text-2xl font-semibold tracking-tight">Common questions</h2>
          <div className="mt-6">
            <Faq items={FAQS} />
          </div>
        </Reveal>
      </main>

      <PublicFooter />
    </div>
  );
}

/** FAQ copy, exported so index.html can carry it as FAQPage structured data. */
export { FAQS };
