import { useCallback, useEffect, useRef, useState } from "react";
import { Link, NavLink, useLocation } from "react-router-dom";
import { ChevronDown, ArrowRight } from "lucide-react";
import { NAV_ITEMS, type NavItem } from "@/components/navigation";
import { useAppPulse, type AppPulse } from "@/lib/useAppPulse";
import { cn } from "@/lib/utils";

/*
  The desktop navigation: the modules across the top, each opening a panel.

  This replaces a 240px sidebar, and the case for it is not that sidebars are
  bad — it is that this app had three navigation surfaces on screen at once. The
  rail listed six modules, the header sat beside it, and under both, every
  module drew its own strip of tabs. The rail could only ever show the front
  doors; the rooms were somewhere else entirely, and getting from Budgets to
  Investments meant reading two different bars.

  So the panel carries both levels. "Money" opens onto its seven screens with a
  line each saying what they are for, which is something a 240px rail has never
  had room to say.

  The other half of the idea is that the menu reports. Numbers on the bar and in
  each panel come from the same summary the dashboard uses, so opening Tasks
  tells you three are due before you have gone anywhere. Navigation that answers
  the question you opened it to ask beats navigation you have to read.

  And it gives the width back. The ledger and the board — the two screens that
  most wanted room — were exactly the ones the rail was squeezing.
*/

/** Hover intent. Long enough to ignore a cursor passing through. */
const OPEN_DELAY = 90;
/** Grace on the way out, so a diagonal move to the panel does not close it. */
const CLOSE_DELAY = 160;

const inr = (n: number) =>
  new Intl.NumberFormat("en-IN", { maximumFractionDigits: 0 }).format(Math.round(n));

function dueLabel(iso: string) {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "tomorrow";
  return `in ${days} days`;
}

/**
 * The count that rides on a bar item.
 *
 * Only where a number means "something wants you": tasks due, a bill landing.
 * A badge on Notes saying how many notes exist would be a decoration that
 * teaches people to ignore badges.
 */
function pulseBadge(item: NavItem, pulse: AppPulse | null): number | null {
  if (!pulse) return null;
  if (item.to === "/tasks") return pulse.dueToday || null;
  if (item.to === "/money") return pulse.nextBill ? 1 : null;
  return null;
}

/** The right-hand column of a panel: what is true in this module right now. */
function Glance({ item, pulse }: { item: NavItem; pulse: AppPulse | null }) {
  if (!pulse) {
    // No skeleton. The panel is usable without this, and a shimmering block
    // beside real links reads as breakage rather than as loading.
    return null;
  }

  if (item.to === "/money") {
    return (
      <div className="flex w-52 shrink-0 flex-col border-l border-border pl-5">
        <p className="eyebrow">Right now</p>
        <p className="tnum mt-3 text-2xl font-semibold tracking-tight">₹{inr(pulse.balance)}</p>
        <p className="mt-1 text-xs text-muted-foreground">Current balance</p>
        <p className="tnum mt-4 text-sm font-medium">₹{inr(pulse.monthSpend)}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Spent this month</p>
        {pulse.nextBill && (
          <div className="mt-auto rounded-lg border border-border bg-background/50 p-3">
            <p className="truncate text-xs font-medium">{pulse.nextBill.name}</p>
            <p className="tnum mt-0.5 text-xs text-muted-foreground">
              ₹{inr(pulse.nextBill.amount)} · {dueLabel(pulse.nextBill.next_due)}
            </p>
          </div>
        )}
      </div>
    );
  }

  if (item.to === "/tasks") {
    return (
      <div className="flex w-52 shrink-0 flex-col border-l border-border pl-5">
        <p className="eyebrow">Right now</p>
        <p className="tnum mt-3 text-2xl font-semibold tracking-tight">{pulse.dueToday}</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {pulse.dueToday === 1 ? "task needs you today" : "tasks need you today"}
        </p>
        <p className="tnum mt-4 text-sm font-medium">{pulse.openTasks}</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Open in total</p>
      </div>
    );
  }

  return null;
}

function Panel({ item, left, pulse }: { item: NavItem; left: number; pulse: AppPulse | null }) {
  return (
    <div
      /*
        `fixed`, under the header, positioned from the trigger and clamped by
        the caller. Absolute inside the header would be clipped: the header
        carries a backdrop-filter, which makes it its own stacking context.
      */
      className="fixed top-14 z-40 animate-in fade-in-0 slide-in-from-top-1 duration-150"
      style={{ left }}
      onMouseDown={(e) => e.preventDefault()}
    >
      <div className="flex gap-5 rounded-xl border border-border bg-popover p-4 shadow-lg">
        <div className="grid grid-cols-2 gap-1">
          {item.sections!.map((section) => (
            <NavLink
              key={section.to}
              to={section.to}
              end={section.end}
              className={({ isActive }) =>
                cn(
                  "group flex w-64 items-start gap-3 rounded-lg p-2.5 transition-colors",
                  isActive ? "bg-brand/10" : "hover:bg-accent",
                )
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={cn(
                      "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg border transition-colors",
                      isActive
                        ? "border-transparent bg-brand text-white"
                        : "border-border bg-background/60 text-muted-foreground group-hover:text-foreground",
                    )}
                  >
                    <section.icon className="size-4" />
                  </span>
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{section.label}</span>
                    <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                      {section.desc}
                    </span>
                  </span>
                </>
              )}
            </NavLink>
          ))}
        </div>

        <Glance item={item} pulse={pulse} />
      </div>
    </div>
  );
}

export default function ModuleBar() {
  const { pathname } = useLocation();
  const pulse = useAppPulse();
  const [openFor, setOpenFor] = useState<string | null>(null);
  const [left, setLeft] = useState(0);

  const barRef = useRef<HTMLElement>(null);
  const openTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = () => {
    if (openTimer.current) clearTimeout(openTimer.current);
    if (closeTimer.current) clearTimeout(closeTimer.current);
  };

  /** Anchors the panel under its trigger, clamped inside the viewport. */
  const place = useCallback((trigger: HTMLElement, width: number) => {
    const rect = trigger.getBoundingClientRect();
    const next = Math.min(Math.max(12, rect.left - 16), window.innerWidth - width - 12);
    setLeft(next);
  }, []);

  const open = useCallback(
    (item: NavItem, trigger: HTMLElement) => {
      // Money's panel is four columns wide, Tasks' is three. Measured from the
      // layout below: two 256px section columns + gap + padding, plus a 208px
      // glance column when there is one.
      place(trigger, item.sections!.length > 3 ? 760 : 500);
      setOpenFor(item.to);
    },
    [place],
  );

  // Any navigation closes whatever is open. Keyed on the path rather than on
  // each link, so a new destination cannot forget to do it.
  useEffect(() => {
    clearTimers();
    setOpenFor(null);
  }, [pathname]);

  useEffect(() => {
    if (!openFor) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpenFor(null);
    };
    // A panel anchored to a trigger cannot follow it, so it closes instead.
    const onScrollOrResize = () => setOpenFor(null);
    window.addEventListener("keydown", onKey);
    window.addEventListener("resize", onScrollOrResize);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", onScrollOrResize);
    };
  }, [openFor]);

  useEffect(() => clearTimers, []);

  const active = (item: NavItem) =>
    item.end ? pathname === item.to : pathname.startsWith(item.to);

  const item = NAV_ITEMS.find((i) => i.to === openFor) ?? null;

  return (
    <nav
      ref={barRef}
      aria-label="Main"
      className="hidden min-w-0 items-center gap-0.5 md:flex"
      onMouseLeave={() => {
        clearTimers();
        closeTimer.current = setTimeout(() => setOpenFor(null), CLOSE_DELAY);
      }}
      onMouseEnter={clearTimers}
    >
      {NAV_ITEMS.map((navItem) => {
        const isActive = active(navItem);
        const badge = pulseBadge(navItem, pulse);
        const isOpen = openFor === navItem.to;

        return (
          <Link
            key={navItem.to}
            to={navItem.to}
            /*
              A link, not a toggle. The public header learned this the hard way:
              a trigger that opens on hover and toggles on click is already open
              when the click lands, so clicking the thing you are pointing at
              closes it. Clicking goes to the module; the panel is hover and
              keyboard only.
            */
            onMouseEnter={(e) => {
              if (!navItem.sections) {
                clearTimers();
                setOpenFor(null);
                return;
              }
              const trigger = e.currentTarget;
              clearTimers();
              openTimer.current = setTimeout(() => open(navItem, trigger), OPEN_DELAY);
            }}
            onFocus={(e) => {
              if (navItem.sections) open(navItem, e.currentTarget);
              else setOpenFor(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown" && navItem.sections) {
                e.preventDefault();
                open(navItem, e.currentTarget);
              }
            }}
            aria-expanded={navItem.sections ? isOpen : undefined}
            aria-current={isActive ? "page" : undefined}
            className={cn(
              "relative flex h-9 shrink-0 items-center gap-1.5 rounded-lg px-2.5 text-[0.8125rem] font-medium transition-colors lg:px-3 lg:text-sm",
              isActive || isOpen
                ? "text-foreground"
                : "text-muted-foreground hover:text-foreground",
              !isActive && "hover:bg-accent/60",
              isActive && "bg-accent/50",
            )}
          >
            <navItem.icon className="size-4 shrink-0 lg:hidden xl:block" />
            {navItem.label}

            {badge !== null && (
              <span className="tnum ml-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white">
                {badge}
              </span>
            )}

            {navItem.sections && (
              <ChevronDown
                className={cn(
                  "size-3 shrink-0 text-muted-foreground transition-transform",
                  isOpen && "rotate-180",
                )}
              />
            )}

            {/* The active marker sits on the header's own bottom edge. */}
            <span
              className={cn(
                "absolute -bottom-[13px] left-2.5 right-2.5 h-[2px] rounded-full bg-brand transition-opacity lg:left-3 lg:right-3",
                isActive ? "opacity-100" : "opacity-0",
              )}
            />
          </Link>
        );
      })}

      {item?.sections && <Panel item={item} left={left} pulse={pulse} />}

      {/* Everything is reachable without the panel; this is the fast path. */}
      {item?.sections && (
        <Link
          to={item.to}
          className="sr-only focus:not-sr-only focus:absolute focus:left-0 focus:top-full focus:z-50 focus:rounded-md focus:bg-foreground focus:px-3 focus:py-2 focus:text-sm focus:text-background"
        >
          Go to {item.label}
          <ArrowRight className="ml-1 inline size-3.5" />
        </Link>
      )}
    </nav>
  );
}
