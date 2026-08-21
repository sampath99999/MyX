import { Link, useParams } from "react-router-dom";
import { ArrowRight, Search } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import PublicHeader, { PUBLIC_HEADER_OFFSET } from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";
import CalculatorShell from "@/components/calculators/CalculatorShell";
import { Reveal } from "@/components/landing/motion";
import NotFound from "@/pages/NotFound";
import {
  ALL_CALCULATOR_LINKS,
  CALCULATOR_BY_SLUG,
  CATEGORY_LABELS,
  linksByCategory,
  pathFor,
  type CalculatorCategory,
} from "@/lib/calculators/registry";
import { cn } from "@/lib/utils";

/*
  Two exports, one file, because they are two faces of the same route tree:
  /calculators is the hub and /calculators/:slug is one calculator.

  The hub is not decoration. For a set of tool pages, the index is the page that
  collects whatever authority the individual calculators earn and passes it back
  down to the ones that have none yet — every competitor that ranks for these
  terms has one, and they all link it from the primary navigation.
*/

const ORDER: CalculatorCategory[] = ["invest", "save", "borrow", "plan"];

export default function CalculatorsHub() {
  const [q, setQ] = useState("");

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    if (!needle) return null;
    return ALL_CALCULATOR_LINKS.filter(
      (c) =>
        c.name.toLowerCase().includes(needle) ||
        c.intro.toLowerCase().includes(needle) ||
        c.slug.includes(needle),
    );
  }, [q]);

  const card = (c: (typeof ALL_CALCULATOR_LINKS)[number]) => (
    <Link
      key={c.slug}
      to={pathFor(c.slug)}
      className="card-interactive group flex flex-col rounded-xl border border-border bg-card p-5"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">{c.name} calculator</h3>
        <ArrowRight className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:translate-x-0.5" />
      </div>
      <p className="mt-2 line-clamp-3 text-sm leading-relaxed text-muted-foreground">{c.intro}</p>
    </Link>
  );

  return (
    <div className="min-h-dvh">
      <PublicHeader />

      <section className={cn("grain relative overflow-hidden", PUBLIC_HEADER_OFFSET)}>
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div
            className="aurora drift-a left-[-10%] top-[-40%] size-[34rem]"
            style={{ background: "color-mix(in oklab, var(--brand) 75%, transparent)" }}
          />
          <div
            className="aurora drift-b right-[-14%] top-[-30%] size-[30rem]"
            style={{ background: "oklch(0.62 0.16 220)" }}
          />
          <div className="grid-bg absolute inset-0" />
        </div>

        <div className="relative mx-auto max-w-6xl px-5 pb-10 pt-14 sm:px-6 sm:pt-20">
          <p className="eyebrow">Free tools · No signup</p>
          <h1 className="mt-4 max-w-3xl text-3xl font-semibold leading-[1.08] tracking-[-0.03em] sm:text-5xl">
            Financial calculators for the questions you actually have
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground sm:text-lg">
            {ALL_CALCULATOR_LINKS.length} calculators covering loans, investments, deposits and
            tax. Each one shows its formula, names the convention it follows and links the source
            that sets the rule. Everything runs in your browser — nothing you type is sent anywhere.
          </p>

          <div className="relative mt-8 max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search calculators…"
              aria-label="Search calculators"
              className="h-11 pl-9"
            />
          </div>
        </div>

        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-background"
        />
      </section>

      <main className="mx-auto max-w-6xl px-5 pb-24 sm:px-6">
        {filtered ? (
          filtered.length === 0 ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              Nothing matches “{q}”. Try “SIP”, “loan” or “tax”.
            </p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">{filtered.map(card)}</div>
          )
        ) : (
          <div className="space-y-14">
            {ORDER.map((category) => {
              const items = linksByCategory(category);
              if (!items.length) return null;
              return (
                <Reveal key={category}>
                  <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
                    {CATEGORY_LABELS[category]}
                  </h2>
                  <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {items.map(card)}
                  </div>
                </Reveal>
              );
            })}
          </div>
        )}

        <Reveal className="mt-16">
          <div className="rounded-2xl border border-border bg-card/40 p-6 sm:p-10">
            <h2 className="max-w-2xl text-2xl font-semibold tracking-tight">
              A calculator answers once. MyX keeps answering.
            </h2>
            <p className="mt-4 max-w-2xl leading-relaxed text-muted-foreground">
              These work out what should happen. The app tracks what actually did — every EMI you
              pay, every SIP that debits, the budget you are drifting past — alongside your tasks,
              notes and everything else. Free, and nothing tracks you.
            </p>
            <Button size="lg" className="mt-7" asChild>
              <Link to="/login?mode=register">
                Create your account
                <ArrowRight />
              </Link>
            </Button>
          </div>
        </Reveal>
      </main>

      <PublicFooter />
    </div>
  );
}

/** /calculators/:slug — one registry entry, rendered into the shared shell. */
export function CalculatorRoute() {
  const { slug } = useParams();
  const calculator = slug ? CALCULATOR_BY_SLUG.get(slug) : undefined;
  // An unknown slug is a genuine 404, not a redirect to the hub — a soft 404
  // is the thing this site already went out of its way to avoid elsewhere.
  if (!calculator) return <NotFound />;
  return <CalculatorShell calculator={calculator} />;
}
