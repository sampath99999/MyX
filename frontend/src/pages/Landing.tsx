import { Link } from "react-router-dom";
import {
  Wallet,
  CheckCircle2,
  StickyNote,
  Brain,
  ListChecks,
  TrendingUp,
  ArrowRight,
  Check,
  Smartphone,
  ShieldCheck,
  WifiOff,
  IndianRupee,
  Sunrise,
  Sun,
  Moon,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import PublicHeader from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";
import HeroVisual from "@/components/landing/HeroVisual";
import Showcase from "@/components/landing/Showcase";
import Faq from "@/components/landing/Faq";
import {
  MotionProvider,
  Reveal,
  Stagger,
  WordReveal,
  m,
  useStillMotion,
} from "@/components/landing/motion";
import { cn } from "@/lib/utils";

/*
  Public marketing page — the only route a logged-out visitor (or a crawler) can
  reach. Prerendered to static HTML at build time (scripts/prerender.mjs), so
  every word here ships in the first response.

  The rewrite: the previous version led with a strip of engineering facts
  ("~100 kB of JavaScript", "137 tests", "0 trackers") and a section called
  "How it's built". Those are the things *I* am proud of. They are not what
  someone deciding whether to keep their salary and their bills in an app wants
  to read, and a page that opens with a bundle size tells a visitor they are not
  the audience. Every number and every heading below is now about the person
  reading it; the engineering is still there, phrased as what it buys them.
*/

/* ---------------------------------------------------------------- content */

const BENTO: {
  icon: typeof Wallet;
  title: string;
  body: string;
  span?: string;
  link?: { to: string; label: string };
  foot?: string;
}[] = [
  {
    icon: Wallet,
    title: "Money",
    span: "sm:col-span-2",
    body: "A running balance you can trust, budgets that warn you at the pace you are spending rather than after you have blown them, and bills that move their own due dates forward when you mark them paid.",
    foot: "Overview · Transactions · Bills · Budgets · Loans · Goals · Investments",
    link: { to: "/emi-calculator", label: "Try the free EMI calculator" },
  },
  {
    icon: CheckCircle2,
    title: "Tasks",
    span: "sm:row-span-2",
    body: "Spaces keep work and home apart. Inside them, projects run as a list or a board you drag things across.",
    foot: "“pay rent tomorrow !p1 #home” — read as you type",
  },
  {
    icon: StickyNote,
    title: "Notes",
    body: "Markdown with a live preview, notebooks, tags, and search that reaches every word.",
  },
  {
    icon: TrendingUp,
    title: "Investments",
    body: "Funds, stocks, FDs, gold and crypto. You set the value; the gain works itself out.",
  },
  {
    icon: ListChecks,
    title: "Checklists",
    body: "The routines you repeat. Resets each run, unlike a task you finish once.",
  },
  {
    /* Spans the last two columns so the bento closes cleanly. Without it the
       grid ends on an empty cell, which reads as a card that failed to load. */
    icon: Brain,
    title: "Memories",
    span: "sm:col-span-2",
    body: "The days worth keeping, with a date, a line about why, and tags to find them again years later. Not a diary you have to keep up with — just the ones you would be sad to lose.",
  },
];

/*
  The four things a person actually weighs. Deliberately not benchmarks: what
  replaced "~100 kB of JavaScript" is the reason anybody would care about it.
*/
const PROMISES: { icon: typeof IndianRupee; title: string; body: string }[] = [
  {
    icon: IndianRupee,
    title: "Free, with no upgrade page",
    body: "No trial, no seats, no premium tier holding your own numbers hostage. There is nothing here to buy.",
  },
  {
    icon: ShieldCheck,
    title: "Nothing watches you",
    body: "No analytics, no advertising pixels, no third-party scripts. Your salary and your bills are read by you and by nobody else.",
  },
  {
    icon: Smartphone,
    title: "On your phone in a tap",
    body: "Installs to your home screen from the browser — iPhone or Android — with no app store and nothing to update.",
  },
  {
    icon: WifiOff,
    title: "Keeps working offline",
    body: "In a lift, on the metro, out of signal: what you have already opened stays there and syncs when you are back.",
  },
];

/*
  A day, rather than a feature list. This is where the old "How it's built"
  section was, and it does the job that section was trying to do — make the app
  concrete — without asking the reader to care about hashing algorithms.
*/
const DAY: { icon: typeof Sunrise; time: string; title: string; body: string }[] = [
  {
    icon: Sunrise,
    time: "07:10",
    title: "Open it once",
    body: "Three things are due today and one bill is late. That is the whole morning briefing, and it took four seconds.",
  },
  {
    icon: Sun,
    time: "13:40",
    title: "₹680 on lunch",
    body: "Two taps from the phone's home screen. Dining is at 71% of its budget with eleven days to go — you see that immediately.",
  },
  {
    icon: Moon,
    time: "22:30",
    title: "Run the bedtime list",
    body: "Kitchen tidy, alarm set, tomorrow's clothes out. Ticked off, and reset ready for tomorrow night.",
  },
];

/* ---------------------------------------------------------------- section bits */

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-4 flex items-center gap-2.5 text-xs font-medium uppercase tracking-[0.14em] text-muted-foreground">
      <span className="h-px w-6 bg-border" />
      {children}
    </p>
  );
}

/** A card that lights up under the cursor. The pointer writes CSS variables the
 *  `.spotlight` rule reads — cheaper than re-rendering React on mousemove. */
function SpotlightCard({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      onPointerMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        e.currentTarget.style.setProperty("--mx", `${e.clientX - r.left}px`);
        e.currentTarget.style.setProperty("--my", `${e.clientY - r.top}px`);
      }}
      className={cn(
        "spotlight rounded-2xl border border-border bg-card/40 transition-colors hover:border-foreground/20",
        className,
      )}
    >
      {children}
    </div>
  );
}

/* ---------------------------------------------------------------- page */

const NAV_LINKS = [
  { href: "#modules", label: "What's inside" },
  { href: "#why", label: "Why MyX" },
  { href: "#faq", label: "Questions" },
];

export default function Landing() {
  const { user } = useAuth();
  const still = useStillMotion();

  /*
    An entrance, or nothing at all.

    These four sit above the fold and each one starts at `opacity: 0`, which
    means the first thing a visitor sees depends on an animation running. On a
    phone that turned out to be a real dependency rather than a theoretical one,
    so below `md` they render finished — no `initial`, nothing to wait for.
  */
  const enter = (
    initial: { opacity: number; y?: number },
    transition: { duration: number; delay?: number },
  ) =>
    still
      ? {}
      : { initial, animate: { opacity: 1, y: 0 }, transition };

  const primaryCta = user
    ? { to: "/dashboard", label: "Open your dashboard" }
    : { to: "/login?mode=register", label: "Create your account" };

  return (
    <MotionProvider>
      <div className="min-h-dvh overflow-x-hidden">
        <PublicHeader links={NAV_LINKS} />

        {/* ---------------- Hero ---------------- */}
        <section className="grain relative overflow-hidden">
          {/* Weather. Three drifting colour fields, a grid for structure. */}
          <div aria-hidden className="pointer-events-none absolute inset-0">
            <div
              className="aurora drift-a -left-[14%] -top-[38%] size-[40rem]"
              style={{ background: "color-mix(in oklab, var(--brand) 80%, transparent)" }}
            />
            <div
              className="aurora drift-b right-[-18%] top-[-30%] size-[36rem]"
              style={{ background: "oklch(0.62 0.16 220)" }}
            />
            <div
              className="aurora drift-c left-1/2 top-[8%] size-[32rem] -translate-x-1/2"
              style={{ background: "oklch(0.66 0.15 330)" }}
            />
            <div className="grid-bg absolute inset-0" />
          </div>

          <div className="relative mx-auto max-w-6xl px-5 pb-8 pt-24 sm:px-6 sm:pt-36">
            <div className="mx-auto max-w-3xl text-center">
              <m.p
                {...enter({ opacity: 0, y: 10 }, { duration: 0.5 })}
                /*
                  280px of a 335px content column on a 375px phone, which made
                  the first thing on the page a near-full-width grey bar sitting
                  on top of the headline. Smaller type and tighter padding on a
                  phone; the separators are hidden below sm, where three claims
                  on one line is one claim too many.
                */
                className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card/60 px-3 py-1 text-[0.6875rem] text-muted-foreground backdrop-blur sm:gap-2 sm:px-3.5 sm:py-1.5 sm:text-xs"
              >
                <span className="relative flex size-1.5">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-70" />
                  <span className="relative inline-flex size-1.5 rounded-full bg-emerald-400" />
                </span>
                Free forever<span className="hidden sm:inline"> · No ads</span> · Nothing tracks you
              </m.p>

              {/*
                44px on a phone put "Everything you keep" over two lines and the
                whole headline over four, 183px tall before the sub-heading
                started. The line break in the middle is deliberate typesetting,
                and a size that re-wraps each half of it defeats the point. 32px
                holds each phrase on one line down to 360px; below that it needs
                28px, which is what the extra step is for.
              */}
              <h1 className="mt-6 text-[1.75rem] font-semibold leading-[1.06] tracking-[-0.03em] min-[360px]:text-[2rem] sm:mt-7 sm:text-6xl sm:leading-[1.04] sm:tracking-[-0.035em] lg:text-7xl">
                <WordReveal text="Everything you keep" />
                <br />
                <WordReveal
                  text="meaning to organize."
                  wordClassName="text-gradient"
                  delay={0.22}
                />
              </h1>

              <m.p
                {...enter({ opacity: 0, y: 12 }, { duration: 0.6, delay: 0.55 })}
                className="mx-auto mt-6 max-w-xl text-base leading-relaxed text-muted-foreground sm:text-lg"
              >
                Your money, your to-dos, your notes and the days worth remembering — in one calm app
                instead of six. Free, private, and ready in about a minute.
              </m.p>

              <m.div
                {...enter({ opacity: 0, y: 12 }, { duration: 0.6, delay: 0.68 })}
                className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
              >
                <Link
                  to={primaryCta.to}
                  className="group inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-foreground px-7 text-[0.9375rem] font-medium text-background shadow-pop transition-transform hover:-translate-y-0.5 sm:h-[3.25rem] sm:w-auto"
                >
                  {primaryCta.label}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <a
                  href="#modules"
                  className="inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-card/50 px-7 text-[0.9375rem] font-medium backdrop-blur transition-colors hover:bg-card sm:h-[3.25rem] sm:w-auto"
                >
                  See what's inside
                </a>
              </m.div>

              <m.p
                {...enter({ opacity: 0 }, { duration: 0.6, delay: 0.85 })}
                className="mt-5 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 text-xs text-muted-foreground"
              >
                {["No card, ever", "Nothing to install", "Delete it all in one tap"].map((t) => (
                  <span key={t} className="inline-flex items-center gap-1.5">
                    <Check className="size-3 text-emerald-400" />
                    {t}
                  </span>
                ))}
              </m.p>
            </div>

            {/* The product, immediately. */}
            <div className="mt-16 sm:mt-20">
              <HeroVisual />
            </div>
          </div>
        </section>

        {/* ---------------- Showcase ---------------- */}
        <section id="modules" className="mx-auto max-w-6xl scroll-mt-24 px-5 py-20 sm:px-6 sm:py-28">
          <Reveal className="max-w-2xl">
            <SectionLabel>What's inside</SectionLabel>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-[2.5rem] sm:leading-[1.1]">
              Six apps' worth, sharing one account.
            </h2>
            <p className="mt-4 text-muted-foreground">
              Each part is built out properly rather than sketched in — real amortization on the
              money side, real boards and labels on the tasks side. Pick one and look around.
            </p>
          </Reveal>

          <div className="mt-12 sm:mt-16">
            <Showcase />
          </div>
        </section>

        {/* ---------------- Promises ---------------- */}
        <section id="why" className="relative scroll-mt-24 border-y border-border bg-card/25">
          <div className="mx-auto max-w-6xl px-5 py-20 sm:px-6 sm:py-28">
            <Reveal className="max-w-2xl">
              <SectionLabel>Why MyX</SectionLabel>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-[2.5rem] sm:leading-[1.1]">
                The quiet promises underneath.
              </h2>
              <p className="mt-4 text-muted-foreground">
                An app that holds your money only earns its place if the unglamorous parts are
                finished. These four are the ones you would notice if they were missing.
              </p>
            </Reveal>

            <Stagger className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {PROMISES.map((p) => (
                <Stagger.Item key={p.title}>
                  <SpotlightCard className="h-full p-6">
                    <span className="flex size-10 items-center justify-center rounded-xl border border-border bg-background">
                      <p.icon className="size-[1.15rem]" />
                    </span>
                    <h3 className="mt-5 text-[0.9375rem] font-semibold">{p.title}</h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
                  </SpotlightCard>
                </Stagger.Item>
              ))}
            </Stagger>
          </div>
        </section>

        {/* ---------------- A day with it ---------------- */}
        <section className="mx-auto max-w-6xl px-5 py-20 sm:px-6 sm:py-28">
          <div className="grid gap-12 lg:grid-cols-[minmax(0,24rem)_1fr] lg:gap-20">
            <Reveal>
              <SectionLabel>A day with it</SectionLabel>
              <h2 className="text-3xl font-semibold tracking-tight sm:text-[2.5rem] sm:leading-[1.1]">
                Four seconds in the morning. Two taps at lunch.
              </h2>
              <p className="mt-4 text-muted-foreground">
                MyX is not somewhere you spend time. It is somewhere you put things down so you can
                stop carrying them — and it is designed to get out of the way the moment you have.
              </p>
              <Link
                to={primaryCta.to}
                className="mt-7 inline-flex items-center gap-2 text-sm font-medium underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground"
              >
                {primaryCta.label}
                <ArrowRight className="size-3.5" />
              </Link>
            </Reveal>

            <Stagger className="relative" gap={0.12}>
              {/* The spine the moments hang off. */}
              <span
                aria-hidden
                className="absolute bottom-6 left-[1.4375rem] top-6 w-px bg-gradient-to-b from-transparent via-border to-transparent"
              />
              {DAY.map((d) => (
                <Stagger.Item key={d.time}>
                  <div className="relative flex gap-5 pb-8 last:pb-0">
                    <span className="relative z-10 flex size-12 shrink-0 items-center justify-center rounded-full border border-border bg-background">
                      <d.icon className="size-[1.15rem] text-muted-foreground" />
                    </span>
                    <div className="min-w-0 pt-1.5">
                      <p className="tnum text-xs font-medium text-muted-foreground">{d.time}</p>
                      <h3 className="mt-1 text-lg font-semibold tracking-tight">{d.title}</h3>
                      <p className="mt-1.5 max-w-md text-sm leading-relaxed text-muted-foreground">
                        {d.body}
                      </p>
                    </div>
                  </div>
                </Stagger.Item>
              ))}
            </Stagger>
          </div>
        </section>

        {/* ---------------- Bento ---------------- */}
        <section className="mx-auto max-w-6xl px-5 pb-20 sm:px-6 sm:pb-28">
          <Reveal className="max-w-2xl">
            <SectionLabel>All of it</SectionLabel>
            <h2 className="text-3xl font-semibold tracking-tight sm:text-[2.5rem] sm:leading-[1.1]">
              Everything MyX does, on one screen.
            </h2>
          </Reveal>

          <Stagger className="mt-10 grid gap-3 sm:grid-cols-3">
            {BENTO.map((b) => (
              <Stagger.Item key={b.title} className={b.span}>
                <SpotlightCard className="flex h-full flex-col p-6">
                  <b.icon className="size-5 text-muted-foreground" />
                  <h3 className="mt-4 font-semibold">{b.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{b.body}</p>
                  {b.link && (
                    <Link
                      to={b.link.to}
                      className="mt-4 inline-flex w-fit items-center gap-1.5 text-sm font-medium underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground"
                    >
                      {b.link.label}
                      <ArrowRight className="size-3.5" />
                    </Link>
                  )}
                  {b.foot && (
                    <p className="mt-auto pt-6 text-[11px] leading-relaxed text-muted-foreground/60">
                      {b.foot}
                    </p>
                  )}
                </SpotlightCard>
              </Stagger.Item>
            ))}
          </Stagger>
        </section>

        {/* ---------------- FAQ ---------------- */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-24 px-5 pb-20 sm:px-6 sm:pb-28">
          <Reveal className="text-center">
            <h2 className="text-3xl font-semibold tracking-tight sm:text-[2.5rem] sm:leading-[1.1]">
              Reasonable questions.
            </h2>
            <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
              Mostly about trust, which is the right thing to ask about an app you would hand your
              bank statement to.
            </p>
          </Reveal>
          <Reveal className="mt-10" delay={0.08}>
            <Faq />
          </Reveal>
        </section>

        {/* ---------------- Close ---------------- */}
        <section className="mx-auto max-w-6xl px-5 pb-24 sm:px-6">
          <Reveal>
            <div className="grain relative overflow-hidden rounded-3xl border border-border px-6 py-20 text-center sm:px-16">
              <div aria-hidden className="pointer-events-none absolute inset-0">
                <div
                  className="aurora drift-b left-1/2 top-[-40%] size-[36rem] -translate-x-1/2"
                  style={{ background: "color-mix(in oklab, var(--brand) 60%, transparent)" }}
                />
                <div className="grid-bg absolute inset-0" />
              </div>
              <div className="relative">
                <h2 className="mx-auto max-w-xl text-3xl font-semibold tracking-tight sm:text-[2.75rem] sm:leading-[1.08]">
                  Start with the one thing you keep forgetting.
                </h2>
                <p className="mx-auto mt-5 max-w-md text-muted-foreground">
                  Log a bill. Jot a note. Tick off tonight's list. The rest of your life can move in
                  whenever you feel like it.
                </p>
                <Link
                  to={primaryCta.to}
                  className="group mt-9 inline-flex items-center gap-2 rounded-xl bg-foreground px-8 py-4 text-[0.9375rem] font-medium text-background shadow-pop transition-transform hover:-translate-y-0.5"
                >
                  {primaryCta.label}
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </Link>
                <p className="mt-5 text-xs text-muted-foreground">
                  Takes about a minute. No card, and nothing to install.
                </p>
              </div>
            </div>
          </Reveal>
        </section>

        <PublicFooter />
      </div>
    </MotionProvider>
  );
}
