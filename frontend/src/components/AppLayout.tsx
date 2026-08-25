import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { Settings, PanelLeftClose, PanelLeft, Plus, MailWarning } from "lucide-react";
import { useAuth } from "@/lib/auth";
import AppHeader from "@/components/AppHeader";
import Logo, { LogoMark } from "@/components/Logo";
import AccountMenu from "@/components/AccountMenu";
import { NAV_GROUPS, type NavItem } from "@/components/navigation";
import RailLabel from "@/components/RailLabel";
import CommandPalette from "@/components/CommandPalette";
import AddMenu from "@/components/AddMenu";
import { cn } from "@/lib/utils";

/*
  The app shell: a menu down the side, a bar across the top, content between.

  Two things changed here beyond the paint.

  The nav is grouped. Six flat items reads as a list to be scanned; two labelled
  groups reads as a structure to be navigated, and the labels are what tell a
  new user that "Memories" is a personal thing rather than a system log.

  The sidebar collapses to icons and remembers it. On a 13" laptop the 240px
  rail was ~19% of the window, permanently, for navigation the user performs a
  few times an hour — and the screens that need width most (the ledger, the
  Kanban board) are exactly the ones it squeezed.
*/

const COLLAPSE_KEY = "myx.sidebar.collapsed";

/**
 * One row of the rail, in either state. Written once so the expanded and
 * collapsed versions cannot drift in padding, radius or active treatment.
 */
function NavRow({
  to,
  end,
  icon: Icon,
  label,
  collapsed,
}: {
  to: string;
  end?: boolean;
  icon: NavItem["icon"];
  label: string;
  collapsed: boolean;
}) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          "group relative flex items-center gap-2.5 rounded-lg text-sm font-medium transition-colors",
          collapsed ? "justify-center p-2.5" : "px-3 py-2",
          isActive
            ? "bg-brand/10 text-foreground"
            : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
        )
      }
    >
      {({ isActive }) => (
        <>
          {/*
            The active marker. A filled row alone was too quiet to find at a
            glance in a list of six, and turning the whole row brand-coloured
            was too loud for something that is on screen permanently. A short
            bar at the edge plus a tinted icon reads instantly and stays calm.
          */}
          <span
            className={cn(
              "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand transition-opacity",
              isActive ? "opacity-100" : "opacity-0",
            )}
          />
          <Icon
            className={cn("size-[1.05rem] shrink-0 transition-colors", isActive && "text-brand")}
          />
          {!collapsed && label}
          {collapsed && <RailLabel>{label}</RailLabel>}
        </>
      )}
    </NavLink>
  );
}

export default function AppLayout() {
  const { user } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => {
    try {
      return localStorage.getItem(COLLAPSE_KEY) === "1";
    } catch {
      return false;
    }
  });
  const { pathname } = useLocation();

  /* See the <main> below. */
  const mainRef = useRef<HTMLElement>(null);
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);

  const toggleCollapsed = () => {
    setCollapsed((v) => {
      const next = !v;
      try {
        localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
      } catch {
        // The choice still applies to this tab; it just will not survive a reload.
      }
      return next;
    });
  };

  /*
    ⌘K / Ctrl+K, owned here rather than inside the palette so the shortcut works
    when the palette is not mounted — which is the whole point of a shortcut.
    metaKey covers macOS, ctrlKey the rest; browsers give Ctrl+K to the address
    bar, so this has to preventDefault.
  */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
      // "[" folds the rail, the way every editor does it.
      if ((e.metaKey || e.ctrlKey) && e.key === "[") {
        e.preventDefault();
        toggleCollapsed();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    // Installed on iOS the status bar is translucent over the app (see the
    // apple-mobile-web-app-status-bar-style meta), so the shell has to keep its
    // own content clear of the notch. Zero in a browser tab and on desktop.
    <div
      className="flex h-dvh overflow-hidden bg-background"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      {/* Keyboard users should not have to tab through the whole menu on every
          page to reach the page. */}
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-3 focus:top-3 focus:z-[100] focus:rounded-md focus:bg-foreground focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-background"
      >
        Skip to content
      </a>

      {/* ---------- Sidebar: navigation, and who you are ---------- */}
      <aside
        className={cn(
          "hidden shrink-0 flex-col border-r border-border bg-card/40 transition-[width] duration-200 md:flex",
          collapsed ? "w-[4.25rem] px-2.5 py-3" : "w-[15rem] px-3 py-3",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-1",
            collapsed ? "flex-col" : "justify-between",
          )}
        >
          {collapsed ? (
            <Link to="/dashboard" aria-label="MyX — dashboard" className="p-1">
              <LogoMark size={28} />
            </Link>
          ) : (
            <Logo to="/dashboard" label="MyX — dashboard" size={28} className="px-1 py-1" />
          )}

          {/*
            One toggle, in one place, in both states. It used to be at the top
            when expanded and at the very bottom when collapsed, so the control
            that undoes an action was not where the action had just happened.
          */}
          <button
            onClick={toggleCollapsed}
            title={`${collapsed ? "Expand" : "Collapse"} sidebar (Ctrl + [)`}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            aria-expanded={!collapsed}
            className={cn(
              "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground",
              collapsed && "mt-1",
            )}
          >
            {collapsed ? <PanelLeft className="size-4" /> : <PanelLeftClose className="size-4" />}
          </button>
        </div>

        {/*
          The scroller is dropped while collapsed on purpose. `overflow-y: auto`
          forces the other axis to clip too, which would slice the hover labels
          off at the rail's edge — and a rail of seven icons has nothing to
          scroll anyway.
        */}
        <nav
          className={cn(
            "mt-4 flex min-h-0 flex-1 flex-col gap-4",
            collapsed ? "overflow-visible" : "overflow-y-auto",
          )}
        >
          {NAV_GROUPS.map((group) => (
            <div key={group.label}>
              {collapsed ? (
                <div className="mx-auto mb-2 h-px w-5 bg-border" />
              ) : (
                <p className="eyebrow mb-1.5 px-3">{group.label}</p>
              )}
              <div className="flex flex-col gap-0.5">
                {group.items.map((item) => (
                  <NavRow key={item.to} {...item} collapsed={collapsed} />
                ))}
              </div>
            </div>
          ))}
        </nav>

        <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
          <NavRow to="/settings" icon={Settings} label="Settings" collapsed={collapsed} />
          {/*
            The account moved out of the header and down here, where every app
            of this shape keeps it. The header had five controls crowded into
            its right corner; the sidebar had a blank foot and no indication of
            which account you were even looking at.
          */}
          <AccountMenu collapsed={collapsed} />
        </div>
      </aside>

      {/* ---------- Header, routed content, mobile tab bar ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader onOpenSearch={() => setSearchOpen(true)} />

        {/*
          The way back to verification when the code was skipped at signup.

          Only reachable when the server allows unverified accounts through at
          all: under REQUIRE_VERIFIED_EMAIL the route guard sends them to the
          code screen instead, and this banner never renders. It is the nudge
          for the deployment where verification is a nudge.

          `email_verified === false` rather than a falsy check: the field is
          absent on sessions predating verification, and those accounts are not
          unverified — they are from before the question was asked.
        */}
        {user?.email_verified === false && (
          <Link
            to="/verify-email"
            className="flex shrink-0 items-center gap-2 border-b border-amber-400/20 bg-amber-400/[0.07] px-4 py-2 text-xs text-amber-400 transition-colors hover:bg-amber-400/10"
          >
            <MailWarning className="size-3.5 shrink-0" />
            <span className="min-w-0 flex-1">
              Confirm your email address to secure your account.
            </span>
            <span className="shrink-0 font-medium underline underline-offset-2">Enter code</span>
          </Link>
        )}

        {/*
          Scroll resets on navigation, but the scroller itself survives it.

          This was `key={pathname}`, which did reset scrollTop — by destroying
          the whole page subtree and building a new one. Every URL change was
          therefore a remount, and the transaction details modal was a URL, so
          opening it threw away the ledger's loaded pages and its filters,
          refetched from offset 0 and jumped to the top; closing it did the same
          again. Anything else that grew a URL-addressed modal would have
          inherited the bug.

          Resetting the scroll of a scroller that persists gets the same result
          without touching component state. It stays keyed on the pathname
          rather than the whole URL because a modal is a state of a screen, not
          a screen — which is why the details modal now lives in the query
          string. Keep it that way and this needs no special cases.
        */}
        <main ref={mainRef} id="main" className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </main>

        {/*
          The one control worth a permanent target on a phone.

          It opens the same chooser as the header button rather than jumping
          straight to a transaction — six things are worth recording now, and a
          + that could only do one of them was quietly misleading.

          It used to sit at bottom-20, clearing a tab bar that is no longer
          there — see MobileNav for why it went. Down at bottom-5 it is easier
          to reach and no longer stacked on top of another piece of chrome.
        */}
        <button
          onClick={() => setAddOpen(true)}
          aria-label="Add"
          className="fixed bottom-5 right-4 z-30 flex size-14 items-center justify-center rounded-full bg-foreground text-background shadow-pop transition-transform active:scale-95 md:hidden"
          style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
        >
          <Plus className="size-6" />
        </button>

        <AddMenu open={addOpen} onOpenChange={setAddOpen} />
      </div>

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
