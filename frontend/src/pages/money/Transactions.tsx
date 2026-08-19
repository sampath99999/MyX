import { useCallback, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  Upload,
  Loader2,
  Search,
  X,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import AddTransactionDialog from "@/components/AddTransactionDialog";
import ImportStatementDialog from "@/components/ImportStatementDialog";
import TransactionDetailsDialog from "@/components/TransactionDetailsDialog";
import LoadError from "@/components/LoadError";
import { getCategoryIcon } from "@/components/CategoryPicker";
import { api, formatMoney, type Transaction } from "@/lib/api";
import { useAuthenticatedLoad } from "@/lib/useAuthenticatedLoad";

/*
  The transaction ledger.

  The old list got three things wrong. It led with the category and demoted the
  note, so a row read "Health · Pharmacy" when the useful word was Pharmacy and
  the category was the metadata. It repeated the full date on every row, which
  is noise on the ninth entry of the same day. And its edit and delete buttons
  only appeared on hover, so on a phone they did not exist at all.

  This groups by day with a running total per day, leads with what the money was
  actually for, and moves editing into the row's own screen — which is a real
  address now (/money/transactions/:id), so it works by touch, by link and by
  back button.
*/

const PAGE_SIZE = 100;

const toDate = (iso: string) => new Date(`${iso}T00:00:00`);

/** "Today" / "Yesterday" / "Tue, 12 Aug" — a date only matters relative to now. */
function dayLabel(iso: string): string {
  const today = new Date();
  const offset = today.getTimezoneOffset() * 60_000;
  const todayIso = new Date(today.getTime() - offset).toISOString().slice(0, 10);
  const yesterdayIso = new Date(today.getTime() - offset - 86_400_000).toISOString().slice(0, 10);

  if (iso === todayIso) return "Today";
  if (iso === yesterdayIso) return "Yesterday";

  const d = toDate(iso);
  return d.toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "short",
    ...(d.getFullYear() === today.getFullYear() ? {} : { year: "numeric" }),
  });
}

type Filter = "all" | "income" | "expense";

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "income", label: "Income" },
  { value: "expense", label: "Expenses" },
];

export default function Transactions() {
  const [summary, setSummary] = useState<{ count: number } | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [loadingMore, setLoadingMore] = useState(false);
  const [exhausted, setExhausted] = useState(false);

  /*
    The details modal is driven by the URL, not by state: /money/transactions/:id
    is the same screen with one row opened. That makes it linkable — from search,
    from a bookmark — and makes the browser's back button close it, which is what
    people expect from a modal that has an address.
  */
  const { id } = useParams();
  const navigate = useNavigate();
  const openId = id != null && /^\d+$/.test(id) ? Number(id) : null;

  const load = useCallback(async () => {
    const [s, t] = await Promise.all([
      api.moneySummary(),
      api.listTransactions({ limit: PAGE_SIZE }),
    ]);
    setSummary(s);
    setTransactions(t.transactions);
    setExhausted(t.transactions.length < PAGE_SIZE);
  }, []);

  const { loading, error, reload } = useAuthenticatedLoad(load);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const res = await api.listTransactions({ limit: PAGE_SIZE, offset: transactions.length });
      setTransactions((prev) => [...prev, ...res.transactions]);
      if (res.transactions.length < PAGE_SIZE) setExhausted(true);
    } finally {
      setLoadingMore(false);
    }
  }

  /*
    Filtering is client-side over what is loaded, and says so below rather than
    pretending to have searched the whole history. Doing it on the server would
    mean a round trip per keystroke for a list that is already in memory.
  */
  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return transactions.filter((t) => {
      if (filter !== "all" && t.type !== filter) return false;
      if (!q) return true;
      return (
        t.category.toLowerCase().includes(q) ||
        (t.note ?? "").toLowerCase().includes(q) ||
        String(t.amount).includes(q)
      );
    });
  }, [transactions, filter, query]);

  /** Day buckets, in the order the API returned them (newest first). */
  const days = useMemo(() => {
    const groups: { date: string; items: Transaction[]; net: number }[] = [];
    for (const t of visible) {
      let group = groups[groups.length - 1];
      if (!group || group.date !== t.occurred_on) {
        group = { date: t.occurred_on, items: [], net: 0 };
        groups.push(group);
      }
      group.items.push(t);
      group.net += t.type === "income" ? t.amount : -t.amount;
    }
    return groups;
  }, [visible]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    for (const t of visible) {
      if (t.type === "income") income += t.amount;
      else expense += t.amount;
    }
    return { income, expense, net: income - expense };
  }, [visible]);

  const filtering = filter !== "all" || query.trim().length > 0;

  return (
    <div className="space-y-5 p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Transactions</h2>
          {summary && (
            <p className="text-sm text-muted-foreground">
              {summary.count.toLocaleString("en-IN")} total entries
            </p>
          )}
        </div>
        {/* One group, or `justify-between` spaces them apart as separate items. */}
        <div className="flex items-center gap-2">
          <ImportStatementDialog
            onImported={reload}
            trigger={
              <Button size="sm" variant="secondary">
                <Upload className="h-4 w-4" />
                Import
              </Button>
            }
          />
          <AddTransactionDialog
            onCreated={reload}
            trigger={
              <Button size="sm">
                <Plus className="h-4 w-4" />
                Add transaction
              </Button>
            }
          />
        </div>
      </div>

      {/* ---- What the rows below add up to ---- */}
      {!loading && !error && transactions.length > 0 && (
        <div className="grid grid-cols-3 gap-3">
          {[
            { label: "In", value: totals.income, tone: "text-emerald-400" },
            { label: "Out", value: totals.expense, tone: "text-rose-400" },
            {
              label: "Net",
              value: totals.net,
              tone: totals.net >= 0 ? "text-emerald-400" : "text-rose-400",
            },
          ].map((stat) => (
            <Card key={stat.label} className="glass p-4">
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                {stat.label}
              </p>
              <p className={`mt-1 text-lg font-bold tabular-nums sm:text-xl ${stat.tone}`}>
                {stat.label === "Net" && stat.value > 0 ? "+" : ""}
                {formatMoney(stat.value)}
              </p>
            </Card>
          ))}
        </div>
      )}

      {/* ---- Filters ---- */}
      {!loading && !error && transactions.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <div role="radiogroup" aria-label="Type" className="flex rounded-lg border border-border/60 p-0.5">
            {FILTERS.map((f) => (
              <button
                key={f.value}
                role="radio"
                aria-checked={filter === f.value}
                onClick={() => setFilter(f.value)}
                className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
                  filter === f.value
                    ? "bg-primary/15 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>

          <div className="relative min-w-0 flex-1 sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Filter by note, category or amount"
              aria-label="Filter transactions"
              className="w-full rounded-lg border border-border/60 bg-transparent py-2 pl-9 pr-8 text-sm outline-none placeholder:text-muted-foreground focus:border-ring"
            />
            {query && (
              <button
                onClick={() => setQuery("")}
                aria-label="Clear filter"
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          {filtering && (
            <p className="text-xs text-muted-foreground">
              {visible.length} of {transactions.length} loaded
            </p>
          )}
        </div>
      )}

      {loading ? (
        <Card className="glass flex items-center justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </Card>
      ) : error ? (
        <Card className="glass">
          <LoadError message={error} onRetry={reload} />
        </Card>
      ) : transactions.length === 0 ? (
        <Card className="glass flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Wallet className="h-6 w-6 text-primary" />
          </div>
          <p className="max-w-xs text-sm text-muted-foreground">
            No transactions yet. Add your first income or expense, or import a bank statement to
            bring your history in at once.
          </p>
          <AddTransactionDialog
            onCreated={reload}
            trigger={
              <Button size="sm" variant="secondary">
                <Plus className="h-4 w-4" />
                Add transaction
              </Button>
            }
          />
        </Card>
      ) : visible.length === 0 ? (
        <Card className="glass py-14 text-center">
          <p className="text-sm text-muted-foreground">
            Nothing here matches those filters.
          </p>
          <button
            onClick={() => {
              setQuery("");
              setFilter("all");
            }}
            className="mt-2 text-sm font-medium text-primary hover:underline"
          >
            Clear filters
          </button>
        </Card>
      ) : (
        <div className="space-y-5">
          {days.map((day) => (
            <section key={day.date}>
              {/* The date is said once per day instead of once per row. */}
              <div className="flex items-baseline justify-between gap-4 px-1 pb-2">
                <h3 className="text-sm font-semibold">{dayLabel(day.date)}</h3>
                <span
                  className={`text-xs font-medium tabular-nums ${
                    day.net >= 0 ? "text-emerald-400" : "text-muted-foreground"
                  }`}
                >
                  {day.net >= 0 ? "+" : "−"}
                  {formatMoney(Math.abs(day.net))}
                </span>
              </div>

              <Card className="glass overflow-hidden">
                <ul className="divide-y divide-border/50">
                  {day.items.map((t) => {
                    const income = t.type === "income";
                    const Icon = getCategoryIcon(t.category);
                    return (
                      <li key={t.id}>
                        {/*
                          The whole row is the link. Edit and delete used to sit
                          here behind a hover state, which meant they were
                          unreachable by touch; they live on the row's own screen
                          now, one tap away.
                        */}
                        <Link
                          to={`/money/transactions/${t.id}`}
                          className="flex items-center gap-3.5 px-4 py-3 transition-colors hover:bg-accent/40 sm:px-5"
                        >
                          <span
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                              income
                                ? "bg-emerald-500/15 text-emerald-400"
                                : "bg-rose-500/15 text-rose-400"
                            }`}
                          >
                            <Icon className="h-[1.1rem] w-[1.1rem]" />
                          </span>

                          <span className="min-w-0 flex-1">
                            {/* The note leads: it is what the money was for. The
                                category is how it is classified, which is a
                                detail — the old row had these the wrong way up. */}
                            <span className="block truncate text-sm font-medium">
                              {t.note?.trim() || t.category}
                            </span>
                            <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                              <span className="truncate rounded bg-muted/60 px-1.5 py-0.5">
                                {t.category}
                              </span>
                            </span>
                          </span>

                          <span
                            className={`shrink-0 text-sm font-semibold tabular-nums ${
                              income ? "text-emerald-400" : "text-foreground"
                            }`}
                          >
                            {income ? "+" : "−"}
                            {formatMoney(t.amount)}
                          </span>

                          {income ? (
                            <ArrowUpRight className="h-4 w-4 shrink-0 text-emerald-400/50" />
                          ) : (
                            <ArrowDownLeft className="h-4 w-4 shrink-0 text-muted-foreground/40" />
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </Card>
            </section>
          ))}

          {/*
            Paging is explicit rather than infinite-scroll: this is a ledger
            people scan to the bottom of, and a list that grows as you reach the
            end makes "the oldest one" unreachable.
          */}
          {!exhausted && (
            <div className="flex justify-center pt-1">
              <Button variant="secondary" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                Load older
              </Button>
            </div>
          )}
        </div>
      )}

      {openId !== null && (
        <TransactionDetailsDialog
          id={openId}
          // Handed the row when the list already has it, so opening one from the
          // page is instant and only a deep link pays for a fetch.
          known={transactions.find((t) => t.id === openId)}
          onChanged={reload}
          onClose={() => navigate("/money/transactions", { replace: true })}
        />
      )}
    </div>
  );
}
