import { Link } from "react-router-dom";
import {
  Sparkles,
  Wallet,
  CheckCircle2,
  StickyNote,
  Brain,
  ListChecks,
  PiggyBank,
  ArrowRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import AppPreview from "@/components/landing/AppPreview";

/*
  Public marketing page — the only route a logged-out visitor (or a crawler) can
  reach. Prerendered to static HTML at build time (scripts/prerender.mjs), so
  every word here ships in the first response.
*/

/*
  Bento rather than a uniform grid: Money is the module the app is built around
  and the one with the most in it, so it gets the space. `span` drives the
  layout, and the pairing of long and short copy is what stops six equal cards
  reading as a list of features nobody wrote.
*/
const modules: {
  icon: typeof Wallet;
  title: string;
  span?: string;
  body: string;
  detail?: string;
  link?: { to: string; label: string };
}[] = [
  {
    icon: Wallet,
    title: "Money",
    span: "sm:col-span-2",
    body: "Income, expenses and a running balance. Budgets per category, bills that roll their own due dates forward, and EMI loans on reducing-balance amortization that match the bank to the paise.",
    detail: "Dashboard · Transactions · Recurring · Budgets · Loans · Goals · Investments",
    link: { to: "/emi-calculator", label: "Try the free EMI calculator" },
  },
  {
    icon: CheckCircle2,
    title: "Tasks",
    span: "sm:row-span-2",
    body: "Spaces keep work and personal apart. Projects as a list or a board you drag things around.",
    detail: "pay rent tomorrow !p1 #home — parsed as you type",
  },
  {
    icon: StickyNote,
    title: "Notes",
    body: "Notebooks, tags, markdown with live preview, and search across everything.",
  },
  {
    icon: PiggyBank,
    title: "Investments",
    body: "Stocks, funds, FDs, gold and crypto, valued by hand. Gain and loss derived.",
  },
  {
    icon: ListChecks,
    title: "Checklists",
    body: "Routines you tick off again and again. Resets each run, unlike a task.",
  },
  {
    icon: Brain,
    title: "Memories",
    body: "The moments worth keeping, with a date, a mood and tags.",
  },
];

/*
  Concrete and checkable, rather than adjectives. Every one of these is a fact
  about the deployed build.
*/
const facts = [
  { value: "~100 kB", label: "JavaScript on first load" },
  { value: "137", label: "tests on every push" },
  { value: "0", label: "trackers, ads or analytics" },
  { value: "24h", label: "sessions, revocable instantly" },
];

export default function Landing() {
  const { user } = useAuth();

  const primaryCta = user
    ? { to: "/dashboard", label: "Open your dashboard" }
    : { to: "/login?mode=register", label: "Create your account" };

  return (
    <div className="min-h-dvh overflow-x-hidden">
      <header className="sticky top-0 z-20 border-b border-border/40 glass">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3.5">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary glow">
              <Sparkles className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="font-bold tracking-tight">MyX</span>
          </div>
          <nav className="flex items-center gap-1 text-sm">
            <a
              href="#modules"
              className="hidden rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              What's inside
            </a>
            <a
              href="#built"
              className="hidden rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              How it's built
            </a>
            <Link
              to="/emi-calculator"
              className="hidden rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:text-foreground sm:block"
            >
              EMI calculator
            </Link>
            <Link
              to={user ? "/dashboard" : "/login"}
              className="rounded-lg px-3 py-2 font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {user ? "Open app" : "Sign in"}
            </Link>
            <Link
              to={primaryCta.to}
              className="rounded-lg bg-foreground px-4 py-2 font-semibold text-background transition-opacity hover:opacity-90"
            >
              {user ? "Dashboard" : "Get started"}
            </Link>
          </nav>
        </div>
      </header>

      {/* ---------------- Hero ---------------- */}
      <section className="relative">
        <div className="pointer-events-none absolute inset-0 grid-bg" aria-hidden="true" />

        <div className="relative mx-auto max-w-6xl px-6 pb-4 pt-16 sm:pt-24">
          <div className="max-w-3xl animate-in-up">
            <p className="inline-flex items-center gap-2 rounded-full border border-border/60 px-3 py-1 text-xs text-muted-foreground">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
              Free, and free of anything that reads your data
            </p>

            <h1 className="mt-6 text-[2.6rem] font-extrabold leading-[1.03] tracking-[-0.03em] sm:text-6xl lg:text-7xl">
              Everything you keep
              <br />
              <span className="text-gradient">meaning to organize.</span>
            </h1>

            <p className="mt-6 max-w-xl text-lg leading-relaxed text-muted-foreground">
              Money, tasks, notes, checklists and the things you want to remember — one app, one
              account, no ads. Built for the six things you currently keep in six places.
            </p>

            <div className="mt-9 flex flex-wrap items-center gap-3">
              <Link
                to={primaryCta.to}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3.5 font-semibold text-primary-foreground glow transition-transform hover:-translate-y-0.5"
              >
                {primaryCta.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <span className="text-sm text-muted-foreground">
                Takes a minute. Nothing to install.
              </span>
            </div>
          </div>

          {/* The product, immediately. */}
          <div className="mt-14 sm:mt-20">
            <AppPreview />
          </div>
        </div>
      </section>

      {/* ---------------- Facts strip ---------------- */}
      <section className="mx-auto mt-20 max-w-6xl px-6">
        <div className="rule-fade" />
        <dl className="grid grid-cols-2 gap-8 py-10 sm:grid-cols-4">
          {facts.map((f) => (
            <div key={f.label}>
              <dt className="text-2xl font-bold tracking-tight sm:text-3xl">{f.value}</dt>
              <dd className="mt-1 text-sm leading-snug text-muted-foreground">{f.label}</dd>
            </div>
          ))}
        </dl>
        <div className="rule-fade" />
      </section>

      {/* ---------------- Modules ---------------- */}
      <section id="modules" className="mx-auto max-w-6xl scroll-mt-20 px-6 py-20 sm:py-28">
        <div className="max-w-2xl">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Six apps' worth, sharing one account.
          </h2>
          <p className="mt-4 text-muted-foreground">
            Each module is built out properly rather than sketched in. The money side does real
            amortization; the tasks side has boards, labels and subtasks.
          </p>
        </div>

        <div className="mt-12 grid gap-3 sm:grid-cols-3">
          {modules.map((m) => (
            <article
              key={m.title}
              className={`group flex flex-col rounded-2xl border border-border/50 bg-card/30 p-6 transition-colors hover:border-primary/30 ${m.span ?? ""}`}
            >
              <m.icon className="h-5 w-5 text-primary" />
              <h3 className="mt-4 font-semibold">{m.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{m.body}</p>
              {m.link && (
                <Link
                  to={m.link.to}
                  className="mt-4 inline-flex w-fit items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                >
                  {m.link.label}
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              )}
              {m.detail && (
                <p className="mt-auto pt-5 text-[11px] leading-relaxed text-muted-foreground/60">
                  {m.detail}
                </p>
              )}
            </article>
          ))}
        </div>
      </section>

      {/* ---------------- How it's built ---------------- */}
      <section id="built" className="mx-auto max-w-6xl scroll-mt-20 px-6 pb-20 sm:pb-28">
        <div className="grid gap-12 lg:grid-cols-[1fr_1.1fr]">
          <div>
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              The boring parts, done.
            </h2>
            <p className="mt-4 text-muted-foreground">
              A personal app that holds your finances only earns the trust if the unglamorous work
              is finished. This is what that meant here.
            </p>
            <Link
              to="/privacy"
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:underline"
            >
              Read what's stored and why
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>

          <dl className="space-y-px overflow-hidden rounded-2xl border border-border/50">
            {[
              {
                term: "Passwords",
                desc: "PBKDF2-SHA256 at 100k iterations. Nobody running this can read yours, including me.",
              },
              {
                term: "Sessions",
                desc: "Short-lived and genuinely revocable — signing out strands every token already issued, on every device.",
              },
              {
                term: "Your data",
                desc: "Scoped to your account at the query level, and never cached in the browser after you sign out.",
              },
              {
                term: "Offline",
                desc: "Installs to your home screen and keeps working on what you've already opened.",
              },
              {
                term: "Deleting",
                desc: "One button in settings erases the account and every row attached to it. No email, no wait.",
              },
            ].map((row) => (
              <div key={row.term} className="bg-card/30 px-6 py-5">
                <dt className="text-sm font-semibold">{row.term}</dt>
                <dd className="mt-1 text-sm leading-relaxed text-muted-foreground">{row.desc}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      {/* ---------------- Close ---------------- */}
      <section className="mx-auto max-w-6xl px-6 pb-24">
        <div className="relative overflow-hidden rounded-3xl border border-border/50 px-8 py-16 text-center sm:px-16">
          <div className="pointer-events-none absolute inset-0 grid-bg" aria-hidden="true" />
          <div className="relative">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Start with the one thing you keep forgetting.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
              Log a bill, jot a note, tick off tonight's checklist. The rest of it can move in
              whenever you feel like it.
            </p>
            <Link
              to={primaryCta.to}
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-7 py-3.5 font-semibold text-primary-foreground glow transition-transform hover:-translate-y-0.5"
            >
              {primaryCta.label}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      <footer className="border-t border-border/40">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-4 px-6 py-8 text-sm text-muted-foreground">
          <div className="flex items-center gap-2.5">
            <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/80">
              <Sparkles className="h-3 w-3 text-primary-foreground" />
            </div>
            <span>© {new Date().getFullYear()} MyX</span>
          </div>
          <div className="flex flex-wrap gap-6">
            <Link to="/emi-calculator" className="hover:text-foreground">
              EMI calculator
            </Link>
            <Link to="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link to="/login" className="hover:text-foreground">
              Sign in
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
