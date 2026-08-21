import { useEffect, useRef, useState } from "react";
import { AnimatePresence, useInView } from "motion/react";
import {
  Wallet,
  CheckCircle2,
  StickyNote,
  ListChecks,
  Brain,
  ArrowUpRight,
  ArrowDownLeft,
  Check,
  Search,
  CalendarClock,
} from "lucide-react";
import { m, useReducedMotion } from "@/components/landing/motion";
import { cn } from "@/lib/utils";

/*
  The centrepiece of the page: five modules, one at a time, cycling.

  A marketing page can either describe an app or show it. Six paragraphs about
  what MyX does were doing the first; this does the second, with a real (if
  hand-built) panel per module. The panels are DOM rather than screenshots so
  they stay sharp at any density, weigh a few hundred bytes each instead of a
  few hundred kilobytes, and inherit the product's real design tokens — which
  means they cannot quietly drift out of date the way a screenshot folder does.

  It advances on a timer, but the timer only runs while the section is actually
  on screen and stops for good the moment someone picks a tab themselves. An
  auto-rotating panel that keeps yanking itself away from the thing you were
  reading is the most common way this pattern is got wrong.
*/

const CYCLE_MS = 5200;

interface Module {
  id: string;
  icon: typeof Wallet;
  name: string;
  headline: string;
  body: string;
  points: string[];
  panel: React.ReactNode;
}

/* ---------------------------------------------------------------- panels */

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center gap-2 border-b border-border px-4 py-2.5">
        <span className="size-2 rounded-full bg-rose-400/60" />
        <span className="size-2 rounded-full bg-amber-400/60" />
        <span className="size-2 rounded-full bg-emerald-400/60" />
        <span className="ml-2 truncate text-[11px] text-muted-foreground">{title}</span>
      </div>
      <div className="min-h-0 flex-1 p-4 sm:p-5">{children}</div>
    </div>
  );
}

function MoneyPanel() {
  const months = [64, 52, 71, 58, 76, 68];
  const spend = [41, 47, 38, 52, 44, 39];
  return (
    <Panel title="myx.app/money">
      {/* Three tiles across a 320px phone leaves 86px each, which truncates
          "₹7,02,893" to "₹7,0…". Two up, wrapping, until there is room. */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {[
          { label: "Balance", value: "₹7,02,893" },
          { label: "Spent in Aug", value: "₹69,611" },
          { label: "Saved", value: "66%" },
        ].map((k) => (
          <div key={k.label} className="rounded-lg border border-border px-3 py-2.5">
            <p className="truncate text-[10px] text-muted-foreground">{k.label}</p>
            <p className="tnum mt-1 truncate text-sm font-semibold">{k.value}</p>
          </div>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-border p-4">
        <div className="flex items-baseline justify-between">
          <span className="text-xs font-medium">Cash flow</span>
          <span className="text-[11px] text-muted-foreground">last 6 months</span>
        </div>
        <div className="mt-4 flex h-24 items-end gap-2.5">
          {months.map((income, i) => (
            <div key={i} className="flex flex-1 flex-col items-center gap-1.5">
              <div className="flex h-20 w-full items-end justify-center gap-[3px]">
                <m.div
                  className="w-1/2 rounded-t-sm bg-emerald-400/70"
                  initial={{ height: 0 }}
                  animate={{ height: `${income}%` }}
                  transition={{ duration: 0.6, delay: 0.1 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                />
                <m.div
                  className="w-1/2 rounded-t-sm bg-foreground/20"
                  initial={{ height: 0 }}
                  animate={{ height: `${spend[i]}%` }}
                  transition={{ duration: 0.6, delay: 0.16 + i * 0.05, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
              <span className="text-[10px] text-muted-foreground">
                {["Mar", "Apr", "May", "Jun", "Jul", "Aug"][i]}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3 space-y-px">
        {[
          { name: "Salary", sub: "Income · 1 Aug", amount: "+₹1,85,000", credit: true },
          { name: "Rent", sub: "Housing · 1 Aug", amount: "−₹32,000" },
          { name: "Weekly run — DMart", sub: "Groceries · 19 Aug", amount: "−₹1,240" },
        ].map((t) => (
          <div key={t.name} className="flex items-center gap-3 rounded-md px-1 py-2">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-md",
                t.credit ? "bg-emerald-400/10 text-emerald-400" : "bg-secondary text-muted-foreground",
              )}
            >
              {t.credit ? (
                <ArrowUpRight className="size-3.5" />
              ) : (
                <ArrowDownLeft className="size-3.5" />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-xs font-medium">{t.name}</p>
              <p className="text-[10px] text-muted-foreground">{t.sub}</p>
            </div>
            <span
              className={cn(
                "tnum text-xs font-medium",
                t.credit ? "text-emerald-400" : "text-foreground",
              )}
            >
              {t.amount}
            </span>
          </div>
        ))}
      </div>
    </Panel>
  );
}

function TasksPanel() {
  const columns = [
    { name: "To do", cards: ["Finalise the migration plan", "Pick tiles for the balcony"] },
    { name: "Doing", cards: ["Screen 6 shortlisted profiles"] },
    { name: "Done", cards: ["Book the health check", "5k run — Sunday"] },
  ];
  return (
    <Panel title="myx.app/tasks">
      {/* Three columns will not fit in 335px of phone without the cards
          becoming two words per line. Below sm the board scrolls sideways,
          which is also what the real board does. */}
      <div className="-mx-1 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <div className="grid min-w-[22rem] grid-cols-3 gap-2.5">
        {columns.map((col, ci) => (
          <div key={col.name} className="rounded-lg border border-border bg-secondary/30 p-2">
            <div className="flex items-center justify-between px-1 pb-2">
              <span className="text-[11px] font-medium">{col.name}</span>
              <span className="tnum text-[10px] text-muted-foreground">{col.cards.length}</span>
            </div>
            <div className="space-y-1.5">
              {col.cards.map((card, i) => (
                <m.div
                  key={card}
                  className="rounded-md border border-border bg-card p-2"
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.4, delay: 0.15 + ci * 0.08 + i * 0.06 }}
                >
                  <p className={cn("text-[11px] leading-snug", ci === 2 && "text-muted-foreground line-through")}>
                    {card}
                  </p>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span
                      className={cn(
                        "size-1.5 rounded-full",
                        ci === 0 ? "bg-rose-400" : ci === 1 ? "bg-amber-400" : "bg-emerald-400",
                      )}
                    />
                    <span className="text-[9px] text-muted-foreground">
                      {ci === 2 ? "done" : ci === 0 ? "today" : "in progress"}
                    </span>
                  </div>
                </m.div>
              ))}
            </div>
          </div>
        ))}
        </div>
      </div>

      <div className="mt-4 rounded-lg border border-border p-3">
        <p className="text-[11px] text-muted-foreground">Quick add</p>
        <p className="mt-1.5 font-mono text-xs">
          pay rent tomorrow{" "}
          <span className="rounded bg-rose-400/10 px-1 text-rose-400">!p1</span>{" "}
          <span className="rounded bg-sky-400/10 px-1 text-sky-400">#home</span>
        </p>
        <div className="mt-2.5 flex flex-wrap items-center gap-1.5 border-t border-border pt-2.5 text-[10px]">
          {["Tomorrow", "Priority 1", "Label: home"].map((chip) => (
            <span key={chip} className="rounded-full border border-border px-2 py-0.5 text-muted-foreground">
              {chip}
            </span>
          ))}
        </div>
      </div>
    </Panel>
  );
}

function NotesPanel() {
  return (
    <Panel title="myx.app/notes">
      <div className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5">
        <Search className="size-3 text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground">Search every note…</span>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2.5">
        {[
          { title: "Japan itinerary", body: "Tokyo 4 nights · Kyoto 3 · book teamLab ahead", tag: "travel", h: "h-24" },
          { title: "Architecture decisions", body: "Why D1 over Postgres, and what we gave up", tag: "work", h: "h-28" },
          { title: "Books — 2026", body: "Finished: Thinking in Systems. Next: Shape Up.", tag: "reading", h: "h-20" },
          { title: "Quick capture", body: "A weekly review ritual inside MyX", tag: "inbox", h: "h-24" },
        ].map((n, i) => (
          <m.div
            key={n.title}
            className={cn("rounded-lg border border-border bg-card p-3", n.h)}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.12 + i * 0.07 }}
          >
            <p className="truncate text-xs font-medium">{n.title}</p>
            <p className="mt-1 line-clamp-2 text-[10px] leading-relaxed text-muted-foreground">
              {n.body}
            </p>
            <span className="mt-2 inline-block rounded border border-border px-1.5 py-px text-[9px] text-muted-foreground">
              {n.tag}
            </span>
          </m.div>
        ))}
      </div>
    </Panel>
  );
}

function ChecklistsPanel() {
  const items = [
    { text: "Windows shut", done: true },
    { text: "Gas off", done: true },
    { text: "Lights off", done: true },
    { text: "Keys, wallet, phone", done: false },
    { text: "Lock the door", done: false },
  ];
  return (
    <Panel title="myx.app/checklists">
      <div className="flex items-center gap-3">
        <span className="flex size-10 items-center justify-center rounded-lg bg-secondary text-lg">
          🚪
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold">Leaving home</p>
          <p className="tnum text-[11px] text-muted-foreground">3 of 5 done</p>
        </div>
      </div>

      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
        <m.div
          className="h-full rounded-full bg-emerald-400"
          initial={{ width: 0 }}
          animate={{ width: "60%" }}
          transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>

      <div className="mt-4 space-y-1">
        {items.map((it, i) => (
          <m.div
            key={it.text}
            className="flex items-center gap-2.5 rounded-md px-1 py-2"
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.35, delay: 0.15 + i * 0.06 }}
          >
            <span
              className={cn(
                "flex size-4 items-center justify-center rounded border",
                it.done ? "border-foreground bg-foreground text-background" : "border-input",
              )}
            >
              {it.done && <Check className="size-2.5" />}
            </span>
            <span
              className={cn("text-xs", it.done && "text-muted-foreground line-through")}
            >
              {it.text}
            </span>
          </m.div>
        ))}
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-lg border border-border px-3 py-2.5">
        <CalendarClock className="size-3.5 shrink-0 text-muted-foreground" />
        <p className="text-[11px] leading-snug text-muted-foreground">
          Ticks reset next time you run it — unlike a task, which is done once.
        </p>
      </div>
    </Panel>
  );
}

function MemoriesPanel() {
  return (
    <Panel title="myx.app/memories">
      <div className="space-y-2.5">
        {[
          { emoji: "🚢", title: "Shipped MyX v1", date: "20 Jul 2026", note: "Eight weekends of evenings. It finally does the thing.", tags: ["work", "milestone"] },
          { emoji: "🎂", title: "Amma's 60th", date: "16 May 2026", note: "Everyone came home. The old house was loud again.", tags: ["family"] },
          { emoji: "🌊", title: "Goa, no plan", date: "20 Jan 2026", note: "Four days, one bag, zero itinerary.", tags: ["travel"] },
        ].map((mem, i) => (
          <m.div
            key={mem.title}
            className="flex gap-3 rounded-lg border border-border bg-card p-3"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.12 + i * 0.08 }}
          >
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-secondary text-base">
              {mem.emoji}
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline justify-between gap-2">
                <p className="truncate text-xs font-medium">{mem.title}</p>
                <span className="shrink-0 text-[10px] text-muted-foreground">{mem.date}</span>
              </div>
              <p className="mt-1 text-[10px] leading-relaxed text-muted-foreground">{mem.note}</p>
              <div className="mt-1.5 flex gap-1">
                {mem.tags.map((t) => (
                  <span
                    key={t}
                    className="rounded border border-border px-1.5 py-px text-[9px] text-muted-foreground"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </m.div>
        ))}
      </div>
    </Panel>
  );
}

/* ---------------------------------------------------------------- content */

const MODULES: Module[] = [
  {
    id: "money",
    icon: Wallet,
    name: "Money",
    headline: "Know where it went, without a spreadsheet.",
    body: "A running balance, budgets that warn you before you cross them, and bills that roll their own due dates forward when you mark them paid.",
    points: ["Budgets that flag the pace, not just the total", "EMI loans on real reducing-balance maths", "Import a bank statement in one go"],
    panel: <MoneyPanel />,
  },
  {
    id: "tasks",
    icon: CheckCircle2,
    name: "Tasks",
    headline: "Work and home, finally not in the same list.",
    body: "Spaces keep them apart. Inside each one, projects run as a simple list or a board you drag things across — whichever suits the work.",
    points: ["Type the date, priority and label in one line", "Today, Upcoming and an Inbox for the rest", "Subtasks, labels and a board view"],
    panel: <TasksPanel />,
  },
  {
    id: "notes",
    icon: StickyNote,
    name: "Notes",
    headline: "The thoughts you would otherwise lose.",
    body: "Markdown with a live preview, notebooks and tags to sort them later, and search that reaches every word you have written.",
    points: ["Autosaves as you type", "Notebooks, tags and pinning", "Full-text search across everything"],
    panel: <NotesPanel />,
  },
  {
    id: "checklists",
    icon: ListChecks,
    name: "Checklists",
    headline: "For the things you do again and again.",
    body: "Leaving home, packing, the bedtime round. A checklist resets every time you run it, so it is never something you have to rebuild.",
    points: ["Reusable — it resets, it does not disappear", "One tap per item, on your phone", "Live on the dashboard, ready to tick"],
    panel: <ChecklistsPanel />,
  },
  {
    id: "memories",
    icon: Brain,
    name: "Memories",
    headline: "A place for the days worth keeping.",
    body: "Not a diary you have to fill in every night. Just the moments you would be sad to forget, with a date and a line about why.",
    points: ["A date, a note and tags", "Search back through your own years", "Yours alone — never analysed, never shared"],
    panel: <MemoriesPanel />,
  },
];

/* ---------------------------------------------------------------- section */

export default function Showcase() {
  const [active, setActive] = useState(0);
  const [pinned, setPinned] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const onScreen = useInView(ref, { amount: 0.35 });
  const still = useReducedMotion();

  /*
    The timer only exists while the section is visible and nobody has taken
    over. `pinned` is one-way on purpose — once you have expressed a preference
    the carousel should never take the wheel back.
  */
  useEffect(() => {
    if (pinned || !onScreen || still) return;
    const id = setInterval(() => setActive((i) => (i + 1) % MODULES.length), CYCLE_MS);
    return () => clearInterval(id);
  }, [pinned, onScreen, still]);

  const current = MODULES[active];

  return (
    <div ref={ref} className="grid items-start gap-8 lg:grid-cols-[minmax(0,26rem)_1fr] lg:gap-14">
      {/* ---- the list of modules ---- */}
      <div>
        <div className="flex flex-col gap-1">
          {MODULES.map((mod, i) => {
            const isActive = i === active;
            return (
              <button
                key={mod.id}
                onClick={() => {
                  setActive(i);
                  setPinned(true);
                }}
                aria-current={isActive}
                className={cn(
                  "group relative overflow-hidden rounded-xl border px-4 py-3.5 text-left transition-colors",
                  isActive
                    ? "border-border bg-card"
                    : "border-transparent hover:bg-card/50",
                )}
              >
                <div className="flex items-center gap-3">
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors",
                      isActive ? "bg-foreground text-background" : "bg-secondary text-muted-foreground",
                    )}
                  >
                    <mod.icon className="size-4" />
                  </span>
                  <span
                    className={cn(
                      "text-sm font-medium transition-colors",
                      isActive ? "text-foreground" : "text-muted-foreground",
                    )}
                  >
                    {mod.name}
                  </span>
                </div>

                <AnimatePresence initial={false}>
                  {isActive && (
                    <m.div
                      key="body"
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                      className="overflow-hidden"
                    >
                      <p className="pt-3 text-sm leading-relaxed text-muted-foreground">
                        {mod.body}
                      </p>
                      <ul className="mt-3 space-y-1.5">
                        {mod.points.map((p) => (
                          <li key={p} className="flex gap-2 text-xs text-muted-foreground">
                            <Check className="mt-0.5 size-3 shrink-0 text-emerald-400" />
                            {p}
                          </li>
                        ))}
                      </ul>
                    </m.div>
                  )}
                </AnimatePresence>

                {/*
                  The progress bar doubles as the "why did that just change"
                  explanation — without it an auto-advancing panel reads as a
                  glitch. It disappears once the user takes over.
                */}
                {isActive && !pinned && !still && (
                  <m.span
                    key={`bar-${active}`}
                    className="absolute inset-x-0 bottom-0 h-px origin-left bg-foreground/40"
                    initial={{ scaleX: 0 }}
                    animate={{ scaleX: 1 }}
                    transition={{ duration: CYCLE_MS / 1000, ease: "linear" }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* ---- the panel ---- */}
      <div className="relative">
        <div className="edge-lit relative min-h-[26rem] overflow-hidden rounded-2xl border border-border bg-card/80 shadow-pop sm:min-h-[30rem]">
          <AnimatePresence mode="wait">
            <m.div
              key={current.id}
              initial={still ? false : { opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={still ? undefined : { opacity: 0, y: -12 }}
              transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
              className="h-full"
            >
              {current.panel}
            </m.div>
          </AnimatePresence>
        </div>

        <p className="mt-4 text-center text-sm text-muted-foreground lg:text-left">
          {current.headline}
        </p>
      </div>
    </div>
  );
}
