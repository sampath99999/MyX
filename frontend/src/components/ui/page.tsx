import * as React from "react";
import { cn } from "@/lib/utils";

/*
  The page frame.

  Every screen had invented its own: one used `p-6`, another `px-4 py-8`, a
  third `mx-auto max-w-6xl p-6 md:p-10`. The result was that moving between
  Money and Notes visibly shifted the left edge of the content. There is one
  container now, and pages say how wide they want to be, not how far in.
*/
export function PageShell({
  className,
  width = "wide",
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement> & { width?: "wide" | "narrow" | "full" }) {
  return (
    <div
      className={cn(
        "mx-auto w-full px-4 py-6 sm:px-6 lg:px-8 lg:py-8",
        width === "wide" && "max-w-[1400px]",
        width === "narrow" && "max-w-3xl",
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * The title block: an optional eyebrow, the heading, one line of context, and
 * the page's primary actions pinned to the right.
 */
export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  className,
}: {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between",
        className,
      )}
    >
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-[1.75rem]">{title}</h1>
        {description && (
          <p className="mt-1.5 text-sm text-muted-foreground">{description}</p>
        )}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/**
 * A titled block of content. Replaces the ad-hoc `<h2 className="text-lg
 * font-semibold mb-4">` that opened most sections.
 */
export function Section({
  title,
  description,
  actions,
  className,
  children,
}: {
  title?: React.ReactNode;
  description?: React.ReactNode;
  actions?: React.ReactNode;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("min-w-0", className)}>
      {(title || actions) && (
        <div className="mb-3 flex items-end justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-base font-semibold tracking-tight">{title}</h2>}
            {description && (
              <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          {actions && <div className="flex shrink-0 items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/**
 * What a screen shows when it has nothing to show.
 *
 * The app used to print "No transactions yet." in muted grey and stop there,
 * which tells you the state but not what to do about it. An empty state is the
 * best onboarding surface a product has: it is guaranteed to be seen exactly
 * when the user does not yet know what the screen is for.
 */
export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  secondary,
  className,
  compact,
}: {
  icon?: React.ElementType;
  title: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  secondary?: React.ReactNode;
  className?: string;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-card/40 text-center",
        compact ? "px-6 py-10" : "px-6 py-16",
        className,
      )}
    >
      {Icon && (
        <div className="mb-4 flex size-11 items-center justify-center rounded-xl border border-border bg-background text-muted-foreground">
          <Icon className="size-5" />
        </div>
      )}
      <p className="text-sm font-semibold">{title}</p>
      {description && (
        <p className="mt-1.5 max-w-sm text-sm leading-relaxed text-muted-foreground">
          {description}
        </p>
      )}
      {(action || secondary) && (
        <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
          {action}
          {secondary}
        </div>
      )}
    </div>
  );
}
