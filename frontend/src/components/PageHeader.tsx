import type { ReactNode } from "react";
import { LogOut } from "lucide-react";
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
