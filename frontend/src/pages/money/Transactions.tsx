import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  Upload,
  Loader2,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import AddTransactionDialog from "@/components/AddTransactionDialog";
import ImportStatementDialog from "@/components/ImportStatementDialog";
import TransactionDetailsDialog from "@/components/TransactionDetailsDialog";
import TransactionFilters from "@/components/TransactionFilters";
import LoadError from "@/components/LoadError";
import { getCategoryIcon } from "@/components/CategoryPicker";
import {
  api,
  formatMoney,
  type Transaction,
  type TransactionQuery,
  type TransactionTotals,
} from "@/lib/api";
import { useAuthenticatedLoad } from "@/lib/useAuthenticatedLoad";

/*
  The transaction ledger.

  The old list got three things wrong. It led with the category and demoted the
  note, so a row read "Health · Pharmacy" when the useful word was Pharmacy and
  the category was the metadata. It repeated the full date on every row, which
  is noise by the ninth entry of the same day. And its edit and delete buttons
  only appeared on hover, so on a phone they did not exist at all.

  This groups by day with a running total per day, leads with what the money was
  actually for, and moves editing into the row's own screen — which is a real
  address (/money/transactions/:id), so it works by touch, by link and by back
  button.

  Filtering is done by the database, not over the rows already on screen. The
  page holds one slice of the history; filtering that slice would answer "last
  March" with whatever part of last March happened to be loaded, which is worse
  than not offering the filter.
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

export default function Transactions() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [totals, setTotals] = useState<TransactionTotals | null>(null);
  const [categories, setCategories] = useState<{ category: string; n: number }[]>([]);
  const [query, setQuery] = useState<TransactionQuery>({});
  const [loadingMore, setLoadingMore] = useState(false);

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
    const res = await api.listTransactions({ ...query, limit: PAGE_SIZE, offset: 0 });
    setTransactions(res.transactions);
    setTotals(res.totals);
  }, [query]);

  const { loading, error, reload } = useAuthenticatedLoad(load);

  // The category list follows the data, not the filters — a filter that only
  // offers the categories currently visible cannot be used to change the view.
  useEffect(() => {
    api
      .transactionCategories()
      .then((res) => setCategories(res.categories))
      .catch(() => setCategories([]));
  }, []);

  async function loadMore() {
    setLoadingMore(true);
    try {
      const res = await api.listTransactions({
        ...query,
        limit: PAGE_SIZE,
        offset: transactions.length,
      });
      setTransactions((prev) => [...prev, ...res.transactions]);
    } finally {
      setLoadingMore(false);
    }
  }

  /** Day buckets, in whatever order the sort returned. */
  const days = useMemo(() => {
    const groups: { date: string; items: Transaction[]; net: number }[] = [];
    for (const t of transactions) {
      let group = groups[groups.length - 1];
      if (!group || group.date !== t.occurred_on) {
        group = { date: t.occurred_on, items: [], net: 0 };
        groups.push(group);
      }
      group.items.push(t);
      group.net += t.type === "income" ? t.amount : -t.amount;
    }
    return groups;
  }, [transactions]);

  /*
    Counting keys is not enough: clearing a range leaves `{ from: undefined }`
    behind, and that would read as "filtered" — turning the empty state into
    "nothing matches those filters" for an account that simply has none yet.
  */
  const filtered = Object.values(query).some((v) => v != null && v !== "");
  const moreToLoad = totals != null && transactions.length < totals.matched;

  /*
    Grouping by day only reads as grouping when the rows arrive in date order.
    Sorted by amount they do not, so the day headers are dropped and the date
    moves back onto each row.
  */
  const grouped = !query.sort || query.sort.startsWith("date");

  const rows = (items: Transaction[], showDate: boolean) => (
    <Card className="glass overflow-hidden">
      <ul className="divide-y divide-border/50">
        {items.map((t) => {
          const income = t.type === "income";
          const Icon = getCategoryIcon(t.category);
          return (
            <li key={t.id}>
              {/*
                The whole row is the link. Edit and delete used to sit here
                behind a hover state, which made them unreachable by touch; they
                live on the row's own screen now, one tap away.
              */}
              <Link
                to={`/money/transactions/${t.id}`}
                className="flex items-center gap-3.5 px-4 py-3 transition-colors hover:bg-accent/40 sm:px-5"
              >
                <span
                  className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
                    income ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
                  }`}
                >
                  <Icon className="h-[1.1rem] w-[1.1rem]" />
                </span>

                <span className="min-w-0 flex-1">
                  {/* The note leads: it is what the money was for. The category
                      is how it is classified, which is a detail — the old row
                      had these the wrong way up. */}
                  <span className="block truncate text-sm font-medium">
                    {t.note?.trim() || t.category}
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <span className="truncate rounded bg-muted/60 px-1.5 py-0.5">{t.category}</span>
                    {showDate && <span className="shrink-0">{dayLabel(t.occurred_on)}</span>}
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
  );

  return (
    <div className="space-y-5 p-6 lg:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold">Transactions</h2>
          {totals && (
            <p className="text-sm text-muted-foreground">
              {totals.matched.toLocaleString("en-IN")}
              {filtered ? " matching" : " total"} {totals.matched === 1 ? "entry" : "entries"}
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

      <TransactionFilters query={query} onChange={setQuery} categories={categories} />

      {/* What the filtered set adds up to — the whole set, not this page. */}
      {totals && totals.matched > 0 && (
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
          {filtered ? (
            <>
              <p className="text-sm text-muted-foreground">Nothing matches those filters.</p>
              <button
                onClick={() => setQuery({})}
                className="text-sm font-medium text-primary hover:underline"
              >
                Clear filters
              </button>
            </>
          ) : (
            <>
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
            </>
          )}
        </Card>
      ) : (
        <div className="space-y-5">
          {grouped ? (
            days.map((day) => (
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
                {rows(day.items, false)}
              </section>
            ))
          ) : (
            rows(transactions, true)
          )}

          {/*
            Paging is explicit rather than infinite-scroll: this is a ledger
            people scan to the bottom of, and a list that grows as you reach the
            end makes "the oldest one" unreachable.
          */}
          {moreToLoad && (
            <div className="flex flex-col items-center gap-1.5 pt-1">
              <Button variant="secondary" size="sm" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
                Load more
              </Button>
              <p className="text-xs text-muted-foreground">
                Showing {transactions.length} of {totals?.matched.toLocaleString("en-IN")}
              </p>
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
