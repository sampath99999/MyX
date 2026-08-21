import {
  LayoutDashboard,
  Wallet,
  CheckCircle2,
  StickyNote,
  Brain,
  ListChecks,
} from "lucide-react";

/*
  The app's top-level destinations, in one list.

  The sidebar and the phone's drawer are different components with different
  shapes, and they were always going to be tempted to keep their own copy of
  this. They must not: a module added to one and forgotten in the other is
  invisible on half the devices that run the app, and nothing would fail to
  make that obvious.

  The grouping is doing work beyond tidiness. Six flat items reads as a list to
  be scanned; two labelled groups reads as a structure to be navigated, and the
  labels are what tell a new user that "Memories" is a personal thing rather
  than a system log.
*/

export interface NavItem {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  /** Exact-match only — /dashboard would otherwise light up for every route. */
  end?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

export const NAV_GROUPS: NavGroup[] = [
  {
    label: "Overview",
    items: [
      { to: "/dashboard", label: "Dashboard", icon: LayoutDashboard, end: true },
      { to: "/money", label: "Money", icon: Wallet },
      { to: "/tasks", label: "Tasks", icon: CheckCircle2 },
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
