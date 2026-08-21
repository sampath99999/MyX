import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Search, CornerDownLeft, Settings, LogOut } from "lucide-react";
import { NAV_ITEMS, type NavItem, type NavSection } from "@/components/navigation";
import { useAppPulse, type AppPulse } from "@/lib/useAppPulse";
import ThemeToggle from "@/components/ThemeToggle";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

/*
  Navigation as a moment, not as furniture.

  Every version of this app's navigation so far has been a list that is always
  on screen: a 240px rail down the left, then a tab bar across the bottom of
  the phone, then modules across the top. They differ in orientation and in
  nothing else. All three charge the same rent — a permanent slice of a screen,
  every screen, for something used a handful of times an hour — and all three
  can only show one level, which is why each module ended up drawing a second
  strip of tabs underneath.

  So: nothing persistent. The header says where you are and gets out of the
  way. Press G, or tap the mark, and the whole window becomes the menu for as
  long as it takes to choose.

  Three things fall out of that, and they are the reasons it is worth doing:

  Room. A card can say "₹7,02,893, ₹12,400 spent this month, rent due Friday"
  where a 240px rail could only ever say "Money". The menu answers the question
  you opened it to ask, instead of routing you somewhere to find out.

  Both levels at once. Money's seven screens are chips on Money's card. Getting
  from Budgets to Investments is one gesture and one click, not a read of two
  different bars.

  One surface. The same overlay is the navigation on a 1440px monitor and on a
  320px phone — no drawer to keep in sync with a rail, no tab bar holding six
  items in five slots.

  The cost is honest: switching modules is one keystroke more than a rail. It
  is paid back by the keyboard path being genuinely fast — G, then a number —
  and by every screen being full width the rest of the time.
*/

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

function dueLabel(iso: string) {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "due today";
  if (days === 1) return "due tomorrow";
  return `due in ${days} days`;
}

/** The live line under a module's name. Absent rather than invented. */
function statFor(item: NavItem, pulse: AppPulse | null): string | null {
  if (!pulse) return null;
  switch (item.to) {
    case "/money":
      return `₹${inr(pulse.balance)} · ₹${inr(pulse.monthSpend)} spent this month`;
    case "/tasks":
      return pulse.dueToday
        ? `${pulse.dueToday} due today · ${pulse.openTasks} open`
        : `${pulse.openTasks} open, nothing due today`;
    case "/notes":
      return pulse.notes === 1 ? "1 note" : `${pulse.notes} notes`;
    case "/checklists":
      return pulse.checklists === 1 ? "1 list" : `${pulse.checklists} lists`;
    default:
      return null;
  }
}

/** The one-line description shown when there is no number to show. */
const BLURB: Record<string, string> = {
  "/dashboard": "Today, at a glance",
  "/memories": "The days worth keeping",
};

interface Target {
  to: string;
  label: string;
  /** The module this belongs to, for grouping while filtering. */
  parent?: string;
}

export default function Launcher({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
}) {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { logout } = useAuth();
  const pulse = useAppPulse();
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  // A fresh query every time. Reopening onto the last search is a small
  // betrayal — the overlay is meant to be a blank slate you throw a word at.
  useEffect(() => {
    if (open) {
      setQuery("");
      setCursor(0);
    }
  }, [open]);

  /*
    Everything reachable, flattened. Modules and their screens are searched
    together on purpose: "budgets" is a place, and making someone find Money
    first in order to reach it is the two-level problem all over again.
  */
  const targets = useMemo<Target[]>(() => {
    const list: Target[] = [];
    for (const item of NAV_ITEMS) {
      list.push({ to: item.to, label: item.label });
      for (const s of item.sections ?? []) {
        if (s.to !== item.to) list.push({ to: s.to, label: s.label, parent: item.label });
      }
    }
    list.push({ to: "/settings", label: "Settings" });
    return list;
  }, []);

  const q = query.trim().toLowerCase();
  const matches = useMemo(
    () =>
      q
        ? targets.filter(
            (t) =>
              t.label.toLowerCase().includes(q) ||
              (t.parent ?? "").toLowerCase().includes(q),
          )
        : [],
    [q, targets],
  );

  const goTo = (to: string) => {
    onOpenChange(false);
    navigate(to);
  };

  function onKeyDown(e: React.KeyboardEvent) {
    if (q) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => (c + 1) % Math.max(matches.length, 1));
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => (c - 1 + matches.length) % Math.max(matches.length, 1));
      } else if (e.key === "Enter" && matches[cursor]) {
        e.preventDefault();
        goTo(matches[cursor].to);
      }
      return;
    }

    /*
      Unfiltered, the digits are the fast path: G then 2 is Money, and it is
      the same two keystrokes every time regardless of what is on screen. The
      numbers are printed on the cards rather than left to be discovered.
    */
    const n = Number(e.key);
    if (n >= 1 && n <= NAV_ITEMS.length) {
      e.preventDefault();
      goTo(NAV_ITEMS[n - 1].to);
    }
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[80] bg-background/80 backdrop-blur-md data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(e) => {
            e.preventDefault();
            inputRef.current?.focus();
          }}
          className={cn(
            "fixed inset-0 z-[80] flex flex-col items-center overflow-y-auto px-4 py-8 sm:px-6 sm:py-14",
            "data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=open]:zoom-in-95 data-[state=closed]:zoom-out-95 duration-150",
          )}
          onKeyDown={onKeyDown}
        >
          <DialogPrimitive.Title className="sr-only">Go to</DialogPrimitive.Title>

          <div className="w-full max-w-4xl">
            {/* ---------- Type to filter ---------- */}
            <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 shadow-pop">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setCursor(0);
                }}
                placeholder="Where to?"
                aria-label="Filter destinations"
                className="h-14 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground/60"
              />
              <kbd className="hidden shrink-0 rounded border border-border px-1.5 py-0.5 font-sans text-[10px] text-muted-foreground sm:block">
                Esc
              </kbd>
            </div>

            {q ? (
              /* ---------- Filtered list ---------- */
              <div className="mt-3 overflow-hidden rounded-xl border border-border bg-card shadow-pop">
                {matches.length === 0 ? (
                  <p className="px-4 py-6 text-sm text-muted-foreground">
                    Nothing called “{query}”. Press Escape, then ⌘K to search your actual
                    transactions, notes and tasks.
                  </p>
                ) : (
                  matches.map((m, i) => (
                    <button
                      key={m.to}
                      onClick={() => goTo(m.to)}
                      onMouseEnter={() => setCursor(i)}
                      className={cn(
                        "flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                        i === cursor ? "bg-accent" : "hover:bg-accent/60",
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate text-sm font-medium">
                        {m.parent && (
                          <span className="text-muted-foreground">{m.parent} › </span>
                        )}
                        {m.label}
                      </span>
                      {i === cursor && (
                        <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" />
                      )}
                    </button>
                  ))
                )}
              </div>
            ) : (
              /* ---------- The modules, as cards ---------- */
              <>
                <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-3">
                  {NAV_ITEMS.map((item, i) => {
                    const active = item.end
                      ? pathname === item.to
                      : pathname.startsWith(item.to);
                    const stat = statFor(item, pulse);
                    return (
                      <ModuleCard
                        key={item.to}
                        item={item}
                        index={i + 1}
                        active={active}
                        stat={stat}
                        onGo={goTo}
                      />
                    );
                  })}
                </div>

                {/* What is actually waiting, if anything is. */}
                {pulse?.nextBill && (
                  <button
                    onClick={() => goTo("/money/recurring")}
                    className="mt-3 flex w-full items-center gap-2.5 rounded-xl border border-border bg-card px-4 py-3 text-left text-sm transition-colors hover:bg-accent"
                  >
                    <span className="size-1.5 shrink-0 rounded-full bg-brand" />
                    <span className="min-w-0 flex-1 truncate">
                      <span className="font-medium">{pulse.nextBill.name}</span>
                      <span className="tnum text-muted-foreground">
                        {" "}
                        · ₹{inr(pulse.nextBill.amount)} {dueLabel(pulse.nextBill.next_due)}
                      </span>
                    </span>
                  </button>
                )}

                <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => goTo("/settings")}
                      className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Settings className="size-4" />
                      Settings
                    </button>
                    <button
                      onClick={() => {
                        onOpenChange(false);
                        logout();
                      }}
                      className="flex h-9 items-center gap-2 rounded-lg px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
                    >
                      <LogOut className="size-4" />
                      Sign out
                    </button>
                    {/*
                      The theme switch used to be in the phone's drawer. With
                      the drawer gone it would have been desktop-only, which is
                      backwards — the setting matters most on the device people
                      read in bed with.
                    */}
                    <ThemeToggle />
                  </div>
                  <p className="hidden text-xs text-muted-foreground sm:block">
                    Press a number to jump · type to filter · Esc to close
                  </p>
                </div>
              </>
            )}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function ModuleCard({
  item,
  index,
  active,
  stat,
  onGo,
}: {
  item: NavItem;
  index: number;
  active: boolean;
  stat: string | null;
  onGo: (to: string) => void;
}) {
  return (
    <div
      className={cn(
        "group relative flex flex-col rounded-xl border bg-card p-4 text-left transition-colors",
        active ? "border-brand/50" : "border-border hover:border-ring/40",
      )}
    >
      {/*
        The whole card is the button, and the section chips sit on top of it.
        A <button> cannot contain buttons, so this is a stretched overlay rather
        than a wrapper — the chips stay real controls and the card stays one
        big target.
      */}
      <button
        onClick={() => onGo(item.to)}
        className="absolute inset-0 rounded-xl focus-visible:outline-none focus-visible:ring-[3px] focus-visible:ring-ring/30"
        aria-label={item.label}
      />

      <div className="pointer-events-none flex items-start justify-between gap-2">
        <span
          className={cn(
            "flex size-9 items-center justify-center rounded-lg transition-colors",
            active ? "bg-brand text-white" : "bg-secondary text-muted-foreground",
          )}
        >
          <item.icon className="size-[1.15rem]" />
        </span>
        <kbd className="tnum rounded border border-border px-1.5 py-0.5 font-sans text-[10px] text-muted-foreground">
          {index}
        </kbd>
      </div>

      <p className="pointer-events-none mt-3 text-[0.9375rem] font-semibold tracking-tight">
        {item.label}
      </p>
      <p className="tnum pointer-events-none mt-1 min-h-8 pb-3 text-xs leading-relaxed text-muted-foreground">
        {stat ?? BLURB[item.to] ?? ""}
      </p>

      {item.sections && (
        /* `mt-auto` so the chips sit on the card's floor: a grid row is as tall
           as its tallest card, and without this the chips floated mid-air in
           the short ones. */
        <div className="relative mt-auto flex flex-wrap gap-1 border-t border-border pt-3">
          {item.sections
            .filter((s: NavSection) => s.to !== item.to)
            .map((s) => (
              <button
                key={s.to}
                onClick={() => onGo(s.to)}
                className="flex h-8 items-center rounded-md px-2 text-[11px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                {s.label}
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
