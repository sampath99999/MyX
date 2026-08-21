import { Link } from "react-router-dom";
import { ChevronsUpDown, LogOut, Settings, ShieldCheck } from "lucide-react";
import { Menu, MenuItem, MenuLink, MenuSeparator } from "@/components/ui/menu";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/utils";

/*
  Who you are signed in as.

  The account used to live in the top-right corner of the header, as an initial
  in a circle beside a chevron — four other controls deep into a row that was
  already crowded, and showing neither the name nor the address unless you
  opened it. Which account you are in matters most to anyone who keeps a
  personal and a work login, and it was the one thing the shell never said out
  loud.

  It is now the last thing in the header on a desktop and the last thing in the
  drawer on a phone — one component either way, so the two can never disagree
  about what signing out does. The drawer has room to print the name and the
  address; the header shows the initial and saves them for the menu.
*/
export default function AccountMenu({
  variant = "sidebar",
  className,
}: {
  /** `sidebar` shows name and address; `compact` is the avatar alone. */
  variant?: "sidebar" | "compact";
  className?: string;
}) {
  const { user, logout } = useAuth();
  const name = user?.name?.trim() || "Account";
  const initial = (name[0] ?? "?").toUpperCase();
  const unverified = user?.email_verified === false;
  const compact = variant === "compact";

  return (
    <Menu
      align={variant === "sidebar" ? "start" : "end"}
      trigger={
        <button
          aria-label={`Account: ${name}`}
          className={cn(
            "group relative flex items-center gap-2.5 rounded-lg text-left transition-colors hover:bg-accent",
            compact ? "justify-center p-1.5" : "w-full px-2 py-1.5",
            className,
          )}
        >
          <span className="relative flex size-7 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold">
            {initial}
            {/*
              A dot rather than a second banner. The shell already carries the
              full message when verification is outstanding; this is the part
              that survives scrolling past it.
            */}
            {unverified && (
              <span className="absolute -right-0.5 -top-0.5 size-2 rounded-full bg-amber-400 ring-2 ring-card" />
            )}
          </span>

          {!compact && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.8125rem] font-medium leading-tight">
                  {name}
                </span>
                <span className="block truncate text-[11px] leading-tight text-muted-foreground">
                  {user?.email}
                </span>
              </span>
              <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
            </>
          )}
        </button>
      }
    >
      <div className="border-b border-border px-2.5 pb-2.5 pt-1.5">
        <p className="truncate text-sm font-medium">{name}</p>
        <p className="truncate text-xs text-muted-foreground">{user?.email}</p>
        {unverified && (
          <Link
            to="/verify-email"
            className="mt-2 flex items-center gap-1.5 text-xs font-medium text-amber-400 hover:underline"
          >
            <ShieldCheck className="size-3.5" />
            Verify your email
          </Link>
        )}
      </div>
      <div className="pt-1">
        <MenuLink icon={Settings} to="/settings">
          Settings
        </MenuLink>
        <MenuSeparator />
        <MenuItem icon={LogOut} destructive onSelect={logout}>
          Sign out
        </MenuItem>
      </div>
    </Menu>
  );
}
