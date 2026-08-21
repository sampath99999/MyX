import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, ChevronRight, ExternalLink, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import PublicHeader, { PUBLIC_HEADER_OFFSET } from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";
import NumberField from "@/components/calculators/NumberField";
import Faq from "@/components/landing/Faq";
import { Reveal } from "@/components/landing/motion";
import { linkFor, pathFor, type Calculator } from "@/lib/calculators/registry";
import { cn } from "@/lib/utils";

/*
  The frame every registry-driven calculator renders into.

  It owns layout, the header, the breadcrumb, the atmosphere and the section
  order. It owns no copy: every word a reader sees comes from the calculator's
  own entry in the registry, because a set of pages whose entire purpose is
  search cannot afford to share sentences.

  The order of the sections is deliberate and is the order the competitors that
  rank for these terms use: the tool first, because that is what the click was
  for; then the explanation; then the questions; then the links out. Burying the
  calculator under 800 words of preamble is the classic way to lose the visitor
  before the page has done its job.
*/

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(Math.round(n));

/* ---------------------------------------------------------------- chart */

/**
 * The year-by-year curve: what you put in, and what it grew to.
 *
 * Hand-drawn SVG. These pages are prerendered and the hub links them all
 * together, so pulling a charting library in here would put ~110 kB gzipped in
 * front of every calculator on the site for one area and one line.
 */
function GrowthChart({ series }: { series: { year: number; base: number; total: number }[] }) {
  const geometry = useMemo(() => {
    if (series.length < 2) return null;
    const max = Math.max(...series.map((p) => Math.max(p.total, p.base)), 1);
    const w = 100;
    const h = 40;
    const dx = w / (series.length - 1);
    const y = (v: number) => h - (v / max) * h;

    const line = (key: "base" | "total") =>
      series
        .map((p, i) => `${i === 0 ? "M" : "L"}${(i * dx).toFixed(2)} ${y(p[key]).toFixed(2)}`)
        .join(" ");

    return {
      totalArea: `${line("total")} L${w} ${h} L0 ${h} Z`,
      baseArea: `${line("base")} L${w} ${h} L0 ${h} Z`,
      totalLine: line("total"),
    };
  }, [series]);

  if (!geometry) return null;
  const last = series[series.length - 1];

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">Year by year</h3>
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-foreground/15 ring-1 ring-inset ring-border" />
            Paid in
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-2 rounded-sm bg-foreground/70" />
            Value
          </span>
        </div>
      </div>

      <div className="mt-3 overflow-hidden rounded-lg border border-border">
        <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="block h-32 w-full">
          <path d={geometry.totalArea} className="fill-foreground/70" />
          <path d={geometry.baseArea} className="fill-foreground/15" />
          <path
            d={geometry.totalLine}
            fill="none"
            stroke="currentColor"
            strokeWidth="1.25"
            vectorEffect="non-scaling-stroke"
            className="text-foreground"
          />
        </svg>
      </div>

      <div className="tnum mt-2 flex justify-between text-[11px] text-muted-foreground">
        <span>Year 1</span>
        <span>
          Year {last.year} · {inr(last.total)}
        </span>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- page */

export default function CalculatorShell({ calculator }: { calculator: Calculator }) {
  const [values, setValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(calculator.inputs.map((i) => [i.key, i.initial])),
  );

  const result = useMemo(() => calculator.compute(values), [calculator, values]);
  const primary = result.outputs.find((o) => o.primary) ?? result.outputs[0];
  const secondary = result.outputs.filter((o) => o !== primary);

  const splitPercent = result.split
    ? (result.split.bValue / Math.max(1, result.split.aValue + result.split.bValue)) * 100
    : 0;

  const related = calculator.related.map(linkFor).filter(Boolean);

  return (
    <div className="min-h-dvh">
      <PublicHeader />

      {/* ---------------- Hero ---------------- */}
      <section className={cn("grain relative overflow-hidden", PUBLIC_HEADER_OFFSET)}>
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div
            className="aurora drift-a left-[-8%] top-[-40%] size-[32rem]"
            style={{ background: "color-mix(in oklab, var(--brand) 75%, transparent)" }}
          />
          <div
            className="aurora drift-b right-[-12%] top-[-30%] size-[28rem]"
            style={{ background: "oklch(0.62 0.16 220)" }}
          />
          <div className="grid-bg absolute inset-0" />
        </div>

        <div className="relative mx-auto max-w-6xl px-5 pb-8 pt-10 sm:px-6 sm:pt-14">
          {/* A real breadcrumb, matching the BreadcrumbList in the page's JSON-LD. */}
          <nav aria-label="Breadcrumb" className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Link to="/" className="tap transition-colors hover:text-foreground">
              Home
            </Link>
            <ChevronRight className="size-3" />
            <Link to="/calculators" className="tap transition-colors hover:text-foreground">
              Calculators
            </Link>
            <ChevronRight className="size-3" />
            <span className="text-foreground">{calculator.name}</span>
          </nav>

          <h1 className="mt-5 max-w-3xl text-3xl font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[2.75rem]">
            {calculator.h1}
          </h1>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
            {calculator.intro}
          </p>
        </div>

        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-background"
        />
      </section>

      <main className="mx-auto max-w-6xl px-5 pb-24 sm:px-6">
        {/* ---------------- The tool ---------------- */}
        <div className="grid gap-4 lg:grid-cols-[minmax(0,22rem)_1fr]">
          <Card className="space-y-6 p-5">
            {calculator.inputs.map((input) => (
              <NumberField
                key={input.key}
                id={input.key}
                label={input.label}
                suffix={
                  typeof input.suffix === "function" ? input.suffix(values) : input.suffix
                }
                value={values[input.key]}
                min={input.min}
                max={input.max}
                step={input.step}
                options={input.options}
                onChange={(n) => setValues((v) => ({ ...v, [input.key]: n }))}
              />
            ))}

            <p className="flex gap-2.5 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              {calculator.assumption}
            </p>
          </Card>

          <Card className="p-5 sm:p-6">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="eyebrow">{primary.label}</p>
                <p className="tnum mt-2 text-4xl font-semibold tracking-tight sm:text-5xl">
                  {primary.value}
                </p>
                {primary.hint && (
                  <p className="mt-1.5 text-xs text-muted-foreground">{primary.hint}</p>
                )}
              </div>
              <Button asChild>
                <Link to="/login?mode=register">
                  Track this in MyX
                  <ArrowRight />
                </Link>
              </Button>
            </div>

            {secondary.length > 0 && (
              <dl
                className={cn(
                  "mt-7 grid grid-cols-1 divide-y divide-border rounded-lg border border-border",
                  secondary.length === 2 && "sm:grid-cols-2 sm:divide-x sm:divide-y-0",
                  secondary.length >= 3 && "sm:grid-cols-3 sm:divide-x sm:divide-y-0",
                )}
              >
                {secondary.map((o) => (
                  <div key={o.label} className="min-w-0 px-4 py-3">
                    <dt className="truncate text-xs text-muted-foreground">{o.label}</dt>
                    <dd className="tnum mt-1 truncate text-lg font-semibold">{o.value}</dd>
                    {o.hint && (
                      <p className="mt-1 truncate text-[11px] text-muted-foreground">{o.hint}</p>
                    )}
                  </div>
                ))}
              </dl>
            )}

            {result.split && (
              <div className="mt-6">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>{result.split.aLabel}</span>
                  <span className="tnum">
                    {result.split.caption ??
                      `${Math.round(splitPercent)}% ${result.split.bLabel.toLowerCase()}`}
                  </span>
                </div>
                <div className="mt-2 flex h-2.5 overflow-hidden rounded-full border border-border">
                  <div
                    className="bg-foreground/15"
                    style={{ width: `${100 - splitPercent}%` }}
                    aria-hidden
                  />
                  <div className="bg-foreground/75" style={{ width: `${splitPercent}%` }} aria-hidden />
                </div>
              </div>
            )}

            {result.note && (
              <p className="mt-5 rounded-lg border border-amber-400/30 bg-amber-400/[0.07] px-3.5 py-2.5 text-sm leading-relaxed">
                {result.note}
              </p>
            )}

            {result.series && result.series.length > 1 && (
              <div className="mt-7 border-t border-border pt-6">
                <GrowthChart series={result.series} />
              </div>
            )}
          </Card>
        </div>

        {/* ---------------- Explainer ---------------- */}
        <Reveal className="mt-16">
          <div className="grid gap-10 lg:grid-cols-[minmax(0,42rem)_1fr] lg:gap-16">
            <div className="space-y-10">
              {calculator.explainer.map((section) => (
                <section key={section.heading}>
                  <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
                    {section.heading}
                  </h2>
                  {section.body.map((p, i) => (
                    <p key={i} className="mt-4 leading-relaxed text-muted-foreground">
                      {p}
                    </p>
                  ))}
                </section>
              ))}
            </div>

            {/*
              Sources, named and linked. On a page that tells someone what their
              money will do, "trust me" is not a position — and an outbound link
              to the regulator that sets the rule is worth more than another
              paragraph asserting it.
            */}
            <aside className="lg:sticky lg:top-24 lg:self-start">
              <Card className="p-5">
                <h2 className="text-sm font-semibold">Sources</h2>
                <ul className="mt-4 space-y-3.5">
                  {calculator.references.map((ref) => (
                    <li key={ref.url}>
                      <a
                        href={ref.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="group flex items-start gap-2 text-sm"
                      >
                        <ExternalLink className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                        <span className="min-w-0">
                          <span className="block underline decoration-foreground/25 underline-offset-4 transition-colors group-hover:decoration-foreground">
                            {ref.label}
                          </span>
                          <span className="block text-xs text-muted-foreground">
                            {ref.publisher}
                          </span>
                        </span>
                      </a>
                    </li>
                  ))}
                </ul>
                <p className="mt-5 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
                  This calculator is for planning. It is not financial advice, and the figures are
                  estimates based on what you entered.
                </p>
              </Card>
            </aside>
          </div>
        </Reveal>

        {/* ---------------- FAQ ---------------- */}
        <Reveal className="mt-16">
          <h2 className="text-2xl font-semibold tracking-tight">Common questions</h2>
          <div className="mt-6 max-w-3xl">
            <Faq items={calculator.faqs} />
          </div>
        </Reveal>

        {/* ---------------- Related ---------------- */}
        {related.length > 0 && (
          <Reveal className="mt-16">
            <h2 className="text-2xl font-semibold tracking-tight">Related calculators</h2>
            <div className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {related.map((c) => (
                <Link
                  key={c!.slug}
                  to={pathFor(c!.slug)}
                  className="card-interactive group rounded-xl border border-border bg-card p-4"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-medium">{c!.name}</p>
                    <ArrowRight className="size-3.5 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
                  </div>
                  <p className="mt-2 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                    {c!.intro}
                  </p>
                </Link>
              ))}
            </div>
            <Button variant="outline" className="mt-6" asChild>
              <Link to="/calculators">
                See all calculators
                <ArrowRight />
              </Link>
            </Button>
          </Reveal>
        )}
      </main>

      <PublicFooter />
    </div>
  );
}
