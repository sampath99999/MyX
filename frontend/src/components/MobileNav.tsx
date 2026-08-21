import { useEffect, useState } from "react";
import { NavLink, useLocation } from "react-router-dom";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { Menu as MenuIcon, X, Settings } from "lucide-react";
import Logo from "@/components/Logo";
import AccountMenu from "@/components/AccountMenu";
import ThemeToggle from "@/components/ThemeToggle";
import { type NavGroup } from "@/components/navigation";
import { cn } from "@/lib/utils";

/*
  The phone's navigation, as a drawer.

  This replaces a bottom tab bar, and the reasons are worth writing down because
  a tab bar is the more obvious choice.

  It carried six destinations. Five is the usual ceiling for a reason: at 375px
  each tab was 63px wide with a 10px label, and at 320px it was 53px. Six tabs
  is also more than the bar could ever grow to hold, so every new module would
  have made it worse.

  It cost 60px of every screen, permanently, plus the 48px add button floating
  just above it — roughly the bottom sixth of a phone given over to chrome for
  navigation people use a handful of times an hour. Against a 56px header that
  was 14% of the viewport before any content.

  And it was a second navigation model. Money already has its own row of seven
  tabs, Tasks has its own — so a phone showed two horizontal nav strips at once,
  one of which moved you between modules and one within them, and nothing but
  position distinguished them.

  A drawer costs one tap to open and gives the structure back: the same groups
  as the desktop sidebar, in the same order, with settings and the account where
  they are on desktop. One model, and every screen gets its 60px back.
*/

export default function MobileNav({ groups }: { groups: NavGroup[] }) {
  const [open, setOpen] = useState(false);
  const { pathname } = useLocation();

  // Tapping a destination should close the thing you tapped it in. Keyed on the
  // path rather than on each link's onClick so it cannot be forgotten on one.
  useEffect(() => setOpen(false), [pathname]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Trigger asChild>
        <button
          aria-label="Open menu"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground md:hidden"
        >
          <MenuIcon className="size-[1.15rem]" />
        </button>
      </DialogPrimitive.Trigger>

      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-[2px] data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className={cn(
            "fixed inset-y-0 left-0 z-50 flex w-[17rem] max-w-[85vw] flex-col border-r border-border bg-card p-3 shadow-lg",
            "data-[state=closed]:animate-out data-[state=open]:animate-in data-[state=closed]:slide-out-to-left data-[state=open]:slide-in-from-left duration-200",
          )}
          // The drawer runs the full height, so it owns the notch and the home
          // indicator rather than letting the shell's padding handle them.
          style={{
            paddingTop: "max(0.75rem, env(safe-area-inset-top, 0px))",
            paddingBottom: "max(0.75rem, env(safe-area-inset-bottom, 0px))",
          }}
        >
          <DialogPrimitive.Title className="sr-only">Menu</DialogPrimitive.Title>

          <div className="flex items-center justify-between">
            <Logo to="/dashboard" label="MyX — dashboard" size={28} className="px-1" />
            <DialogPrimitive.Close
              aria-label="Close menu"
              className="flex size-9 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <X className="size-[1.15rem]" />
            </DialogPrimitive.Close>
          </div>

          <nav className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto">
            {groups.map((group) => (
              <div key={group.label}>
                <p className="eyebrow mb-1.5 px-3">{group.label}</p>
                <div className="flex flex-col gap-0.5">
                  {group.items.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) =>
                        cn(
                          "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[0.9375rem] font-medium transition-colors",
                          isActive
                            ? "bg-brand/10 text-foreground"
                            : "text-muted-foreground active:bg-accent/60",
                        )
                      }
                    >
                      {({ isActive }) => (
                        <>
                          <span
                            className={cn(
                              "absolute left-0 top-1/2 h-5 w-[3px] -translate-y-1/2 rounded-r-full bg-brand",
                              isActive ? "opacity-100" : "opacity-0",
                            )}
                          />
                          <item.icon
                            className={cn("size-[1.15rem] shrink-0", isActive && "text-brand")}
                          />
                          {item.label}
                        </>
                      )}
                    </NavLink>
                  ))}
                </div>
              </div>
            ))}
          </nav>

          <div className="mt-3 flex flex-col gap-1.5 border-t border-border pt-3">
            <NavLink
              to="/settings"
              className={({ isActive }) =>
                cn(
                  "relative flex items-center gap-3 rounded-lg px-3 py-2.5 text-[0.9375rem] font-medium transition-colors",
                  isActive ? "bg-brand/10 text-foreground" : "text-muted-foreground",
                )
              }
            >
              <Settings className="size-[1.15rem] shrink-0" />
              Settings
            </NavLink>

            <div className="flex items-center gap-1">
              <AccountMenu className="min-w-0 flex-1" />
              <ThemeToggle />
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
