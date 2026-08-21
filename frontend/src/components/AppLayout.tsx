import { useEffect, useState } from "react";
import { Link, Outlet, useLocation } from "react-router-dom";
import { Plus, MailWarning } from "lucide-react";
import Dock from "@/components/nav/Dock";
import { useAuth } from "@/lib/auth";
import AppHeader from "@/components/AppHeader";
import CommandPalette from "@/components/CommandPalette";
import AddTransactionDialog from "@/components/AddTransactionDialog";
import { announceDataChanged } from "@/lib/useAuthenticatedLoad";

/*
  The app shell: a bar across the top, the page underneath, and nothing else.

  There was a 240px sidebar here. On a 13" laptop it was ~19% of the window,
  permanently, for navigation performed a handful of times an hour — and the
  screens that wanted width most, the ledger and the board, were exactly the
  ones it squeezed. It also could not show the level below itself, so every
  module drew its own strip of tabs underneath, and the app had three
  navigation surfaces on screen at once.

  What is here instead: a dock floating over the page on a desktop
  (nav/Dock.tsx), the launcher on a phone and on the G key (nav/Launcher.tsx),
  and a header that says where you are rather than listing where you could go.
*/

export default function AppLayout() {
  const { user } = useAuth();
  const [searchOpen, setSearchOpen] = useState(false);
  const { pathname } = useLocation();

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

      {/* ---------- Header, then the page ---------- */}
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
          `key` on the scroller resets scrollTop on navigation. Without it,
          opening a note from halfway down the list left the note scrolled
          halfway down too.
        */}
        {/*
          `pb-24` on desktop is the dock's rent. It floats over the page rather
          than taking a column of it, which is the point — but a page that ends
          flush with the viewport would end underneath it, so the scroller
          leaves the last inch clear.
        */}
        <main id="main" key={pathname} className="min-h-0 flex-1 overflow-y-auto md:pb-24">
          <Outlet />
        </main>

        <Dock />

        {/*
          The one write worth a permanent target on a phone.

          It used to sit at bottom-20, clearing a tab bar that is no longer
          there — see MobileNav for why it went. Down at bottom-5 it is easier
          to reach and no longer stacked on top of another piece of chrome.
        */}
        <AddTransactionDialog
          onCreated={announceDataChanged}
          trigger={
            <button
              aria-label="Add a transaction"
              className="fixed bottom-5 right-4 z-30 flex size-14 items-center justify-center rounded-full bg-foreground text-background shadow-pop transition-transform active:scale-95 md:hidden"
              style={{ marginBottom: "env(safe-area-inset-bottom, 0px)" }}
            >
              <Plus className="size-6" />
            </button>
          }
        />
      </div>

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </div>
  );
}
