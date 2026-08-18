import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { LogOut, Settings } from "lucide-react";
import { useAuth } from "@/lib/auth";

export default function PageHeader({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  const { logout } = useAuth();
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between gap-4 border-b border-border/50 glass px-6 py-4">
      <div>
        <h1 className="text-lg font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
      <div className="flex items-center gap-2">
        {children}
        {/* The sidebar carries these on desktop; below md it is hidden, and the
            bottom tab bar is full, so they live here instead. */}
        <Link
          to="/settings"
          className="md:hidden text-muted-foreground hover:text-foreground"
          title="Settings"
        >
          <Settings className="h-5 w-5" />
        </Link>
        <button
          onClick={logout}
          className="md:hidden text-muted-foreground hover:text-destructive"
          title="Sign out"
        >
          <LogOut className="h-5 w-5" />
        </button>
      </div>
    </header>
  );
}
