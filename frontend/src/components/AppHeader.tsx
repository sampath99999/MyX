import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Search,
  Sun,
  Moon,
  Monitor,
  Settings,
  LogOut,
  Sparkles,
  ChevronDown,
  Plus,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useTheme, type Theme } from "@/lib/theme";
import { announceDataChanged } from "@/lib/useAuthenticatedLoad";
import NotificationsBell from "@/components/NotificationsBell";
import AddTransactionDialog from "@/components/AddTransactionDialog";

/*
  The app's one persistent bar.

  The sidebar used to carry navigation *and* the account card, the settings link
  and sign-out, which meant those three did not exist at all on a phone — the
  sidebar is hidden below md — and every page grew its own copy of them in its
  own header. Now the sidebar is a menu and nothing else, and everything that is
  not navigation lives here, at every breakpoint.
*/

const THEME_CYCLE: { value: Theme; icon: typeof Sun; label: string }[] = [
  { value: "system", icon: Monitor, label: "Theme: follows your device" },
  { value: "light", icon: Sun, label: "Theme: light" },
  { value: "dark", icon: Moon, label: "Theme: dark" },
];

function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  const index = Math.max(
    0,
    THEME_CYCLE.findIndex((t) => t.value === theme),
  );
  const current = THEME_CYCLE[index];
  const next = THEME_CYCLE[(index + 1) % THEME_CYCLE.length];
  const Icon = current.icon;

  return (
    <button
      onClick={() => setTheme(next.value)}
      title={`${current.label} — click for ${next.value}`}
      aria-label={current.label}
      className="flex h-9 w-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
    >
      <Icon className="h-[1.15rem] w-[1.15rem]" />
    </button>
  );
}

function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const initial = (user?.name?.trim()?.[0] ?? "?").toUpperCase();

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={wrapRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-label="Account menu"
        className="flex items-center gap-1.5 rounded-lg p-1 transition-colors hover:bg-accent"
      >
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-primary/20 text-xs font-semibold text-primary">
          {initial}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-2 w-60 overflow-hidden rounded-xl border border-border/60 bg-popover shadow-2xl">
          <div className="border-b border-border/60 px-4 py-3">
            <p className="truncate text-sm font-medium">{user?.name}</p>
            <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
          </div>
          <Link
            to="/settings"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-4 py-2.5 text-sm hover:bg-accent"
          >
            <Settings className="h-4 w-4 text-muted-foreground" />
            Settings
          </Link>
          <button
            onClick={logout}
            className="flex w-full items-center gap-2.5 px-4 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-destructive"
          >
            <LogOut className="h-4 w-4" />
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}

export default function AppHeader({ onOpenSearch }: { onOpenSearch: () => void }) {
  /*
    ⌘ on a Mac, Ctrl everywhere else. Resolved once at render rather than
    guessed in the copy, because "Ctrl K" printed on a Mac reads as a bug.
  */
  const isMac =
    typeof navigator !== "undefined" && /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

  return (
    /*
      `relative z-30` is load-bearing, not decoration. `glass` applies a
      backdrop-filter, and that makes this header its own stacking context — so
      the dropdowns inside it were confined to it, and any later sibling in the
      DOM (the dashboard cards) painted straight over them however high their own
      z-index went. Ordering the header's whole context above the content is the
      fix; raising the popovers could not be.
    */
    <header className="relative z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border/50 glass px-3 sm:px-4">
      {/* The wordmark lives in the sidebar on desktop; below md there is no
          sidebar, so it belongs here instead. */}
      <Link to="/dashboard" className="flex items-center gap-2 md:hidden" aria-label="MyX">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary glow">
          <Sparkles className="h-4 w-4 text-primary-foreground" />
        </span>
      </Link>

      <button
        onClick={onOpenSearch}
        className="flex h-9 min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-border/60 px-3 text-sm text-muted-foreground transition-colors hover:bg-accent sm:max-w-sm"
      >
        <Search className="h-4 w-4 shrink-0" />
        <span className="truncate">Search everything</span>
        <kbd className="ml-auto hidden shrink-0 rounded border border-border/60 px-1.5 py-0.5 font-sans text-[10px] sm:block">
          {isMac ? "⌘" : "Ctrl"} K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-1">
        {/*
          Quick add was on the dashboard only, which is the one screen where you
          are least likely to be when you remember an expense. It is the app's
          single most-used write, so it belongs next to search — reachable from
          anywhere, and never in the way.

          The label collapses to the icon below sm; the dialog is the same one
          either way.
        */}
        <AddTransactionDialog
          onCreated={announceDataChanged}
          trigger={
            <button
              title="Add a transaction"
              className="flex h-9 items-center gap-1.5 rounded-lg bg-primary px-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90 sm:px-3.5"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Quick add</span>
            </button>
          }
        />

        <div className="mx-1 h-5 w-px bg-border/60" />

        <ThemeToggle />
        <NotificationsBell />
        <UserMenu />
      </div>
    </header>
  );
}
