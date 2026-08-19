import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import {
  Sparkles,
  LayoutDashboard,
  Wallet,
  CheckCircle2,
  StickyNote,
  Brain,
  ListChecks,
  MailWarning,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import AppHeader from "@/components/AppHeader";
import CommandPalette from "@/components/CommandPalette";

/*
  The app shell: a menu down the side, a bar across the top, content between.

  The sidebar used to be both — navigation *and* the account card, the settings
  link and sign-out — which had two consequences. Those three controls did not
  exist below md, where the sidebar is hidden, so every page grew its own
  duplicate of them in its own header. And there was nowhere to put anything
  global, so search and notifications had nowhere to go.

  Now the split is by kind, not by breakpoint: the sidebar is navigation and
  nothing else, and everything that is not navigation is in the header at every
  size.
*/

const nav = [
  { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true },
  { to: "/money", label: "Money", icon: Wallet },
  { to: "/tasks", label: "Tasks", icon: CheckCircle2 },
  { to: "/notes", label: "Notes", icon: StickyNote },
  { to: "/memories", label: "Memories", icon: Brain },
  { to: "/checklists", label: "Checklists", icon: ListChecks },
];

export default function AppLayout() {
  const { user } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);

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
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    // Installed on iOS the status bar is translucent over the app (see the
    // apple-mobile-web-app-status-bar-style meta), so the shell has to keep its
    // own content clear of the notch. Zero in a browser tab and on desktop.
    <div
      className="flex h-dvh overflow-hidden"
      style={{ paddingTop: "env(safe-area-inset-top, 0px)" }}
    >
      {/* ---------- Sidebar: navigation only ---------- */}
      <aside className="hidden w-60 shrink-0 flex-col border-r border-border/50 glass p-4 md:flex">
        <Link to="/dashboard" className="flex items-center gap-2.5 px-2 py-2">
          <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary glow">
            <Sparkles className="h-[1.15rem] w-[1.15rem] text-primary-foreground" />
          </span>
          <span className="text-lg font-bold tracking-tight">MyX</span>
        </Link>

        <nav className="mt-6 flex flex-col gap-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  isActive
                    ? "border border-primary/25 bg-primary/15 text-foreground"
                    : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`
              }
            >
              <item.icon className="h-[1.15rem] w-[1.15rem]" />
              {item.label}
            </NavLink>
          ))}
        </nav>
      </aside>

      {/* ---------- Header, routed content, mobile tab bar ---------- */}
      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader onOpenSearch={() => setSearchOpen(true)} />

        {/*
          Verification is skippable at signup, so this is the way back to it.
          `email_verified === false` rather than a falsy check: the field is
          absent on sessions predating verification, and those accounts are not
          unverified — they are from before the question was asked.
        */}
        {user?.email_verified === false && (
          <Link
            to="/verify-email"
            className="flex shrink-0 items-center gap-2 border-b border-amber-400/25 bg-amber-400/10 px-4 py-2.5 text-xs text-amber-200 transition-colors hover:bg-amber-400/15"
          >
            <MailWarning className="h-4 w-4 shrink-0" />
            <span className="min-w-0 flex-1">
              Confirm your email address to secure your account.
            </span>
            <span className="shrink-0 font-semibold underline">Enter code</span>
          </Link>
        )}

        <div className="min-h-0 flex-1 overflow-y-auto">
          <Outlet />
        </div>

        {/*
          The sidebar above is `hidden md:flex`, which left phones with no way to
          move between modules at all — each module's own bar only ever showed
          its own sub-navigation. This is the global nav for that breakpoint.
          Rendered as a flex sibling rather than `fixed` so it can never overlap
          page content, and padded for the iOS home indicator.
        */}
        <nav
          className="flex shrink-0 items-stretch border-t border-border/50 glass md:hidden"
          style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
          aria-label="Main"
        >
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex flex-1 flex-col items-center justify-center gap-1 py-2.5 text-[11px] font-medium transition-colors ${
                  isActive ? "text-primary" : "text-muted-foreground hover:text-foreground"
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <item.icon className="h-5 w-5" strokeWidth={isActive ? 2.4 : 2} />
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
