import { useCallback, useState } from "react";
import {
  Plus,
  ArrowUpRight,
  ArrowDownLeft,
  Wallet,
  Trash2,
  Pencil,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import AddTransactionDialog from "@/components/AddTransactionDialog";
import LoadError from "@/components/LoadError";
import { api, formatMoney, type Transaction } from "@/lib/api";
import { useAuthenticatedLoad } from "@/lib/useAuthenticatedLoad";

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function Transactions() {
  const [summary, setSummary] = useState<{ count: number } | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [s, t] = await Promise.all([api.moneySummary(), api.listTransactions({ limit: 100 })]);
    setSummary(s);
    setTransactions(t.transactions);
  }, []);

  const { loading, error, reload } = useAuthenticatedLoad(load);

  async function onDelete(id: number) {
    setDeletingId(id);
    try {
      await api.deleteTransaction(id);
      await reload();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold">Transactions</h2>
          {summary && (
            <p className="text-sm text-muted-foreground">{summary.count} total entries</p>
          )}
        </div>
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

      <Card className="glass overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : error ? (
          <LoadError message={error} onRetry={reload} />
        ) : transactions.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-16 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Wallet className="h-6 w-6 text-primary" />
            </div>
            <p className="text-sm text-muted-foreground max-w-xs">
              No transactions yet. Add your first income or expense to see your balance grow.
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
          </div>
        ) : (
          <ul className="divide-y divide-border/50">
            {transactions.map((t) => {
              const income = t.type === "income";
              return (
                <li
                  key={t.id}
                  className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-accent/40"
                >
                  <div
                    className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                      income ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
                    }`}
                  >
                    {income ? (
                      <ArrowUpRight className="h-5 w-5" />
                    ) : (
                      <ArrowDownLeft className="h-5 w-5" />
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-medium">{t.category}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {formatDate(t.occurred_on)}
                      {t.note ? ` · ${t.note}` : ""}
                    </div>
                  </div>

                  <div
                    className={`text-sm font-semibold tabular-nums ${
                      income ? "text-emerald-400" : "text-foreground"
                    }`}
                  >
                    {income ? "+" : "−"}
                    {formatMoney(t.amount)}
                  </div>

                  <AddTransactionDialog
                    transaction={t}
                    onCreated={reload}
                    trigger={
                      <button
                        title="Edit"
                        className="text-muted-foreground/50 opacity-0 transition-opacity hover:text-foreground group-hover:opacity-100"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    }
                  />

                  <button
                    onClick={() => onDelete(t.id)}
                    disabled={deletingId === t.id}
                    title="Delete"
                    className="text-muted-foreground/50 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 disabled:opacity-100"
                  >
                    {deletingId === t.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="h-4 w-4" />
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </div>
  );
}
