import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { Plus, Receipt, Upload, ChevronDown, ArrowUpRight, ArrowDownLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageShell, PageHeader, EmptyState } from "@/components/ui/page";
import { SkeletonRows } from "@/components/ui/skeleton";
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
import { useAddIntent } from "@/lib/addIntent";
import { cn } from "@/lib/utils";

/*
  The transaction ledger.

  It groups by day with a running total per day, leads with what the money was
  actually for rather than its category, and moves editing into the row's own
  screen — which is a real address (?view_id=N), so it works by touch, by link
  and by back button.

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
  /* Set when the Add menu navigated here asking for the form. */
  const [addOpen, setAddOpen] = useState(false);
  useAddIntent(() => setAddOpen(true));

  /*
    The details modal is driven by the URL, not by state: ?view_id=N is the same
    screen with one row opened. That keeps it linkable — from search, from a
    bookmark — and lets the browser's back button close it, which is what people
    expect from a modal that has an address.

    A query parameter rather than a path segment, and the distinction matters
    beyond taste. A modal laid over a screen is a *state* of that screen, not a
    different screen, and the app treats a change of pathname as a change of
    screen: AppLayout resets the scroller on one. While this was
    /money/transactions/:id, opening a row scrolled the ledger back to the top,
    and (via a `key` that has since gone) threw away the loaded pages and the
    filters with it.
  */
  const [searchParams, setSearchParams] = useSearchParams();
  const rawId = searchParams.get("view_id");
  const openId = rawId && /^[0-9]+$/.test(rawId) ? Number(rawId) : null;

  /** Close by dropping the parameter, leaving anything else in the URL alone. */
  const closeDetails = () => {
    const next = new URLSearchParams(searchParams);
    next.delete("view_id");
    setSearchParams(next, { replace: true });
  };

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
    <Card className="overflow-hidden">
      <ul className="divide-y divide-border">
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
                to={`/money/transactions?view_id=${t.id}`}
                className="group flex items-center gap-3.5 px-4 py-3 transition-colors hover:bg-accent/50"
              >
                <span
                  className={cn(
                    "flex size-9 shrink-0 items-center justify-center rounded-lg",
                    income
                      ? "bg-emerald-400/10 text-emerald-400"
                      : "bg-secondary text-muted-foreground",
                  )}
                >
                  <Icon className="size-4" />
                </span>

                <span className="min-w-0 flex-1">
                  {/* The note leads: it is what the money was for. The category
                      is how it is classified, which is a detail. */}
                  <span className="block truncate text-sm font-medium">
                    {t.note?.trim() || t.category}
                  </span>
                  <span className="mt-0.5 flex items-center gap-2 text-xs text-muted-foreground">
                    <span className="truncate">{t.category}</span>
                    {showDate && (
                      <>
                        <span className="text-muted-foreground/40">·</span>
                        <span className="shrink-0">{dayLabel(t.occurred_on)}</span>
                      </>
                    )}
                  </span>
                </span>

                <span
                  className={cn(
                    "tnum shrink-0 text-sm font-medium",
                    income ? "text-emerald-400" : "text-foreground",
                  )}
                >
                  {income ? "+" : "−"}
                  {formatMoney(t.amount)}
                </span>
                <ChevronDown className="size-4 shrink-0 -rotate-90 text-muted-foreground/30 transition-transform group-hover:translate-x-0.5" />
              </Link>
            </li>
          );
        })}
      </ul>
    </Card>
  );

  return (
    <PageShell className="space-y-5">
      <PageHeader
        title="Transactions"
        description={
          totals
            ? `${totals.matched.toLocaleString("en-IN")}${filtered ? " matching" : ""} ${
                totals.matched === 1 ? "entry" : "entries"
              }`
            : "Every rupee in and out, in one ledger."
        }
        actions={
          <>
            <ImportStatementDialog
              onImported={reload}
              trigger={
                <Button variant="outline">
                  <Upload />
                  Import
                </Button>
              }
            />
            <AddTransactionDialog
              onCreated={reload}
              // Opened directly when the app-wide Add menu sent us here.
              open={addOpen || undefined}
              onOpenChange={setAddOpen}
              trigger={
                <Button>
                  <Plus />
                  Add
                </Button>
              }
            />
          </>
        }
      />

      <TransactionFilters query={query} onChange={setQuery} categories={categories} />

      {/* What the filtered set adds up to — the whole set, not this page. */}
      {totals && totals.matched > 0 && (
        <div className="grid grid-cols-3 divide-x divide-border overflow-hidden rounded-xl border border-border bg-card">
          {[
            { label: "In", value: totals.income, tone: "text-emerald-400", icon: ArrowUpRight },
            { label: "Out", value: totals.expense, tone: "text-foreground", icon: ArrowDownLeft },
            {
              label: "Net",
              value: totals.net,
              tone: totals.net >= 0 ? "text-emerald-400" : "text-rose-400",
              icon: null,
            },
          ].map((stat) => (
            <div key={stat.label} className="min-w-0 p-4">
              <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                {stat.icon && <stat.icon className="size-3.5" />}
                {stat.label}
              </p>
              <p className={cn("tnum mt-1.5 truncate text-lg font-semibold", stat.tone)}>
                {stat.label === "Net" && stat.value > 0 ? "+" : ""}
                {formatMoney(stat.value)}
              </p>
            </div>
          ))}
        </div>
      )}

      {loading ? (
        <SkeletonRows count={8} />
      ) : error ? (
        <Card>
          <LoadError message={error} onRetry={reload} />
        </Card>
      ) : transactions.length === 0 ? (
        filtered ? (
          <EmptyState
            icon={Receipt}
            title="Nothing matches those filters"
            description="Try a wider date range, or clear the filters to see everything again."
            action={
              <Button variant="outline" onClick={() => setQuery({})}>
                Clear filters
              </Button>
            }
          />
        ) : (
          <EmptyState
            icon={Receipt}
            title="No transactions yet"
            description="Add your first income or expense, or import a bank statement to bring your whole history in at once."
            action={
              <AddTransactionDialog
                onCreated={reload}
                trigger={
                  <Button>
                    <Plus />
                    Add transaction
                  </Button>
                }
              />
            }
            secondary={
              <ImportStatementDialog
                onImported={reload}
                trigger={
                  <Button variant="outline">
                    <Upload />
                    Import a statement
                  </Button>
                }
              />
            }
          />
        )
      ) : (
        <div className="space-y-5">
          {grouped ? (
            days.map((day) => (
              <section key={day.date}>
                {/* The date is said once per day instead of once per row. */}
                <div className="flex items-baseline justify-between gap-4 px-1 pb-2">
                  <h3 className="text-[0.8125rem] font-semibold text-muted-foreground">
                    {dayLabel(day.date)}
                  </h3>
                  <span
                    className={cn(
                      "tnum text-xs font-medium",
                      day.net >= 0 ? "text-emerald-400" : "text-muted-foreground",
                    )}
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
            <div className="flex flex-col items-center gap-2 pt-1">
              <Button variant="outline" onClick={loadMore} loading={loadingMore}>
                {!loadingMore && <ChevronDown />}
                Load more
              </Button>
              <p className="tnum text-xs text-muted-foreground">
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
          onClose={closeDetails}
        />
      )}
    </PageShell>
  );
}
