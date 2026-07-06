import { NavLink, Outlet } from "react-router-dom";
import {
  Sparkles,
  LayoutDashboard,
  Wallet,
  CheckCircle2,
  StickyNote,
  Brain,
  ListChecks,
  LogOut,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

const nav = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard, end: true, ready: true },
  { to: "/money", label: "Money", icon: Wallet, ready: true },
  { to: "/tasks", label: "Tasks", icon: CheckCircle2, ready: false },
  { to: "/notes", label: "Notes", icon: StickyNote, ready: false },
  { to: "/memories", label: "Memories", icon: Brain, ready: false },
  { to: "/checklists", label: "Checklists", icon: ListChecks, ready: false },
];

export default function AppLayout() {
  const { user, logout } = useAuth();
  const firstName = user?.name?.split(" ")[0] ?? "there";

  return (
    <div className="flex min-h-dvh">
      {/* ---------- Sidebar ---------- */}
      <aside className="hidden md:flex md:w-64 flex-col glass border-r border-border/50 p-5">
        <div className="flex items-center gap-2.5 px-2 py-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary glow">
            <Sparkles className="h-[1.15rem] w-[1.15rem] text-primary-foreground" />
          </div>
          <span className="text-lg font-bold tracking-tight">MyX</span>
        </div>

        <nav className="mt-8 flex flex-col gap-1">
          {nav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              onClick={(e) => {
                if (!item.ready) e.preventDefault();
              }}
              className={({ isActive }) =>
                `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                  item.ready && isActive
                    ? "bg-primary/15 text-foreground border border-primary/25"
                    : item.ready
                      ? "text-muted-foreground hover:bg-accent hover:text-foreground"
                      : "text-muted-foreground/50 cursor-not-allowed"
                }`
              }
            >
              <item.icon className="h-[1.15rem] w-[1.15rem]" />
              {item.label}
              {!item.ready && (
                <span className="ml-auto text-[10px] uppercase tracking-wide text-muted-foreground/50">
                  soon
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto">
          <div className="flex items-center gap-3 rounded-lg border border-border/60 p-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/20 text-sm font-semibold text-primary">
              {firstName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{user?.name}</div>
              <div className="truncate text-xs text-muted-foreground">{user?.email}</div>
            </div>
            <button
              onClick={logout}
              title="Sign out"
              className="text-muted-foreground hover:text-destructive transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </div>
      </aside>

      {/* ---------- Routed content ---------- */}
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
