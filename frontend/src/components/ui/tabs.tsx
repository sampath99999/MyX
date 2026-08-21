import * as React from "react";
import { NavLink } from "react-router-dom";
import { cn } from "@/lib/utils";

/*
  Two tab shapes, one look.

  Money's sub-navigation is routed (each tab is a URL), while filters like
  "All / Income / Expense" are local state. They were styled independently and
  ended up 4px different in height, which is exactly the kind of thing nobody
  reports and everybody feels.

  The look is the underline tab, not the pill: a row of pills reads as seven
  buttons competing for the same click, an underline reads as one control with a
  current position. On a phone the row scrolls horizontally rather than wrapping
  to two lines and moving the content down.
*/

export interface NavTabItem {
  to: string;
  label: string;
  end?: boolean;
  icon?: React.ElementType;
  /** A count or status shown after the label. */
  badge?: React.ReactNode;
}

export function NavTabs({
  items,
  className,
  /** Off when the containing bar already draws the rule the tabs sit on. */
  rule = true,
}: {
  items: NavTabItem[];
  className?: string;
  rule?: boolean;
}) {
  return (
    <div className={cn("relative -mx-4 sm:mx-0", className)}>
      <nav
        className="flex items-stretch gap-1 overflow-x-auto px-4 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label="Section"
      >
        {items.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "relative flex shrink-0 items-center gap-2 whitespace-nowrap border-b-2 px-3 pb-2.5 pt-2 text-sm font-medium transition-colors",
                isActive
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:border-border hover:text-foreground",
              )
            }
          >
            {item.icon && <item.icon className="size-4" />}
            {item.label}
            {item.badge != null && (
              <span className="tnum rounded-full bg-secondary px-1.5 py-0.5 text-[0.6875rem] font-medium leading-4 text-muted-foreground">
                {item.badge}
              </span>
            )}
          </NavLink>
        ))}
      </nav>
      {/* The hairline the active tab sits on, drawn under the whole row so the
          tabs look mounted on a rule rather than floating above one. */}
      {rule && <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-border" />}
    </div>
  );
}

/** A local-state segmented control: compact, for filters inside a toolbar. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  className,
  size = "default",
}: {
  value: T;
  onChange: (value: T) => void;
  options: { value: T; label: React.ReactNode; icon?: React.ElementType }[];
  className?: string;
  size?: "default" | "sm";
}) {
  return (
    <div
      role="tablist"
      className={cn(
        "inline-flex items-center gap-0.5 rounded-lg border border-border bg-secondary/50 p-0.5",
        className,
      )}
    >
      {options.map((o) => {
        const active = o.value === value;
        return (
          <button
            key={o.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.value)}
            className={cn(
              "flex items-center gap-1.5 rounded-md font-medium transition-colors",
              size === "sm" ? "h-8 px-2.5 text-xs sm:h-7" : "h-9 px-3 text-[0.8125rem] sm:h-8",
              active
                ? "bg-card text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {o.icon && <o.icon className="size-3.5" />}
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
