import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import { Settings } from "lucide-react";
import { NAV_ITEMS, type NavItem } from "@/components/navigation";
import { useAppPulse, type AppPulse } from "@/lib/useAppPulse";
import { useReducedMotion } from "@/components/landing/motion";
import { cn } from "@/lib/utils";

/*
  The dock.

  Navigation that is not welded to an edge of the window. It floats over the
  content, centred, and it is the only shape tried here that does not spend a
  permanent column or row of the layout: the page runs full width and full
  height underneath, and the dock sits on top of the last inch of it.

  What makes a dock a dock rather than a row of buttons is the magnification.
  As the pointer travels along it, each tile grows by how close the pointer is,
  so the thing under the cursor is always the biggest thing — the target grows
  to meet you instead of you aiming at it. macOS has done this since 2001 and
  it is still the most pleasant navigation ever shipped.

  The maths is a distance falloff, not a hover state. Every tile's scale is a
  function of |pointer - tile centre|, which is what produces the wave: the
  tiles either side swell a little, the ones beyond that barely move.

  Written straight to the DOM rather than through React state. A pointer moving
  across the dock fires mousemove at the display's refresh rate, and re-rendering
  eight components sixty times a second to set eight transforms is work for
  nothing — `style.transform` on a ref is the same result with none of it.
  Only the label, which changes when the pointer crosses a tile boundary a few
  times a second, is state.

  It is a pointer idiom, so it is `md` and up. Phones keep the launcher, which
  is a better answer for a thumb anyway, and which is also what the G key opens
  on a desktop for anyone who would rather not reach for the mouse at all.
*/

/** Tile size at rest, and the gap between tiles. */
const TILE = 44;
const GAP = 6;

/** How much the tile under the pointer grows, and how far the wave reaches. */
const AMPLITUDE = 0.55;
const RANGE = 105;

interface DockEntry {
  to: string;
  label: string;
  icon: NavItem["icon"];
  end?: boolean;
}

/** Badges say "something wants you", never "this exists". */
function badgeFor(to: string, pulse: AppPulse | null): number | null {
  if (!pulse) return null;
  if (to === "/tasks") return pulse.dueToday || null;
  if (to === "/money") return pulse.nextBill ? 1 : null;
  return null;
}

export default function Dock() {
  const { pathname } = useLocation();
  const pulse = useAppPulse();
  const still = useReducedMotion();
  const [hovered, setHovered] = useState<number | null>(null);

  const tiles = useRef<(HTMLAnchorElement | null)[]>([]);
  /*
    Tile centres, relative to the dock, measured once per hover rather than per
    move. Computing them from the index was the obvious shortcut and it was
    wrong twice over: it ignored the container's own padding, which shifted
    every centre by six pixels, and it ignored the separator before Settings,
    which shifts everything after it by six more. The result was a wave whose
    peak sat off-centre from the tile under the cursor — subtle enough to look
    like a rendering fault rather than a bug. Measurement cannot drift from the
    layout the way arithmetic about the layout can.
  */
  const centres = useRef<number[]>([]);

  const measure = (dock: HTMLElement) => {
    const base = dock.getBoundingClientRect().left;
    centres.current = tiles.current.map((tile) => {
      if (!tile) return Number.POSITIVE_INFINITY;
      const r = tile.getBoundingClientRect();
      return r.left + r.width / 2 - base;
    });
  };

  const entries: DockEntry[] = [
    ...NAV_ITEMS.map((i) => ({ to: i.to, label: i.label, icon: i.icon, end: i.end })),
    { to: "/settings", label: "Settings", icon: Settings },
  ];

  /*
    Reset when the pointer leaves, and whenever the route changes — a click
    navigates, the dock re-renders, and without this the tile the pointer was
    over stays swollen under a cursor that has since moved away.
  */
  const relax = () => {
    for (const tile of tiles.current) {
      if (tile) tile.style.transform = "";
    }
    // Forces a re-measure next time: a tile still holding a transform would
    // measure at its magnified width.
    centres.current = [];
    setHovered(null);
  };

  useEffect(relax, [pathname]);

  function onMove(e: React.MouseEvent<HTMLElement>) {
    if (still) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    if (centres.current.length !== tiles.current.length) measure(e.currentTarget);

    let nearest = 0;
    let nearestDistance = Infinity;

    tiles.current.forEach((tile, i) => {
      if (!tile) return;
      const centre = centres.current[i];
      const distance = Math.abs(x - centre);
      if (distance < nearestDistance) {
        nearestDistance = distance;
        nearest = i;
      }
      // Smooth falloff, clamped at zero past RANGE. Squared so the peak is
      // rounded rather than a tent, which is what makes it read as a wave.
      const t = Math.max(0, 1 - (distance / RANGE) ** 2);
      const scale = 1 + AMPLITUDE * t;
      // Lift by half the growth so the tile grows out of the dock's floor
      // instead of through it.
      const lift = ((scale - 1) * TILE) / 2;
      tile.style.transform = `translateY(${-lift}px) scale(${scale})`;
    });

    setHovered(nearestDistance < TILE ? nearest : null);
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-40 hidden justify-center md:flex">
      <div
        onMouseEnter={(e) => measure(e.currentTarget)}
        onMouseMove={onMove}
        onMouseLeave={relax}
        className="glass-bar pointer-events-auto flex items-end rounded-2xl border border-border p-1.5 shadow-lg"
        style={{ gap: GAP }}
      >
        {entries.map((entry, i) => {
          const isActive = entry.end
            ? pathname === entry.to
            : pathname.startsWith(entry.to);
          const badge = badgeFor(entry.to, pulse);
          const isSettings = entry.to === "/settings";

          return (
            <div key={entry.to} className="relative flex items-end">
              {/* macOS puts a rule before the Trash; this is the same idea —
                  the app's places, then the app itself. */}
              {isSettings && <span className="mb-2 mr-1.5 h-8 w-px bg-border" />}

              <NavLink
                to={entry.to}
                end={entry.end}
                ref={(el) => {
                  tiles.current[i] = el;
                }}
                aria-label={entry.label}
                className={cn(
                  "relative flex items-center justify-center rounded-xl border transition-colors",
                  // No transition on transform: the pointer is already driving
                  // it frame by frame, and easing on top of that lags the
                  // cursor by exactly the duration you set.
                  isActive
                    ? "border-transparent bg-brand text-white"
                    : "border-transparent bg-secondary/60 text-muted-foreground hover:text-foreground",
                )}
                style={{ width: TILE, height: TILE, transformOrigin: "bottom center" }}
              >
                <entry.icon className="size-[1.15rem]" />

                {badge !== null && (
                  <span className="tnum absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] font-semibold text-white ring-2 ring-card">
                    {badge}
                  </span>
                )}
              </NavLink>

              {/* The running dot, under the tile, the way a dock does it. */}
              <span
                aria-hidden
                className={cn(
                  "absolute -bottom-1 left-1/2 size-1 -translate-x-1/2 rounded-full bg-foreground transition-opacity",
                  isActive ? "opacity-70" : "opacity-0",
                )}
              />

              {/* The name, above the tile the pointer is nearest to. */}
              {hovered === i && (
                <span className="pointer-events-none absolute -top-9 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground shadow-pop animate-in fade-in-0 zoom-in-95 duration-100">
                  {entry.label}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
