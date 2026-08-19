import { useEffect, useRef, useState } from "react";
import {
  Sparkles,
  Wallet,
  CheckSquare,
  StickyNote,
  Brain,
  ListChecks,
} from "lucide-react";

/*
  The hero's product shot.

  Prefers a real screenshot at /hero-app.png. If that file is missing or fails
  to load, it falls back to the hand-built mock below rather than leaving a hole
  where the product should be — a broken image in the hero is worse than a
  drawing of one.

  Below: a hand-built mock of the Money dashboard.

  Built from DOM rather than a screenshot on purpose: it stays sharp on any
  display, weighs nothing next to a 2x PNG, inherits the app's real theme tokens
  so it cannot drift from the product's actual colours, and it survives the
  build-time prerender as ordinary markup.

  The figures are illustrative and chosen to look like a real month rather than
  round marketing numbers — an odd balance, an untidy savings rate, categories
  in the proportions a household actually spends them.
*/

const months = [
  { label: "Mar", income: 62, expense: 41 },
  { label: "Apr", income: 58, expense: 47 },
  { label: "May", income: 64, expense: 38 },
  { label: "Jun", income: 61, expense: 52 },
  { label: "Jul", income: 68, expense: 44 },
  { label: "Aug", income: 66, expense: 39 },
];

const transactions = [
  {
    name: "Rent",
    category: "Housing",
    amount: "−24,000",
    tone: "bg-rose-400/80",
  },
  {
    name: "Salary",
    category: "Income",
    amount: "+96,500",
    tone: "bg-emerald-400/80",
    credit: true,
  },
  {
    name: "Groceries",
    category: "Food",
    amount: "−3,180",
    tone: "bg-amber-400/80",
  },
  {
    name: "Home loan EMI",
    category: "Loans",
    amount: "−18,240",
    tone: "bg-violet-400/80",
  },
];

const rail = [
  { icon: Wallet, active: true },
  { icon: CheckSquare, active: false },
  { icon: StickyNote, active: false },
  { icon: Brain, active: false },
  { icon: ListChecks, active: false },
];

export default function AppPreview() {
  const [shotFailed, setShotFailed] = useState(false);
  const imgRef = useRef<HTMLImageElement>(null);

  /*
    onError alone is not enough on this page.

    The hero is prerendered, so the browser starts fetching the screenshot while
    parsing the HTML — long before React hydrates and attaches any handler. When
    the file is missing the failure has already happened by then and the event is
    gone, leaving a broken-image icon sitting in the hero with the fallback never
    triggered. Asking the element whether it finished with no dimensions catches
    exactly that case.

    Worth knowing why the request "succeeds": Pages answers a missing path with
    the SPA shell at 200, so the browser receives HTML where an image should be
    rather than a 404.
  */
  useEffect(() => {
    const img = imgRef.current;
    if (img?.complete && img.naturalWidth === 0) setShotFailed(true);
  }, []);

  return (
    <div className="app-frame overflow-hidden rounded-2xl">
      {/* Title bar */}
      <div className="flex items-center gap-2 border-b border-border/40 px-4 py-3">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
        <div className="ml-3 flex-1 truncate rounded-md bg-background/60 px-3 py-1 text-[11px] text-muted-foreground">
          myx.samchitech.com/money
        </div>
      </div>

      {!shotFailed ? (
        <img
          ref={imgRef}
          src="/hero-app.webp"
          alt="The MyX money dashboard, showing balance, income, savings rate and six months of cash flow"
          width={1440}
          height={900}
          // Above the fold, so it must not be lazy — it is the largest paint.
          loading="eager"
          decoding="async"
          onError={() => setShotFailed(true)}
          className="block w-full"
        />
      ) : (
        <div className="flex">
          {/* Icon rail */}
          <div className="hidden w-14 shrink-0 flex-col items-center gap-1 border-r border-border/40 py-4 sm:flex">
            <div className="mb-3 flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            {rail.map((item, i) => (
              <div
                key={i}
                className={`flex h-9 w-9 items-center justify-center rounded-lg ${
                  item.active
                    ? "bg-primary/15 text-primary"
                    : "text-muted-foreground/50"
                }`}
              >
                <item.icon className="h-[1.05rem] w-[1.05rem]" />
              </div>
            ))}
          </div>

          <div className="min-w-0 flex-1 p-5 sm:p-6">
            {/* KPI row */}
            <div className="grid grid-cols-3 gap-3">
              {[
                {
                  label: "Balance",
                  value: "₹1,24,860",
                  accent: "text-emerald-300",
                },
                {
                  label: "Spent in Aug",
                  value: "₹38,410",
                  accent: "text-amber-300",
                },
                {
                  label: "Portfolio",
                  value: "₹4,86,200",
                  accent: "text-sky-300",
                },
              ].map((kpi) => (
                <div
                  key={kpi.label}
                  className="rounded-xl border border-border/50 px-3 py-2.5"
                >
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
                    {kpi.label}
                  </div>
                  <div
                    className={`tnum mt-1 text-sm font-bold sm:text-base ${kpi.accent}`}
                  >
                    {kpi.value}
                  </div>
                </div>
              ))}
            </div>

            {/* Six-month trend. Paired bars, income behind spend. */}
            <div className="mt-5 rounded-xl border border-border/50 p-4">
              <div className="flex items-baseline justify-between">
                <span className="text-xs font-semibold">Last 6 months</span>
                <span className="text-[11px] text-muted-foreground">
                  saved 38%
                </span>
              </div>
              <div className="mt-4 flex h-24 items-end gap-2.5">
                {months.map((m) => (
                  <div
                    key={m.label}
                    className="flex flex-1 flex-col items-center gap-1.5"
                  >
                    <div className="flex h-20 w-full items-end justify-center gap-[3px]">
                      <div
                        className="w-1/2 rounded-t-sm bg-primary/70"
                        style={{ height: `${m.income}%` }}
                      />
                      <div
                        className="w-1/2 rounded-t-sm bg-muted-foreground/30"
                        style={{ height: `${m.expense}%` }}
                      />
                    </div>
                    <span className="text-[10px] text-muted-foreground">
                      {m.label}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Recent transactions */}
            <div className="mt-4 space-y-1">
              {transactions.map((t) => (
                <div
                  key={t.name}
                  className="flex items-center gap-3 rounded-lg px-2 py-2"
                >
                  <span className={`h-6 w-6 shrink-0 rounded-full ${t.tone}`} />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-xs font-medium">{t.name}</div>
                    <div className="text-[10px] text-muted-foreground">
                      {t.category}
                    </div>
                  </div>
                  <div
                    className={`tnum text-xs font-semibold ${
                      t.credit ? "text-emerald-300" : "text-foreground/80"
                    }`}
                  >
                    {t.amount}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
