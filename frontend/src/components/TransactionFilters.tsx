import { useEffect, useMemo, useState } from "react";
import { Search, X, SlidersHorizontal, ArrowUpDown } from "lucide-react";
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

const control =
  "rounded-lg border border-border/60 bg-transparent px-3 py-2 text-sm outline-none focus:border-ring";

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
        <div role="radiogroup" aria-label="Type" className="flex rounded-lg border border-border/60 p-0.5">
          {TYPES.map((t) => (
            <button
              key={t.value || "all"}
              role="radio"
              aria-checked={(query.type ?? "") === t.value}
              onClick={() => onChange({ ...query, type: t.value || undefined })}
              className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                (query.type ?? "") === t.value
                  ? "bg-primary/15 text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

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
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Search notes and categories"
            aria-label="Search transactions"
            className={`${control} w-full pl-9 pr-8`}
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
          className={`flex items-center gap-1.5 ${control} font-medium transition-colors hover:bg-accent`}
        >
          <SlidersHorizontal className="h-4 w-4" />
          More
          {activeCount > 0 && (
            <span className="rounded-full bg-primary/20 px-1.5 text-xs font-semibold text-primary">
              {activeCount}
            </span>
          )}
        </button>

        {activeCount > 0 && (
          <button onClick={clearAll} className="text-sm font-medium text-primary hover:underline">
            Clear
          </button>
        )}
      </div>

      {expanded && (
        <div className="grid grid-cols-1 gap-3 rounded-xl border border-border/60 p-4 sm:grid-cols-2 lg:grid-cols-4">
          <label className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Category</span>
            <select
              value={query.category ?? ""}
              onChange={(e) => onChange({ ...query, category: e.target.value || undefined })}
              className={`${control} w-full`}
            >
              <option value="">Every category</option>
              {categories.map((c) => (
                <option key={c.category} value={c.category}>
                  {c.category} ({c.n})
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-1.5">
            <span className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <ArrowUpDown className="h-3 w-3" />
              Sort
            </span>
            <select
              value={query.sort ?? "date_desc"}
              onChange={(e) => onChange({ ...query, sort: e.target.value as TransactionSort })}
              className={`${control} w-full`}
            >
              {SORTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>

          <div className="space-y-1.5">
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
                className={`${control} w-full`}
              />
              <span className="text-muted-foreground">–</span>
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
                className={`${control} w-full`}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs font-medium text-muted-foreground">Dates</span>
            <div className="flex items-center gap-2">
              <input
                type="date"
                aria-label="From date"
                value={query.from ?? ""}
                onChange={(e) => {
                  setRange("custom");
                  onChange({ ...query, from: e.target.value || undefined });
                }}
                className={`${control} w-full`}
              />
              <span className="text-muted-foreground">–</span>
              <input
                type="date"
                aria-label="To date"
                value={query.to ?? ""}
                onChange={(e) => {
                  setRange("custom");
                  onChange({ ...query, to: e.target.value || undefined });
                }}
                className={`${control} w-full`}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
