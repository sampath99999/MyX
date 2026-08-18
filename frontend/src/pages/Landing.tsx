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
  ShieldCheck,
  Zap,
  Smartphone,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

/*
  Public marketing page — the only route a logged-out visitor (or a crawler) can
  reach. It is prerendered to static HTML at build time (scripts/prerender.mjs),
  so search engines get the full copy without executing any JavaScript.
*/

const modules = [
  {
    icon: Wallet,
    title: "Money",
    body: "Income, expenses and a running balance in one place. Budgets per category, bills and subscriptions that roll their own due dates forward, and EMI loans amortized to the paise.",
  },
  {
    icon: CheckCircle2,
    title: "Tasks",
    body: "Spaces keep work and personal apart. Projects as a list or a drag-and-drop board, with Today, Upcoming and Inbox views, labels, subtasks and natural-language quick add.",
  },
  {
    icon: StickyNote,
    title: "Notes",
    body: "Notebooks, tags and pinning, a markdown editor with live preview and autosave, and full-text search across everything you have ever written down.",
  },
  {
    icon: PiggyBank,
    title: "Goals and investments",
    body: "Savings goals with progress you can watch fill up, and a manual portfolio of stocks, mutual funds, FDs, gold and crypto with derived gain and loss.",
  },
  {
    icon: ListChecks,
    title: "Checklists",
    body: "Reusable routines you tick off again and again: morning routine, leaving home, travel packing. A checklist resets each run instead of being completed once.",
  },
  {
    icon: Brain,
    title: "Memories",
    body: "A lightweight place for the moments worth keeping, with dates, tags and a mood, so the year does not disappear into a camera roll.",
  },
];

const pillars = [
  {
    icon: ShieldCheck,
    title: "Private by construction",
    body: "Your data is scoped to your account and never sold, shared or mined. Passwords are hashed with PBKDF2, sessions can be revoked, and nothing is left in your browser cache after you sign out.",
  },
  {
    icon: Zap,
    title: "Fast on purpose",
    body: "Served from Cloudflare's edge with route-level code splitting, so the app opens in about 100 kB of JavaScript no matter how much you have stored in it.",
  },
  {
    icon: Smartphone,
    title: "Installs like an app",
    body: "Add MyX to your home screen on Android or iOS and it launches full screen, works offline for what you have already opened, and keeps a bottom tab bar for one-handed use.",
  },
];

export default function Landing() {
  const { user } = useAuth();

  const primaryCta = user
    ? { to: "/dashboard", label: "Open your dashboard" }
    : { to: "/login?mode=register", label: "Get started free" };

  return (
    <div className="min-h-dvh">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-2.5">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary glow">
            <Sparkles className="h-[1.15rem] w-[1.15rem] text-primary-foreground" />
          </div>
          <span className="text-lg font-bold tracking-tight">MyX</span>
        </div>
        <nav className="flex items-center gap-2 text-sm">
          <a
            href="#modules"
            className="hidden px-3 py-2 text-muted-foreground hover:text-foreground sm:block"
          >
            Modules
          </a>
          <a
            href="#why"
            className="hidden px-3 py-2 text-muted-foreground hover:text-foreground sm:block"
          >
            Why MyX
          </a>
          <Link
            to={user ? "/dashboard" : "/login"}
            className="rounded-lg border border-border/60 px-4 py-2 font-medium transition-colors hover:bg-accent"
          >
            {user ? "Open app" : "Sign in"}
          </Link>
        </nav>
      </header>

      <main className="mx-auto max-w-6xl px-6">
        <section className="py-16 sm:py-24">
          <div className="max-w-3xl animate-in-up">
            <p className="text-sm font-semibold uppercase tracking-widest text-primary">
              Personal life manager
            </p>
            <h1 className="mt-4 text-4xl font-extrabold leading-[1.08] tracking-tight text-gradient sm:text-6xl">
              Your whole life, in one place.
            </h1>
            <p className="mt-6 max-w-2xl text-lg leading-relaxed text-muted-foreground">
              Money, tasks, notes, memories and daily checklists, private and fast. One app instead
              of six, with no ads, no trackers and nothing to sell you.
            </p>
            <div className="mt-10 flex flex-wrap items-center gap-3">
              <Link
                to={primaryCta.to}
                className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 font-semibold text-primary-foreground glow transition-transform hover:-translate-y-0.5"
              >
                {primaryCta.label}
                <ArrowRight className="h-4 w-4" />
              </Link>
              <a
                href="#modules"
                className="rounded-xl border border-border/60 px-6 py-3 font-medium transition-colors hover:bg-accent"
              >
                See what is inside
              </a>
            </div>
            <p className="mt-4 text-sm text-muted-foreground">
              Free to use · No credit card · Works offline
            </p>
          </div>
        </section>

        <section id="modules" className="scroll-mt-8 py-12 sm:py-16">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Six things you were using six apps for
          </h2>
          <p className="mt-4 max-w-2xl text-muted-foreground">
            Every module shares one account, one search and one dashboard, so nothing lives in a
            silo you forget to open.
          </p>
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {modules.map((m) => (
              <article key={m.title} className="glass rounded-2xl p-6">
                <m.icon className="h-6 w-6 text-primary" />
                <h3 className="mt-4 text-lg font-semibold">{m.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{m.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="why" className="scroll-mt-8 py-12 sm:py-16">
          <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
            Built the way you would build it
          </h2>
          <div className="mt-10 grid gap-4 md:grid-cols-3">
            {pillars.map((p) => (
              <article key={p.title} className="rounded-2xl border border-border/60 p-6">
                <p.icon className="h-6 w-6 text-primary" />
                <h3 className="mt-4 text-lg font-semibold">{p.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="py-16 sm:py-24">
          <div className="glass rounded-3xl p-10 text-center sm:p-16">
            <h2 className="text-3xl font-bold tracking-tight sm:text-4xl">
              Start with one thing you keep forgetting.
            </h2>
            <p className="mx-auto mt-4 max-w-xl text-muted-foreground">
              Log a bill, jot a note, tick off tonight's checklist. The rest of your life can move in
              whenever you are ready.
            </p>
            <Link
              to={primaryCta.to}
              className="mt-8 inline-flex items-center gap-2 rounded-xl bg-primary px-7 py-3.5 font-semibold text-primary-foreground glow transition-transform hover:-translate-y-0.5"
            >
              {user ? "Open your dashboard" : "Create your account"}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <footer className="mx-auto max-w-6xl px-6 py-10 text-sm text-muted-foreground">
        <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border/50 pt-8">
          <span>© {new Date().getFullYear()} MyX · Built on Cloudflare</span>
          <div className="flex gap-5">
            <Link to="/privacy" className="hover:text-foreground">
              Privacy
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
