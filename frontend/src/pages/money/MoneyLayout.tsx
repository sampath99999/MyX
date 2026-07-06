import { NavLink, Outlet } from "react-router-dom";
import { LogOut } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

const tabs = [
  { to: "/money", label: "Dashboard", end: true },
  { to: "/money/transactions", label: "Transactions" },
  { to: "/money/recurring", label: "Recurring" },
  { to: "/money/budgets", label: "Budgets" },
  { to: "/money/loans", label: "Loans" },
  { to: "/money/goals", label: "Goals" },
];

export default function MoneyLayout() {
  const { logout } = useAuth();
  return (
    <>
      <header className="sticky top-0 z-10 glass border-b border-border/50">
        <div className="flex items-center justify-between gap-4 px-6 pt-4">
          <div>
            <h1 className="text-lg font-bold tracking-tight">Money</h1>
            <p className="text-xs text-muted-foreground">Dashboard, transactions &amp; financial tools</p>
          </div>
          <button
            onClick={logout}
            className="md:hidden text-muted-foreground hover:text-destructive"
            title="Sign out"
          >
            <LogOut className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex gap-1 px-4">
          {tabs.map((t) => (
            <NavLink
              key={t.to}
              to={t.to}
              end={t.end}
              className={({ isActive }) =>
                cn(
                  "relative px-4 py-3 text-sm font-medium transition-colors",
                  isActive ? "text-foreground" : "text-muted-foreground hover:text-foreground",
                )
              }
            >
              {({ isActive }) => (
                <>
                  {t.label}
                  {isActive && (
                    <span className="absolute inset-x-3 -bottom-px h-0.5 rounded-full bg-primary" />
                  )}
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </header>

      <Outlet />
    </>
  );
}
