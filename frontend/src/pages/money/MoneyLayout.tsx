import { Outlet } from "react-router-dom";
import {
  LayoutDashboard,
  Receipt,
  RefreshCw,
  PiggyBank,
  Landmark,
  Target,
  TrendingUp,
} from "lucide-react";
import { NavTabs } from "@/components/ui/tabs";

/*
  Money's own navigation.

  Seven destinations is more than a sidebar entry can hold, so the module keeps
  its own row of tabs. It used to be a second page header — a title, a subtitle
  and a mobile sign-out button repeating what the app header already showed —
  above the tabs; the title is gone, because the tab row already says both that
  this is Money and which part of it you are in.

  Sticky, so switching between Budgets and Loans does not require scrolling back
  up on a long page.
*/

const TABS = [
  { to: "/money", label: "Overview", end: true, icon: LayoutDashboard },
  { to: "/money/transactions", label: "Transactions", icon: Receipt },
  { to: "/money/recurring", label: "Bills", icon: RefreshCw },
  { to: "/money/budgets", label: "Budgets", icon: PiggyBank },
  { to: "/money/loans", label: "Loans", icon: Landmark },
  { to: "/money/goals", label: "Goals", icon: Target },
  { to: "/money/investments", label: "Investments", icon: TrendingUp },
];

export default function MoneyLayout() {
  return (
    <>
      <div className="glass-bar sticky top-0 z-20 border-b border-border px-4 sm:px-6 lg:px-8">
        <div className="mx-auto w-full max-w-[1400px]">
          <NavTabs items={TABS} rule={false} />
        </div>
      </div>
      <Outlet />
    </>
  );
}
