import { useEffect, useMemo, useState } from "react";
import { Search, X, SlidersHorizontal, ArrowUpDown } from "lucide-react";
import { Segmented } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { TransactionQuery, TransactionSort } from "@/lib/api";

/*
  The ledger's filter bar.

  Two rows, deliberately. The first holds what people reach for constantly —
  type, a date range, free text — and is always visible. The second holds
  category, amount bounds and sort, and stays folded away until asked for,
  because a screen that opens with nine controls above the data reads as a
  report builder rather than a list of what you spent.

  Everything here is a controlled view of one `TransactionQuery`. The page owns
  that object and refetches when it changes; this component never fetches.
*/

export type DateRange = "all" | "this_month" | "last_month" | "last_3" | "this_year" | "custom";

const RANGES: { value: DateRange; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "this_month", label: "This month" },
  { value: "last_month", label: "Last month" },
  { value: "last_3", label: "Last 3 months" },
  { value: "this_year", label: "This year" },
  { value: "custom", label: "Custom…" },
];

const SORTS: { value: TransactionSort; label: string }[] = [
  { value: "date_desc", label: "Newest first" },
  { value: "date_asc", label: "Oldest first" },
  { value: "amount_desc", label: "Largest first" },
  { value: "amount_asc", label: "Smallest first" },
];

const TYPES: { value: "" | "income" | "expense"; label: string }[] = [
  { value: "", label: "All" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expenses" },
];

/** Local calendar date — a ledger's "this month" is the user's, not UTC's. */
const localIso = (d: Date) =>
  new Date(d.getTime() - d.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);

/** Resolves a named range to the bounds the API wants. */
export function rangeBounds(range: DateRange): { from?: string; to?: string } {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();

  switch (range) {
    case "this_month":
      return { from: localIso(new Date(year, month, 1)), to: localIso(new Date(year, month + 1, 0)) };
    case "last_month":
      return { from: localIso(new Date(year, month - 1, 1)), to: localIso(new Date(year, month, 0)) };
    case "last_3":
      // Two whole months back plus the current one, which is what people mean.
      return { from: localIso(new Date(year, month - 2, 1)), to: localIso(new Date(year, month + 1, 0)) };
    case "this_year":
      return { from: `${year}-01-01`, to: `${year}-12-31` };
    default:
      return {};
  }
}

/* Matches ui/input so a native select and a shadcn field sit on the same line
   without one being two pixels taller than the other. */
const control =
  "h-9 rounded-md border border-input bg-transparent px-3 text-sm shadow-sm outline-none transition-[color,box-shadow,border-color] focus:border-ring focus:ring-[3px] focus:ring-ring/25";

export default function TransactionFilters({
  query,
  onChange,
  categories,
}: {
  query: TransactionQuery;
  onChange: (next: TransactionQuery) => void;
  categories: { category: string; n: number }[];
}) {
  const [range, setRange] = useState<DateRange>("all");
  const [expanded, setExpanded] = useState(false);
  const [text, setText] = useState(query.q ?? "");

  /*
    Typing must not fire a request per keystroke, and the field must stay
    responsive while it waits — so the input is local state and the query is
    updated on a delay.
  */
  useEffect(() => {
    const timer = setTimeout(() => {
      if ((query.q ?? "") !== text) onChange({ ...query, q: text || undefined });
    }, 300);
    return () => clearTimeout(timer);
  }, [text, query, onChange]);

  // Keeps the box in step when the page clears filters from outside.
  useEffect(() => setText(query.q ?? ""), [query.q]);

  function pickRange(next: DateRange) {
    setRange(next);
    // "Custom" sets no bounds of its own — it just reveals the two date fields.
    if (next === "custom") {
      setExpanded(true);
      return;
    }
    const bounds = rangeBounds(next);
    // Assigned rather than spread, so "All time" actively clears the previous
    // range instead of leaving it in place.
    onChange({ ...query, from: bounds.from, to: bounds.to });
  }

  const activeCount = useMemo(() => {
    let n = 0;
    if (query.type) n++;
    if (query.from || query.to) n++;
    if (query.category) n++;
    if (query.min != null || query.max != null) n++;
    if (query.q) n++;
    if (query.sort && query.sort !== "date_desc") n++;
    return n;
  }, [query]);

  function clearAll() {
    setRange("all");
    setText("");
    onChange({});
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        {/* Type — the one filter used often enough to deserve permanent buttons. */}
        <Segmented
          value={query.type ?? ""}
          onChange={(v) => onChange({ ...query, type: v || undefined })}
          options={TYPES.map((t) => ({ value: t.value, label: t.label }))}
        />

        <select
          aria-label="Date range"
          value={range}
          onChange={(e) => pickRange(e.target.value as DateRange)}
          className={control}
        >
          {RANGES.map((r) => (
            <option key={r.value} value={r.value}>
              {r.label}
            </option>
          ))}
        </select>

        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search notes and categories"
            aria-label="Search transactions"
            className={cn(control, "w-full pl-9 pr-8 placeholder:text-muted-foreground/60")}
          />
          {text && (
            <button
              onClick={() => setText("")}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          )}
        </div>

        <button
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className={cn(control, "flex items-center gap-1.5 font-medium hover:bg-accent")}
        >
          <SlidersHorizontal className="size-3.5" />
          Filters
          {activeCount > 0 && <Badge variant="solid">{activeCount}</Badge>}
        </button>

        {activeCount > 0 && (
          <button
            onClick={clearAll}
            className="text-sm font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
          >
            Clear
          </button>
        )}
      </div>

      {expanded && (
        <div className="animate-in-up space-y-4 rounded-xl border border-border bg-card p-4">
          {/*
            Three columns, not four. The two date fields used to live here as a
            fourth, and a native date input will not render below about 150px —
            at a quarter of the panel they had 110px and spilled off the right
            edge. They have their own row below now, and only when they are
            actually needed.
          */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <label className="min-w-0 space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Category</span>
              <select
                value={query.category ?? ""}
                onChange={(e) => onChange({ ...query, category: e.target.value || undefined })}
                className={cn(control, "w-full")}
              >
                <option value="">Every category</option>
                {categories.map((c) => (
                  <option key={c.category} value={c.category}>
                    {c.category} ({c.n})
                  </option>
                ))}
              </select>
            </label>

            <label className="min-w-0 space-y-1.5">
              <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                <ArrowUpDown className="h-3 w-3" />
                Sort
              </span>
              <select
                value={query.sort ?? "date_desc"}
                onChange={(e) => onChange({ ...query, sort: e.target.value as TransactionSort })}
                className={cn(control, "w-full")}
              >
                {SORTS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </label>

            <div className="min-w-0 space-y-1.5">
              <span className="text-xs font-medium text-muted-foreground">Amount (₹)</span>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  placeholder="Min"
                  aria-label="Minimum amount"
                  value={query.min ?? ""}
                  onChange={(e) =>
                    onChange({ ...query, min: e.target.value === "" ? undefined : Number(e.target.value) })
                  }
                  className={cn(control, "w-full min-w-0")}
                />
                <span className="shrink-0 text-muted-foreground">–</span>
                <input
                  type="number"
                  inputMode="decimal"
                  min={0}
                  placeholder="Max"
                  aria-label="Maximum amount"
                  value={query.max ?? ""}
                  onChange={(e) =>
                    onChange({ ...query, max: e.target.value === "" ? undefined : Number(e.target.value) })
                  }
                  className={cn(control, "w-full min-w-0")}
                />
              </div>
            </div>
          </div>

          {/*
            Only for "Custom…". The dropdown above already covers this month,
            last month, the last three and this year, which is what people pick
            almost every time — two empty date fields sitting under them is a
            control that mostly exists to be ignored.
          */}
          {range === "custom" && (
            <div className="space-y-1.5 border-t border-border pt-4">
              <span className="text-xs font-medium text-muted-foreground">Between</span>
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="date"
                  aria-label="From date"
                  value={query.from ?? ""}
                  onChange={(e) => onChange({ ...query, from: e.target.value || undefined })}
                  className={cn(control, "min-w-[9.5rem] flex-1 sm:max-w-[12rem] sm:flex-none")}
                />
                <span className="shrink-0 text-muted-foreground">–</span>
                <input
                  type="date"
                  aria-label="To date"
                  value={query.to ?? ""}
                  onChange={(e) => onChange({ ...query, to: e.target.value || undefined })}
                  className={cn(control, "min-w-[9.5rem] flex-1 sm:max-w-[12rem] sm:flex-none")}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
