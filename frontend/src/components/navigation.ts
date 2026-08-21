import {
  LayoutDashboard,
  Wallet,
  CheckCircle2,
  StickyNote,
  Brain,
  ListChecks,
  Receipt,
  RefreshCw,
  PiggyBank,
  Landmark,
  Target,
  TrendingUp,
  Sun,
  CalendarDays,
  Inbox,
} from "lucide-react";

/*
  The app's destinations, in one list.

  The sidebar, the phone's drawer and the desktop module bar are three different
  shapes and they were always going to be tempted to keep their own copy of
  this. They must not: a module added to one and forgotten in another is
  invisible on a whole class of device, and nothing would fail to make that
  obvious.

  Sections are the second level — the screens inside a module. They existed
  before, but only inside each module's own layout file, which meant the top
  level of the app could not see them and the menu could only ever offer six
  front doors. They are here so the menu can offer the rooms as well.
*/

export interface NavSection {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** One line, in the menu, saying what the screen is for. */
  desc: string;
  end?: boolean;
}

export interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Exact-match only — /dashboard would otherwise light up for every route. */
  end?: boolean;
  /** Screens inside this module. Absent for the ones that are a single screen. */
  sections?: NavSection[];
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const MONEY_SECTIONS: NavSection[] = [
  {
    to: "/money",
    label: "Overview",
    icon: LayoutDashboard,
    desc: "Cash flow, and what is committed",
    end: true,
  },
  { to: "/money/transactions", label: "Transactions", icon: Receipt, desc: "The full ledger" },
  { to: "/money/recurring", label: "Bills", icon: RefreshCw, desc: "Subscriptions and what is due" },
  { to: "/money/budgets", label: "Budgets", icon: PiggyBank, desc: "Limits by category, by month" },
  { to: "/money/loans", label: "Loans", icon: Landmark, desc: "Balances and payment history" },
  { to: "/money/goals", label: "Goals", icon: Target, desc: "What you are saving towards" },
  { to: "/money/investments", label: "Investments", icon: TrendingUp, desc: "Holdings and returns" },
];

const TASK_SECTIONS: NavSection[] = [
  { to: "/tasks", label: "Today", icon: Sun, desc: "Due now, and anything overdue", end: true },
  { to: "/tasks/upcoming", label: "Upcoming", icon: CalendarDays, desc: "The next seven days" },
  { to: "/tasks/inbox", label: "Inbox", icon: Inbox, desc: "Caught, not yet sorted" },
];

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/money", label: "Money", icon: Wallet, sections: MONEY_SECTIONS },
      { to: "/tasks", label: "Tasks", icon: CheckCircle2, sections: TASK_SECTIONS },
    ],
  },
  {
    label: "Personal",
    items: [
      { to: "/notes", label: "Notes", icon: StickyNote },
      { to: "/memories", label: "Memories", icon: Brain },
      { to: "/checklists", label: "Checklists", icon: ListChecks },
    ],
  },
];

/** Flat, in order — what the desktop bar shows across the top. */
export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((g) => g.items);
