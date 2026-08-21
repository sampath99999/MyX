import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Menu as MenuIcon, X, ChevronDown, ArrowRight } from "lucide-react";
import { useAuth } from "@/lib/auth";
import ThemeToggle from "@/components/ThemeToggle";
import {
  ALL_CALCULATOR_LINKS,
  CATEGORY_LABELS,
  linksByCategory,
  pathFor,
  type CalculatorCategory,
} from "@/lib/calculators/registry";
import Logo from "@/components/Logo";
import { cn } from "@/lib/utils";

/*
  The bar every signed-out page wears.

  It used to live inside Landing, which meant the sign-in and sign-up screens
  had no header at all — you arrived from a marketing page with a wordmark, a
  theme switch and a way back, and landed somewhere with none of them. Signing
  up is the highest-stakes screen on the site and it was the one place with no
  way out except the browser's back button.

  **It is fixed, not sticky, and it is transparent.** Sticky put the bar in
  normal flow, so the hero's aurora began *underneath* it — which drew a hard
  horizontal seam across the top of the page exactly where the colour started.
  Taking it out of flow lets the page's own background run up behind it and the
  seam disappears. The frosted surface only appears once you have scrolled past
  the hero, where text would otherwise run under the links and become unreadable.
*/

export interface PublicNavLink {
  /** In-page anchor (#modules) or a route (/emi-calculator). */
  href: string;
  label: string;
}

/*
  The calculators mega menu.

  There are thirteen calculators and there will be more; a flat dropdown of
  thirteen items is a scroll, and hiding them behind a single "Calculators" link
  wastes the internal linking that makes the set rank at all. Four labelled
  columns is the shape every comparison site converges on because it is the one
  that fits the number.

  Opens on hover *and* on click. Hover alone is unusable by keyboard and on
  touch; click alone feels broken on a desktop nav. Escape and an outside click
  both close it, and focus leaving the whole region closes it too — the thing
  hover-only menus get wrong for keyboard users.
*/
function CalculatorsMenu() {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A small delay on close, so moving the pointer diagonally from the trigger
  // into the panel does not dismiss it on the way.
  const scheduleClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 120);
  };
  const cancelClose = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onDown);
    };
  }, [open]);

  useEffect(() => () => cancelClose(), []);

  return (
    <div
      ref={wrapRef}
      className="relative"
      onMouseEnter={() => {
        cancelClose();
        setOpen(true);
      }}
      onMouseLeave={scheduleClose}
      onFocus={() => setOpen(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setOpen(false);
      }}
    >
      {/*
        The trigger is a link to the hub, not a toggle button.

        With hover opening the panel, a toggle fires backwards: the pointer
        arrives, `onMouseEnter` opens it, and the click that follows closes it
        again — the menu appears to be broken on every desktop click. Making it
        a link resolves the conflict the way large navs do: hover reveals the
        panel, clicking goes to the index page. It is also a real internal link
        to /calculators on every public page, which is worth something to the
        page it points at.
      */}
      <Link
        to="/calculators"
        aria-expanded={open}
        aria-haspopup="true"
        onClick={() => setOpen(false)}
        className="flex items-center gap-1 rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:text-foreground"
      >
        Calculators
        <ChevronDown
          className={cn("size-3.5 transition-transform", open && "rotate-180")}
        />
      </Link>

      {open && (
        /*
          Centred on the viewport, not on the trigger.

          Anchoring a 56rem panel to a link that sits ~440px from the left edge
          put a third of it off-screen. Large navs all solve this the same way:
          the panel is its own band under a fixed header, independent of where
          the trigger happens to sit, so it cannot be clipped however the nav
          items reflow. `top` matches the header's height.
        */
        <div
          className="animate-in-up fixed left-1/2 top-16 z-50 w-[min(54rem,calc(100vw-2rem))] -translate-x-1/2"
          role="menu"
        >
          <div className="overflow-hidden rounded-2xl border border-border bg-popover shadow-pop">
            <div className="grid gap-x-8 gap-y-7 p-6 sm:grid-cols-2 lg:grid-cols-4">
              {/*
                Three link columns and a promo, rather than one column per
                category. The categories are 5, 5, 1 and 2 items long, so a
                column each left two of them nearly empty and the panel read as
                broken. Loans and Planning share the third column; the fourth
                does something useful with the space instead.
              */}
              {(["invest", "save"] as CalculatorCategory[]).map((category) => (
                <div key={category}>
                  <p className="eyebrow mb-3">{CATEGORY_LABELS[category]}</p>
                  <ul className="space-y-0.5">
                    {linksByCategory(category).map((c) => (
                      <li key={c.slug}>
                        <Link
                          to={pathFor(c.slug)}
                          onClick={() => setOpen(false)}
                          className="block rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        >
                          {c.name}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}

              <div className="space-y-6">
                {(["borrow", "plan"] as CalculatorCategory[]).map((category) => (
                  <div key={category}>
                    <p className="eyebrow mb-3">{CATEGORY_LABELS[category]}</p>
                    <ul className="space-y-0.5">
                      {linksByCategory(category).map((c) => (
                        <li key={c.slug}>
                          <Link
                            to={pathFor(c.slug)}
                            onClick={() => setOpen(false)}
                            className="block rounded-md px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                          >
                            {c.name}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>

              <Link
                to="/emi-calculator"
                onClick={() => setOpen(false)}
                className="card-interactive flex flex-col justify-between rounded-xl border border-border bg-card p-4"
              >
                <div>
                  <p className="eyebrow">Most used</p>
                  <p className="mt-2 text-sm font-semibold">EMI calculator</p>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                    Reducing-balance maths to the paise, with every instalment of the schedule and
                    the month interest stops dominating.
                  </p>
                </div>
                <span className="mt-4 inline-flex items-center gap-1.5 text-xs font-medium">
                  Open it
                  <ArrowRight className="size-3.5" />
                </span>
              </Link>
            </div>

            <Link
              to="/calculators"
              onClick={() => setOpen(false)}
              className="flex items-center justify-between gap-3 border-t border-border bg-secondary/50 px-6 py-3.5 text-sm font-medium transition-colors hover:bg-accent"
            >
              See all {ALL_CALCULATOR_LINKS.length} calculators
              <ArrowRight className="size-4" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function PublicHeader({
  links = [],
  className,
  /*
    Off on the sign-in and sign-up screens. Those pages have exactly one job,
    and a thirteen-item menu of free tools sitting above the form is an
    invitation to go and do something else instead of finishing the account.
  */
  calculators = true,
}: {
  links?: PublicNavLink[];
  className?: string;
  calculators?: boolean;
}) {
  const { user } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const primaryCta = user
    ? { to: "/dashboard", label: "Dashboard" }
    : { to: "/login?mode=register", label: "Get started" };

  const isRoute = (href: string) => href.startsWith("/");

  return (
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-40 transition-colors duration-300",
        scrolled ? "glass-bar border-b border-border" : "border-b border-transparent",
        className,
      )}
    >
      {/* A fixed height rather than padding, so PUBLIC_HEADER_OFFSET below is
          exact. With `py-3.5` the bar was whatever its tallest child made it —
          65px — against a 60px offset, and every page's content sat five pixels
          underneath the bar. */}
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-5 sm:px-6">
        {/* The mark carries the brand below sm; spelling the name out as well
            squeezed "Get started" onto two lines on a 320px screen. */}
        <Logo to="/" label="MyX home" size={32} nameClassName="hidden sm:inline" />

        <nav className="hidden items-center gap-1 text-sm md:flex">
          {calculators && <CalculatorsMenu />}
          {links.map((l) =>
              isRoute(l.href) ? (
                <Link
                  key={l.href}
                  to={l.href}
                  className="rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {l.label}
                </Link>
              ) : (
                <a
                  key={l.href}
                  href={l.href}
                  className="rounded-lg px-3 py-2 text-muted-foreground transition-colors hover:text-foreground"
                >
                  {l.label}
                </a>
            ),
          )}
        </nav>

        <div className="flex items-center gap-1.5">
          {/*
            A visitor who prefers light mode had no way to say so until they had
            an account — every signed-out page was locked to whatever their OS
            reported. Same control as the signed-in header, so the choice made
            here is the one that greets them after they sign up.
          */}
          <ThemeToggle />
          <Link
            to={user ? "/dashboard" : "/login"}
            className="hidden rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground sm:block"
          >
            {user ? "Open app" : "Sign in"}
          </Link>
          <Link
            to={primaryCta.to}
            className="whitespace-nowrap rounded-lg bg-foreground px-3.5 py-2 text-sm font-medium text-background transition-opacity hover:opacity-90 sm:px-4"
          >
            {primaryCta.label}
          </Link>
          {(calculators || links.length > 0) && (
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label={menuOpen ? "Close menu" : "Open menu"}
              aria-expanded={menuOpen}
              className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
            >
              {menuOpen ? <X className="size-4" /> : <MenuIcon className="size-4" />}
            </button>
          )}
        </div>
      </div>

      {menuOpen && (
        <div className="glass-bar border-t border-border px-5 pb-4 pt-2 md:hidden">
          {calculators && (
            <Link
              to="/calculators"
              onClick={() => setMenuOpen(false)}
              className="block rounded-lg px-2 py-2.5 text-sm font-medium transition-colors hover:text-foreground"
            >
              All calculators
            </Link>
          )}
          {links.map((l) =>
            isRoute(l.href) ? (
              <Link
                key={l.href}
                to={l.href}
                onClick={() => setMenuOpen(false)}
                className="block rounded-lg px-2 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {l.label}
              </Link>
            ) : (
              <a
                key={l.href}
                href={l.href}
                onClick={() => setMenuOpen(false)}
                className="block rounded-lg px-2 py-2.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
              >
                {l.label}
              </a>
            ),
          )}
        </div>
      )}
    </header>
  );
}

/**
 * The height the fixed header occupies, as a spacer class.
 *
 * Exported rather than repeated: the header is out of flow, so every public
 * page has to reserve this space itself, and a hardcoded `pt-16` in six files
 * is six chances to get it wrong.
 */
export const PUBLIC_HEADER_OFFSET = "pt-16";
