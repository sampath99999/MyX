import { cn } from "@/lib/utils";

/**
 * A loading placeholder shaped like the thing it is standing in for.
 *
 * Every screen used to show a centred spinner while it loaded, so the layout
 * appeared all at once and jumped. These hold the shape, which makes the load
 * feel shorter than it is and stops the content shifting under a cursor.
 */
export function Skeleton({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("skeleton rounded-md", className)} {...props} />;
}

/** The stat-tile row that opens most pages. */
export function SkeletonStats({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="mt-3 h-7 w-28" />
          <Skeleton className="mt-2.5 h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

/** A list of rows — transactions, tasks, notes. */
export function SkeletonRows({ count = 6 }: { count?: number }) {
  return (
    <div className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="flex items-center gap-3 p-4">
          <Skeleton className="size-9 shrink-0 rounded-lg" />
          <div className="min-w-0 flex-1">
            <Skeleton className="h-3.5 w-40 max-w-[60%]" />
            <Skeleton className="mt-2 h-3 w-24" />
          </div>
          <Skeleton className="h-4 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}

/** A grid of cards — goals, checklists, memories. */
export function SkeletonCards({ count = 6 }: { count?: number }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-5">
          <Skeleton className="size-10 rounded-lg" />
          <Skeleton className="mt-4 h-4 w-32" />
          <Skeleton className="mt-2.5 h-3 w-full" />
          <Skeleton className="mt-2 h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}
