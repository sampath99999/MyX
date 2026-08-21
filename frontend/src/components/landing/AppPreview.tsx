import {
  LayoutDashboard,
  Wallet,
  CheckCircle2,
  StickyNote,
  Brain,
  ListChecks,
  Search,
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  TrendingUp,
  ShoppingCart,
  Home,
  Utensils,
} from "lucide-react";
import { LogoMark } from "@/components/Logo";
import { cn } from "@/lib/utils";

/*
  The hero's product shot — drawn, not photographed.

  This used to be an <img src="/hero-app.webp"> with a hand-built mock behind it
  as a fallback, and a build step (scripts/optimize-hero.mjs) to resize whatever
  screenshot was dropped into public/. The screenshot went stale the moment the
  app was redesigned: the landing page was advertising a violet, glass-panelled
  product that no longer existed anywhere, and nothing in the build could have
  noticed.

  Built from DOM instead, permanently. It stays sharp on any display, weighs a
  few hundred bytes rather than 76 kB, survives the build-time prerender as
  ordinary markup, and — the point — it is made of the same tokens the real app
  uses, so it cannot drift out of date without the whole product drifting with
  it.

  The figures are illustrative and chosen to look like a real month rather than
  round marketing numbers: an untidy balance, a savings rate with a decimal's
  worth of character, categories in the proportions a household actually spends
  them.
*/

const RAIL = [
  { icon: LayoutDashboard, label: "Dashboard" },
  { icon: Wallet, label: "Money", active: true },
  { icon: CheckCircle2, label: "Tasks" },
  { icon: StickyNote, label: "Notes" },
  { icon: Brain, label: "Memories" },
  { icon: ListChecks, label: "Checklists" },
];

const MONTHS = [
  { label: "Mar", income: 72, expense: 44 },
  { label: "Apr", income: 68, expense: 51 },
  { label: "May", income: 74, expense: 41 },
  { label: "Jun", income: 70, expense: 58 },
  { label: "Jul", income: 79, expense: 47 },
  { label: "Aug", income: 76, expense: 40 },
];

const CATEGORIES = [
  { name: "Rent", pct: 51, tone: "bg-foreground/70" },
  { name: "Groceries", pct: 14, tone: "bg-foreground/50" },
  { name: "Insurance", pct: 8, tone: "bg-foreground/35" },
  { name: "Dining", pct: 7, tone: "bg-foreground/25" },
];

const TRANSACTIONS = [
  { name: "Salary", sub: "Income · 1 Aug", amount: "+₹1,85,000", credit: true, icon: ArrowUpRight },
  { name: "Rent", sub: "Housing · 1 Aug", amount: "−₹32,000", icon: Home },
  { name: "Weekly run — DMart", sub: "Groceries · 19 Aug", amount: "−₹1,240", icon: ShoppingCart },
  { name: "Lunch with the team", sub: "Dining · 18 Aug", amount: "−₹680", icon: Utensils },
];

export default function AppPreview() {
  return (
    <div
      className="overflow-hidden rounded-2xl border border-border bg-card"
      role="img"
      aria-label="The MyX money dashboard: a balance of ₹7,02,893, ₹69,611 spent this month, a 66% savings rate, six months of cash flow and the most recent transactions"
    >
      {/* Browser chrome */}
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="size-2.5 rounded-full bg-rose-400/60" />
        <span className="size-2.5 rounded-full bg-amber-400/60" />
        <span className="size-2.5 rounded-full bg-emerald-400/60" />
        <div className="ml-3 hidden flex-1 truncate rounded-md border border-border px-3 py-1 text-[11px] text-muted-foreground sm:block">
          myx.samchitech.com/money
        </div>
      </div>

      <div className="flex" aria-hidden>
        {/* Sidebar */}
        <div className="hidden w-44 shrink-0 flex-col gap-0.5 border-r border-border p-3 lg:flex">
          <div className="flex items-center gap-2 px-2 pb-4">
            <LogoMark size={22} />
            <span className="text-xs font-semibold">MyX</span>
          </div>
          <p className="px-2 pb-1.5 text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Overview
          </p>
          {RAIL.slice(0, 3).map((r) => (
            <div
              key={r.label}
              className={cn(
                "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[11px]",
                r.active ? "bg-accent text-foreground" : "text-muted-foreground",
              )}
            >
              <r.icon className="size-3.5" />
              {r.label}
            </div>
          ))}
          <p className="px-2 pb-1.5 pt-3 text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Personal
          </p>
          {RAIL.slice(3).map((r) => (
            <div
              key={r.label}
              className="flex items-center gap-2.5 rounded-md px-2 py-1.5 text-[11px] text-muted-foreground"
            >
              <r.icon className="size-3.5" />
              {r.label}
            </div>
          ))}
        </div>

        <div className="min-w-0 flex-1">
          {/* App header */}
          <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
            <div className="flex h-6 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-border px-2 text-[10px] text-muted-foreground sm:max-w-[12rem]">
              <Search className="size-2.5" />
              Search…
            </div>
            <div className="ml-auto flex items-center gap-1.5">
              <span className="flex h-6 items-center gap-1 rounded-md bg-foreground px-2 text-[10px] font-medium text-background">
                <Plus className="size-2.5" />
                Add
              </span>
              <span className="size-6 rounded-full bg-secondary" />
            </div>
          </div>

          {/* Money tabs */}
          <div className="flex gap-1 overflow-hidden border-b border-border px-4">
            {["Overview", "Transactions", "Bills", "Budgets", "Loans", "Goals"].map((t, i) => (
              <span
                key={t}
                className={cn(
                  "shrink-0 border-b-2 px-2.5 pb-2 pt-2.5 text-[11px] font-medium",
                  i === 0
                    ? "border-foreground text-foreground"
                    : "border-transparent text-muted-foreground",
                )}
              >
                {t}
              </span>
            ))}
          </div>

          <div className="p-4 sm:p-5">
            {/* Balance band */}
            <div className="flex flex-wrap items-end justify-between gap-3 border-b border-border pb-4">
              <div>
                <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                  Current balance
                </p>
                <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight sm:text-3xl">
                  ₹7,02,893
                </p>
                <p className="tnum mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
                  <TrendingUp className="size-3" />
                  +₹1,33,389 this month
                </p>
              </div>
              <span className="hidden h-7 items-center gap-1 rounded-md bg-foreground px-3 text-[11px] font-medium text-background sm:flex">
                <Plus className="size-3" />
                Add transaction
              </span>
            </div>

            {/* KPI row */}
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
              {[
                { label: "Income this month", value: "₹2,03,000", accent: "text-emerald-400" },
                { label: "Spent this month", value: "₹69,611" },
                { label: "Savings rate", value: "66%" },
                { label: "Committed / mo", value: "₹91,778" },
              ].map((k) => (
                <div key={k.label} className="rounded-lg border border-border p-3">
                  <p className="truncate text-[10px] text-muted-foreground">{k.label}</p>
                  <p className={cn("tnum mt-1.5 truncate text-sm font-semibold", k.accent)}>
                    {k.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Chart + categories */}
            <div className="mt-3 grid gap-3 lg:grid-cols-5">
              <div className="rounded-lg border border-border p-4 lg:col-span-3">
                <div className="flex items-baseline justify-between">
                  <span className="text-[11px] font-medium">Cash flow</span>
                  <span className="text-[10px] text-muted-foreground">last 6 months</span>
                </div>
                <div className="mt-4 flex h-20 items-end gap-2.5">
                  {MONTHS.map((m) => (
                    <div key={m.label} className="flex flex-1 flex-col items-center gap-1.5">
                      <div className="flex h-16 w-full items-end justify-center gap-[3px]">
                        <div
                          className="w-1/2 rounded-t-sm bg-emerald-400/70"
                          style={{ height: `${m.income}%` }}
                        />
                        <div
                          className="w-1/2 rounded-t-sm bg-foreground/20"
                          style={{ height: `${m.expense}%` }}
                        />
                      </div>
                      <span className="text-[9px] text-muted-foreground">{m.label}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="hidden rounded-lg border border-border p-4 lg:col-span-2 lg:block">
                <span className="text-[11px] font-medium">Where it went</span>
                <ul className="mt-3 space-y-2.5">
                  {CATEGORIES.map((c) => (
                    <li key={c.name}>
                      <div className="flex items-center justify-between text-[10px]">
                        <span className="truncate text-muted-foreground">{c.name}</span>
                        <span className="tnum shrink-0 text-muted-foreground">{c.pct}%</span>
                      </div>
                      <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-foreground/10">
                        <div
                          className={cn("h-full rounded-full", c.tone)}
                          style={{ width: `${c.pct * 1.6}%` }}
                        />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Recent transactions */}
            <div className="mt-3 divide-y divide-border overflow-hidden rounded-lg border border-border">
              {TRANSACTIONS.map((t) => (
                <div key={t.name} className="flex items-center gap-3 px-3 py-2.5">
                  <span
                    className={cn(
                      "flex size-7 shrink-0 items-center justify-center rounded-md",
                      t.credit
                        ? "bg-emerald-400/10 text-emerald-400"
                        : "bg-secondary text-muted-foreground",
                    )}
                  >
                    <t.icon className="size-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[11px] font-medium">{t.name}</p>
                    <p className="text-[9px] text-muted-foreground">{t.sub}</p>
                  </div>
                  <span
                    className={cn(
                      "tnum text-[11px] font-medium",
                      t.credit ? "text-emerald-400" : "text-foreground",
                    )}
                  >
                    {t.amount}
                  </span>
                  {!t.credit && (
                    <ArrowDownLeft className="size-3 shrink-0 text-muted-foreground/30" />
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
