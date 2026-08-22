import { useEffect, useState } from "react";
import { AnimatePresence } from "motion/react";
import {
  Wallet,
  CheckCircle2,
  StickyNote,
  ListChecks,
  Check,
  TrendingUp,
  ArrowUpRight,
} from "lucide-react";
import { m, useStillMotion } from "@/components/landing/motion";
import { cn } from "@/lib/utils";

/*
  The panel beside the sign-in form.

  The old sign-in page had a marketing column here — the landing page's pitch,
  repeated, to people who had already read it and clicked anyway. This shows the
  thing they are signing in to instead: four small, real-looking slices of the
  app, cycling.

  Everything is DOM built from the product's own tokens, so it stays sharp,
  weighs nothing, and cannot drift out of date the way a screenshot folder does.
  Hidden below lg, where the form should have the whole screen.
*/

const CYCLE_MS = 4200;
const EASE = [0.22, 1, 0.36, 1] as const;

function Panel({ children }: { children: React.ReactNode }) {
  return <div className="space-y-2.5">{children}</div>;
}

function Row({
  icon: Icon,
  title,
  sub,
  right,
  tone,
  struck,
}: {
  icon?: React.ElementType;
  title: string;
  sub?: string;
  right?: React.ReactNode;
  tone?: "positive";
  struck?: boolean;
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/60 px-3 py-2.5">
      {Icon && (
        <span
          className={cn(
            "flex size-7 shrink-0 items-center justify-center rounded-md",
            tone === "positive"
              ? "bg-emerald-400/10 text-emerald-400"
              : "bg-secondary text-muted-foreground",
          )}
        >
          <Icon className="size-3.5" />
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-[13px] font-medium",
            struck && "text-muted-foreground line-through",
          )}
        >
          {title}
        </p>
        {sub && <p className="truncate text-[11px] text-muted-foreground">{sub}</p>}
      </div>
      {right}
    </div>
  );
}

const SLIDES = [
  {
    id: "money",
    icon: Wallet,
    label: "Money",
    caption: "Know where it went, without a spreadsheet.",
    body: (
      <Panel>
        <div className="rounded-lg border border-border bg-card/60 p-4">
          <p className="text-[10px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
            Current balance
          </p>
          <p className="tnum mt-1.5 text-2xl font-semibold tracking-tight">₹7,02,893</p>
          <p className="tnum mt-1.5 flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
            <TrendingUp className="size-3" />
            +₹1,33,389 this month
          </p>
          <div className="mt-4 flex h-14 items-end gap-2">
            {[64, 52, 71, 58, 76, 68].map((h, i) => (
              <div key={i} className="flex flex-1 items-end gap-[3px]">
                <m.div
                  className="w-1/2 rounded-t-sm bg-emerald-400/70"
                  initial={{ height: 0 }}
                  animate={{ height: `${h}%` }}
                  transition={{ duration: 0.5, delay: 0.1 + i * 0.05, ease: EASE }}
                />
                <m.div
                  className="w-1/2 rounded-t-sm bg-foreground/15"
                  initial={{ height: 0 }}
                  animate={{ height: `${h * 0.62}%` }}
                  transition={{ duration: 0.5, delay: 0.15 + i * 0.05, ease: EASE }}
                />
              </div>
            ))}
          </div>
        </div>
        <Row
          icon={ArrowUpRight}
          tone="positive"
          title="Salary"
          sub="Income · 1 Aug"
          right={<span className="tnum text-[13px] font-medium text-emerald-400">+₹1,85,000</span>}
        />
      </Panel>
    ),
  },
  {
    id: "tasks",
    icon: CheckCircle2,
    label: "Tasks",
    caption: "Work and home, finally not in the same list.",
    body: (
      <Panel>
        {[
          { t: "Finalise the migration plan", s: "Today · Q3 platform", done: false },
          { t: "Screen 6 shortlisted profiles", s: "Today · Hiring", done: false },
          { t: "Book the annual health check", s: "Health & fitness", done: true },
          { t: "Renew the car insurance", s: "In 4 days", done: false },
        ].map((task, i) => (
          <m.div
            key={task.t}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: 0.08 + i * 0.07 }}
          >
            <Row
              title={task.t}
              sub={task.s}
              struck={task.done}
              icon={undefined}
              right={
                <span
                  className={cn(
                    "flex size-[18px] shrink-0 items-center justify-center rounded-full border",
                    task.done
                      ? "border-foreground bg-foreground text-background"
                      : "border-muted-foreground/40",
                  )}
                >
                  {task.done && <Check className="size-3" />}
                </span>
              }
            />
          </m.div>
        ))}
      </Panel>
    ),
  },
  {
    id: "notes",
    icon: StickyNote,
    label: "Notes",
    caption: "The thoughts you would otherwise lose.",
    body: (
      <Panel>
        <div className="rounded-lg border border-border bg-card/60 p-4">
          <p className="text-[13px] font-semibold">Japan itinerary</p>
          <div className="mt-3 space-y-2">
            {["Tokyo — 4 nights, Shimokitazawa for records", "Kyoto — 3 nights, Fushimi Inari at sunrise", "Rail pass before landing, not after"].map(
              (line, i) => (
                <m.p
                  key={line}
                  className="text-[11px] leading-relaxed text-muted-foreground"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.4, delay: 0.1 + i * 0.12 }}
                >
                  {line}
                </m.p>
              ),
            )}
          </div>
          <div className="mt-3 flex gap-1.5 border-t border-border pt-3">
            {["travel", "japan"].map((t) => (
              <span
                key={t}
                className="rounded border border-border px-1.5 py-px text-[10px] text-muted-foreground"
              >
                {t}
              </span>
            ))}
          </div>
        </div>
      </Panel>
    ),
  },
  {
    id: "checklists",
    icon: ListChecks,
    label: "Checklists",
    caption: "For the things you do again and again.",
    body: (
      <Panel>
        <div className="rounded-lg border border-border bg-card/60 p-4">
          <div className="flex items-center gap-2.5">
            <span className="flex size-8 items-center justify-center rounded-lg bg-secondary text-base">
              🚪
            </span>
            <div>
              <p className="text-[13px] font-semibold">Leaving home</p>
              <p className="tnum text-[11px] text-muted-foreground">3 of 5 done</p>
            </div>
          </div>
          <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-foreground/10">
            <m.div
              className="h-full rounded-full bg-emerald-400"
              initial={{ width: 0 }}
              animate={{ width: "60%" }}
              transition={{ duration: 0.7, delay: 0.15, ease: EASE }}
            />
          </div>
          <div className="mt-3 space-y-2">
            {[
              { t: "Windows shut", d: true },
              { t: "Gas off", d: true },
              { t: "Lights off", d: true },
              { t: "Keys, wallet, phone", d: false },
              { t: "Lock the door", d: false },
            ].map((it, i) => (
              <m.div
                key={it.t}
                className="flex items-center gap-2.5"
                initial={{ opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.3, delay: 0.1 + i * 0.06 }}
              >
                <span
                  className={cn(
                    "flex size-4 items-center justify-center rounded border",
                    it.d ? "border-foreground bg-foreground text-background" : "border-input",
                  )}
                >
                  {it.d && <Check className="size-2.5" />}
                </span>
                <span
                  className={cn(
                    "text-[11px]",
                    it.d && "text-muted-foreground line-through",
                  )}
                >
                  {it.t}
                </span>
              </m.div>
            ))}
          </div>
        </div>
      </Panel>
    ),
  },
];

export default function AuthAside() {
  const [index, setIndex] = useState(0);
  const still = useStillMotion();

  useEffect(() => {
    if (still) return;
    const id = setInterval(() => setIndex((i) => (i + 1) % SLIDES.length), CYCLE_MS);
    return () => clearInterval(id);
  }, [still]);

  const slide = SLIDES[index];

  return (
    <div className="relative flex h-full flex-col justify-center overflow-hidden px-10 xl:px-16">
      {/* The same weather as the landing hero, so arriving here feels like the
          same building rather than a different site. */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div
          className="aurora drift-a left-[-10%] top-[-10%] size-[34rem]"
          style={{ background: "color-mix(in oklab, var(--brand) 75%, transparent)" }}
        />
        <div
          className="aurora drift-c bottom-[-15%] right-[-10%] size-[26rem]"
          style={{ background: "oklch(0.62 0.16 220)" }}
        />
        <div className="grid-bg absolute inset-0" />
      </div>

      <div className="relative mx-auto w-full max-w-sm">
        {/* Which module is on screen. A row of four, the active one filled — it
            doubles as the "why did that just change" explanation. */}
        <div className="mb-5 flex items-center gap-1.5">
          {SLIDES.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setIndex(i)}
              aria-label={s.label}
              aria-current={i === index}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors",
                i === index
                  ? "border-transparent bg-foreground text-background"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              <s.icon className="size-3" />
              {s.label}
            </button>
          ))}
        </div>

        {/*
          One slide at a time, with a fast exit.

          Cross-fading was tried and looks wrong here: the four panels are
          different shapes, so overlapping them superimposes a balance on an
          itinerary for a couple of hundred milliseconds and reads as a
          rendering fault. `mode="wait"` keeps them separate; the exit is
          deliberately much quicker than the entrance (0.15s out, 0.4s in) so
          the empty moment between them is too short to register as a gap.

          The height is fixed rather than min- so the form beside it never
          shifts when a taller slide arrives.
        */}
        <div className="h-[19rem]">
          <AnimatePresence mode="wait" initial={false}>
            <m.div
              key={slide.id}
              initial={still ? false : { opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0, transition: { duration: 0.4, ease: EASE } }}
              exit={still ? undefined : { opacity: 0, transition: { duration: 0.15 } }}
            >
              {slide.body}
            </m.div>
          </AnimatePresence>
        </div>

        <div className="h-14 border-t border-border pt-5">
          <AnimatePresence mode="wait" initial={false}>
            <m.p
              key={`${slide.id}-caption`}
              className="text-sm leading-relaxed text-muted-foreground"
              initial={still ? false : { opacity: 0 }}
              animate={{ opacity: 1, transition: { duration: 0.35 } }}
              exit={still ? undefined : { opacity: 0, transition: { duration: 0.15 } }}
            >
              {slide.caption}
            </m.p>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
