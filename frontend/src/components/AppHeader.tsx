import { Link, useLocation } from "react-router-dom";
import { Search, Plus } from "lucide-react";
import { announceDataChanged } from "@/lib/useAuthenticatedLoad";
import NotificationsBell from "@/components/NotificationsBell";
import AddTransactionDialog from "@/components/AddTransactionDialog";
import ThemeToggle from "@/components/ThemeToggle";
import AccountMenu from "@/components/AccountMenu";
import Logo, { LogoMark } from "@/components/Logo";
import MobileNav from "@/components/MobileNav";
import ModuleBar from "@/components/nav/ModuleBar";
import { NAV_GROUPS } from "@/components/navigation";

/*
  The app's one persistent bar.

  The sidebar carries navigation and, since the shell was rebuilt, the account.
  What is left here is the two things you do rather than the places you go:
  find something, and add something. Everything else — theme, notifications —
  sits to the right of them, and the corner is no longer five controls deep.

  The bar also says where you are, but only below `md`. The sidebar is hidden on
  a phone, so without this the only clue to the current screen is the content
  itself, and on a half-loaded page there is none. On desktop the rail already
  says it and the page says it again in its own heading, so a third copy here
  would be noise.
*/

const SECTION_TITLES: [RegExp, string][] = [
  [/^\/dashboard/, "Dashboard"],
  [/^\/money\/transactions/, "Transactions"],
  [/^\/money\/recurring/, "Bills"],
  [/^\/money\/budgets/, "Budgets"],
  [/^\/money\/loans/, "Loans"],
  [/^\/money\/goals/, "Goals"],
  [/^\/money\/investments/, "Investments"],
  [/^\/money/, "Money"],
  [/^\/tasks/, "Tasks"],
  [/^\/notes/, "Notes"],
  [/^\/memories/, "Memories"],
  [/^\/checklists/, "Checklists"],
  [/^\/settings/, "Settings"],
];

function sectionTitle(pathname: string) {
  return SECTION_TITLES.find(([re]) => re.test(pathname))?.[1] ?? "MyX";
}

export default function AppHeader({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { pathname } = useLocation();
  /*
    ⌘ on a Mac, Ctrl everywhere else. Resolved once at render rather than
    guessed in the copy, because "Ctrl K" printed on a Mac reads as a bug.
  */
  const isMac =
    typeof navigator !== "undefined" &&
    /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);

  return (
    /*
      `relative z-30` is load-bearing, not decoration. `glass-bar` applies a
      backdrop-filter, and that makes this header its own stacking context — so
      any later sibling in the DOM (the page content) would paint straight over
      anything anchored here. Menus portal to <body>, and this keeps the header
      itself above the scroller.
    */
    <header className="glass-bar relative z-30 flex h-14 shrink-0 items-center gap-2 border-b border-border px-3 sm:px-4">
      {/*
        Phone only: the way into the menu, the mark, then the name of the
        screen. The menu button leads because it is the control, and because a
        left-hand drawer opening from a left-hand button is the only version of
        this that feels connected to anything.
      */}
      <div className="flex min-w-0 items-center gap-1.5 md:hidden">
        <MobileNav groups={NAV_GROUPS} />
        <Link to="/dashboard" aria-label="MyX — dashboard" className="shrink-0">
          <LogoMark size={26} />
        </Link>
        <span className="truncate text-sm font-semibold tracking-tight">
          {sectionTitle(pathname)}
        </span>
      </div>

      {/* Desktop: the mark, then the modules. The sidebar used to carry both. */}
      <Logo
        to="/dashboard"
        label="MyX — dashboard"
        size={28}
        showName={false}
        className="mr-1 hidden shrink-0 md:flex"
      />
      <ModuleBar />

      {/*
        Search, as a field rather than an icon. It reads as somewhere to type,
        which is what makes anyone try it in the first place, and the shortcut
        printed on the right is how a keyboard user learns the shortcut exists.

        It no longer stretches: the modules have the left of the bar now, and a
        field that grows into whatever is left over made the row look different
        on every window width.
      */}
      <button
        onClick={onOpenSearch}
        className="ml-auto hidden h-9 w-56 shrink-0 items-center gap-2 rounded-lg border border-border bg-background/60 px-3 text-sm text-muted-foreground transition-colors hover:border-ring/40 hover:bg-accent/50 md:flex lg:w-64"
      >
        <Search className="size-4 shrink-0" />
        <span className="truncate">Search everything…</span>
        <kbd className="tnum ml-auto hidden shrink-0 rounded border border-border px-1.5 py-px font-sans text-[10px] text-muted-foreground lg:block">
          {isMac ? "⌘" : "Ctrl"} K
        </kbd>
      </button>

      <div className="ml-auto flex items-center gap-0.5 md:ml-1">
        {/* Search collapses to its icon below md, where the field would eat the
            whole bar. */}
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

        {/*
          Theme and the account are in the drawer on a phone, so they are not
          here as well. The right-hand corner had six controls at 320px, which
          left the screen name about seventy pixels to truncate into; it now has
          two, and the title has room to actually say where you are.
        */}
        <span className="hidden md:block">
          <ThemeToggle />
        </span>
        <NotificationsBell />

        {/* Desktop only: the phone keeps the account in its drawer, where the
            name and address have room to be shown rather than initialled. */}
        <AccountMenu variant="compact" className="hidden md:flex" />
      </div>
    </header>
  );
}
