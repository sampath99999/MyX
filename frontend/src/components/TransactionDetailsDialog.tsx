import { useEffect, useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Loader2, Pencil, Trash2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import AddTransactionDialog from "@/components/AddTransactionDialog";
import { getCategoryIcon } from "@/components/CategoryPicker";
import { api, ApiError, formatMoney, type Transaction } from "@/lib/api";

/*
  One transaction, at its own address.

/money/transactions?view_id=N is a real link — a search result points at it,
  and so can a bookmark or a message to yourself. That means this cannot rely on
  the row already being on screen: the list holds the most recent hundred, and
  the thing being linked to is frequently older than that. So it takes whatever
  the page already has, and fetches by id when it does not have it.
*/

function formatDate(iso: string) {
  return new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border/40 py-3 last:border-0">
      <dt className="shrink-0 text-sm text-muted-foreground">{label}</dt>
      <dd className="min-w-0 text-right text-sm">{children}</dd>
    </div>
  );
}

export default function TransactionDetailsDialog({
  id,
  known,
  onClose,
  onChanged,
}: {
  id: number;
  /** The row from the list, when the page happens to already have it. */
  known?: Transaction;
  onClose: () => void;
  onChanged: () => void;
}) {
  const [transaction, setTransaction] = useState<Transaction | null>(known ?? null);
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (known) {
      setTransaction(known);
      return;
    }
    let current = true;
    api
      .getTransaction(id)
      .then((res) => current && setTransaction(res.transaction))
      .catch(
        (err) =>
          current &&
          setError(
            err instanceof ApiError && err.status === 404
              ? "That transaction no longer exists."
              : "Could not load that transaction.",
          ),
      );
    return () => {
      current = false;
    };
  }, [id, known]);

  async function remove() {
    setDeleting(true);
    try {
      await api.deleteTransaction(id);
      onChanged();
      onClose();
    } catch {
      setError("Could not delete it. Try again.");
      setDeleting(false);
    }
  }

  const income = transaction?.type === "income";
  const Icon = transaction ? getCategoryIcon(transaction.category) : null;

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transaction</DialogTitle>
          <DialogDescription className="sr-only">
            Details of a single transaction, with options to edit or delete it.
          </DialogDescription>
        </DialogHeader>

        {error ? (
          <p className="py-6 text-center text-sm text-destructive">{error}</p>
        ) : !transaction ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <>
            {/* The amount is the answer to "what was this?", so it leads. */}
            <div className="flex items-center gap-4 rounded-xl border border-border/60 p-4">
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ${
                  income ? "bg-emerald-500/15 text-emerald-400" : "bg-rose-500/15 text-rose-400"
                }`}
              >
                {income ? <ArrowUpRight className="h-5 w-5" /> : <ArrowDownLeft className="h-5 w-5" />}
              </span>
              <div className="min-w-0">
                <p className="text-2xl font-bold tracking-tight tabular-nums">
                  {income ? "+" : "−"}
                  {formatMoney(transaction.amount)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {income ? "Income" : "Expense"} · {formatDate(transaction.occurred_on)}
                </p>
              </div>
            </div>

            <dl className="mt-1">
              <Row label="Category">
                <span className="inline-flex items-center gap-1.5">
                  {Icon && <Icon className="h-3.5 w-3.5 text-muted-foreground" />}
                  {transaction.category}
                </span>
              </Row>
              <Row label="Note">
                {transaction.note ? (
                  <span className="break-words">{transaction.note}</span>
                ) : (
                  <span className="text-muted-foreground">—</span>
                )}
              </Row>
              <Row label="Date">{transaction.occurred_on}</Row>
              {transaction.created_at && (
                <Row label="Recorded">
                  <span className="text-muted-foreground">
                    {new Date(transaction.created_at.replace(" ", "T") + "Z").toLocaleString("en-IN", {
                      day: "numeric",
                      month: "short",
                      year: "numeric",
                      hour: "numeric",
                      minute: "2-digit",
                    })}
                  </span>
                </Row>
              )}
            </dl>

            <div className="mt-2 flex items-center gap-2">
              <AddTransactionDialog
                transaction={transaction}
                onCreated={() => {
                  onChanged();
                  onClose();
                }}
                trigger={
                  <Button variant="secondary" size="sm" className="flex-1">
                    <Pencil className="h-4 w-4" />
                    Edit
                  </Button>
                }
              />
              <Button
                variant="secondary"
                size="sm"
                onClick={remove}
                disabled={deleting}
                className="text-muted-foreground hover:text-destructive"
              >
                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
