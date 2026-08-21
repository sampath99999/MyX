import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Search, Plus, ChevronRight } from "lucide-react";
import { announceDataChanged } from "@/lib/useAuthenticatedLoad";
import NotificationsBell from "@/components/NotificationsBell";
import AddTransactionDialog from "@/components/AddTransactionDialog";
import ThemeToggle from "@/components/ThemeToggle";
import AccountMenu from "@/components/AccountMenu";
import { LogoMark } from "@/components/Logo";
import Launcher from "@/components/nav/Launcher";
import { NAV_ITEMS } from "@/components/navigation";

/*
  The app's one persistent bar — and now the app's only persistent chrome.

  There is no navigation in it. The mark on the left opens the launcher (see
  nav/Launcher.tsx), and beside it the bar says where you are, as a path rather
  than a word: "Money › Transactions". That is the whole left-hand side.

  Everything that survives on the right is a verb rather than a place: search,
  add, theme, what needs you, who you are.
*/

/** Where the current path sits, resolved from the one navigation list. */
function useBreadcrumb(pathname: string) {
  const module =
    NAV_ITEMS.find((i) => (i.end ? pathname === i.to : pathname.startsWith(i.to))) ?? null;

  if (!module) {
    // Settings and anything else outside a module still deserves a name.
    if (pathname.startsWith("/settings")) {
      return { module: { to: "/settings", label: "Settings" }, section: null };
    }
    return { module: null, section: null };
  }

  const section =
    module.sections?.find((s) => (s.end ? pathname === s.to : pathname.startsWith(s.to))) ?? null;

  // A module's own index repeats its name; "Money › Overview" is noise.
  return { module, section: section && section.to !== module.to ? section : null };
}

export default function AppHeader({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { pathname } = useLocation();
  const [launcherOpen, setLauncherOpen] = useState(false);
  const { module, section } = useBreadcrumb(pathname);

  /*
    ⌘ on a Mac, Ctrl everywhere else. Resolved once at render rather than
    guessed in the copy, because "Ctrl K" printed on a Mac reads as a bug.
  */
  const isMac =
    typeof navigator !== "undefined" &&
    /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

  /*
    "G" for go, unmodified.

    A bare letter rather than a chord, because every comfortable chord is
    already spoken for: ⌘K is this app's search, ⌘J and ⌘L belong to the
    browser, and ⌃Space is the input switcher on a Mac. The price of a bare
    letter is that it has to stay out of the way of typing, which is what the
    field check below is for.
  */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "g" && e.key !== "G") return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const el = document.activeElement as HTMLElement | null;
      if (
        el &&
        (el.tagName === "INPUT" ||
          el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" ||
          el.isContentEditable)
      ) {
        return;
      }
      e.preventDefault();
      setLauncherOpen(true);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    /*
      `relative z-30` is load-bearing, not decoration. `glass-bar` applies a
      backdrop-filter, and that makes this header its own stacking context — so
      any later sibling in the DOM (the page content) would paint straight over
      anything anchored here. Menus portal to <body>, and this keeps the header
      itself above the scroller.
    */
    <header className="glass-bar relative z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
      <button
        onClick={() => setLauncherOpen(true)}
        aria-label="Go to…"
        aria-haspopup="dialog"
        className="group flex shrink-0 items-center gap-2 rounded-lg p-1 transition-colors hover:bg-accent"
      >
        <LogoMark size={28} />
        {/* The shortcut, printed. Nobody discovers a bare letter on their own. */}
        <kbd className="hidden rounded border border-border px-1.5 py-0.5 font-sans text-[10px] text-muted-foreground transition-colors group-hover:text-foreground sm:block">
          G
        </kbd>
      </button>

      {/* Where you are. Static text — the mark to its left is how you move. */}
      <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-0.5 text-sm">
        {module && (
          <Link
            to={module.to}
            className="truncate rounded-md px-1.5 py-1 font-semibold tracking-tight transition-colors hover:bg-accent"
          >
            {module.label}
          </Link>
        )}
        {section && (
          <>
            <ChevronRight className="size-3.5 shrink-0 text-muted-foreground/60" />
            <span className="truncate px-1.5 py-1 text-muted-foreground">{section.label}</span>
          </>
        )}
      </nav>

      <div className="ml-auto flex items-center gap-0.5">
        {/*
          Search, as a field on a desktop and an icon on a phone. It reads as
          somewhere to type, which is what makes anyone try it, and the shortcut
          printed on the right is how a keyboard user learns it exists.
        */}
        <button
          onClick={onOpenSearch}
          className="mr-1 hidden h-9 w-56 shrink-0 items-center gap-2 rounded-lg border border-border bg-background/60 px-3 text-sm text-muted-foreground transition-colors hover:border-ring/40 hover:bg-accent/50 md:flex lg:w-64"
        >
          <Search className="size-4 shrink-0" />
          <span className="truncate">Search everything…</span>
          <kbd className="tnum ml-auto hidden shrink-0 rounded border border-border px-1.5 py-px font-sans text-[10px] text-muted-foreground lg:block">
            {isMac ? "⌘" : "Ctrl"} K
          </kbd>
        </button>

        <button
          onClick={onOpenSearch}
          aria-label="Search"
          className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
        >
          <Search className="size-[1.15rem]" />
        </button>

        {/*
          Quick add was on the dashboard only, which is the one screen where you
          are least likely to be when you remember an expense. It is the app's
          single most-used write, so it belongs next to search — reachable from
          anywhere, and never in the way. On a phone it is the floating button
          in the shell instead, so this hides below md.
        */}
        <AddTransactionDialog
          onCreated={announceDataChanged}
          trigger={
            <button
              title="Add a transaction"
              className="mr-1.5 hidden h-9 items-center gap-1.5 rounded-lg bg-foreground px-3 text-[0.8125rem] font-medium text-background transition-opacity hover:opacity-90 md:flex"
            >
              <Plus className="size-4" />
              Add
            </button>
          }
        />

        <span className="hidden md:block">
          <ThemeToggle />
        </span>
        <NotificationsBell />
        <AccountMenu variant="compact" />
      </div>

      <Launcher open={launcherOpen} onOpenChange={setLauncherOpen} />
    </header>
  );
}
