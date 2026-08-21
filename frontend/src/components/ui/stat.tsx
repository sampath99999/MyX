import * as React from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight } from "lucide-react";
import { cn } from "@/lib/utils";

/*
  The KPI tile.

  Money, the dashboard and the admin page each had their own — same idea, three
  different paddings, and only one of them lined its numerals up. A number this
  size has to be tabular or a row of tiles looks crooked.
*/
export function Stat({
  label,
  value,
  sub,
  icon: Icon,
  tone = "default",
  to,
  className,
  children,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  sub?: React.ReactNode;
  icon?: React.ElementType;
  tone?: "default" | "positive" | "negative" | "warning";
  /** Makes the whole tile a link to the screen behind the number. */
  to?: string;
  className?: string;
  children?: React.ReactNode;
}) {
  const toneClass = {
    default: "",
    positive: "text-emerald-400",
    negative: "text-rose-400",
    warning: "text-amber-400",
  }[tone];

  const body = (
    <>
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-xs font-medium text-muted-foreground">{label}</p>
        {Icon && <Icon className="size-4 shrink-0 text-muted-foreground/70" />}
        {to && !Icon && (
          <ArrowUpRight className="size-4 shrink-0 text-muted-foreground/50 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
        )}
      </div>
      <p className={cn("tnum mt-2 text-2xl font-semibold tracking-tight", toneClass)}>{value}</p>
      {sub && <div className="mt-1.5 text-xs text-muted-foreground">{sub}</div>}
      {children}
    </>
  );

  const shell = "rounded-xl border border-border bg-card p-4";
  if (to) {
    return (
      <Link to={to} className={cn(shell, "card-interactive group block", className)}>
        {body}
      </Link>
    );
  }
  return <div className={cn(shell, className)}>{body}</div>;
}

/** A delta chip: "+12.4% vs last month". Green up, red down, grey flat. */
export function Delta({
  value,
  suffix = "",
  invert,
  className,
}: {
  /** Percentage change. Null renders nothing — no baseline to compare against. */
  value: number | null | undefined;
  suffix?: string;
  /** For spend, where a rise is bad news. */
  invert?: boolean;
  className?: string;
}) {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.round(value * 10) / 10;
  const good = invert ? rounded < 0 : rounded > 0;
  const flat = rounded === 0;
  return (
    <span
      className={cn(
        "tnum font-medium",
        flat ? "text-muted-foreground" : good ? "text-emerald-400" : "text-rose-400",
        className,
      )}
    >
      {rounded > 0 ? "+" : ""}
      {rounded}%{suffix}
    </span>
  );
}

/**
 * A progress bar. `tone` is derived from the ratio by the caller, because
 * "80% of budget spent" is amber while "80% of a savings goal" is excellent.
 */
export function Meter({
  value,
  tone = "default",
  className,
}: {
  /** 0–1, clamped. */
  value: number;
  tone?: "default" | "positive" | "warning" | "danger";
  className?: string;
}) {
  const pct = Math.max(0, Math.min(1, value)) * 100;
  const bar = {
    default: "bg-foreground/70",
    positive: "bg-emerald-400",
    warning: "bg-amber-400",
    danger: "bg-rose-400",
  }[tone];
  return (
    <div
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-foreground/10", className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cn("h-full rounded-full transition-[width] duration-500", bar)}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}
