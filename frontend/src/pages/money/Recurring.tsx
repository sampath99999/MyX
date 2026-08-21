import { useCallback, useMemo, useState } from "react";
import {
  Plus,
  Repeat,
  Trash2,
  Check,
  Pause,
  Play,
  ArrowUpRight,
  ArrowDownLeft,
  MoreHorizontal,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Stat } from "@/components/ui/stat";
import { PageShell, PageHeader, Section, EmptyState } from "@/components/ui/page";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import NewRecurringDialog from "@/components/NewRecurringDialog";
import DetectedRecurring from "@/components/DetectedRecurring";
import LoadError from "@/components/LoadError";
import { getCategoryIcon } from "@/components/CategoryPicker";
import { api, formatMoney, type Recurring, type Frequency } from "@/lib/api";
import { useAuthenticatedLoad } from "@/lib/useAuthenticatedLoad";
import { cn } from "@/lib/utils";

/*
  Bills and subscriptions.

  It was a grid of cards, two across, each with its own footer of three
  controls — so eight bills filled a screen and a: "what is due this week?"
  needed scrolling and arithmetic. It is a list now, sorted by urgency and split
  into "due" and "later", which is the only ordering anyone actually reads it
  in. Paused items sink to the bottom rather than sitting greyed out between two
  live ones.
*/

function freqLabel(frequency: Frequency, interval: number): string {
  const unit = { daily: "day", weekly: "week", monthly: "month", yearly: "year" }[frequency];
  return interval === 1 ? `Every ${unit}` : `Every ${interval} ${unit}s`;
}

function daysUntil(iso: string) {
  return Math.ceil((new Date(iso + "T00:00:00").getTime() - Date.now()) / 86_400_000);
}

function dueStatus(iso: string): { text: string; tone: "overdue" | "soon" | "normal" } {
  const days = daysUntil(iso);
  if (days < 0) return { text: `${-days}d overdue`, tone: "overdue" };
  if (days === 0) return { text: "Due today", tone: "soon" };
  if (days === 1) return { text: "Tomorrow", tone: "soon" };
  if (days <= 7) return { text: `In ${days} days`, tone: "soon" };
  const d = new Date(iso + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
  });
  return { text: d, tone: "normal" };
}

export default function Recurring() {
  const [items, setItems] = useState<Recurring[]>([]);
  const [summary, setSummary] = useState<{ monthlyIncome: number; monthlyExpense: number } | null>(
    null,
  );
  const [busyId, setBusyId] = useState<number | null>(null);
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();

  const load = useCallback(async () => {
    const [r, s] = await Promise.all([api.listRecurring(), api.recurringSummary()]);
    setItems(r.recurring);
    setSummary(s);
  }, []);

  const { loading, error, reload } = useAuthenticatedLoad(load);

  async function pay(r: Recurring) {
    setBusyId(r.id);
    try {
      // Send the due date the UI is showing. If a previous tap already booked
      // this bill the server will have rolled next_due forward and rejects the
      // duplicate instead of charging twice.
      await api.payRecurring(r.id, r.next_due);
      toast.success(`${r.name} marked paid`, `${formatMoney(r.amount)} logged to your ledger.`);
      await reload();
    } catch (e) {
      toast.error("Could not mark it paid", e instanceof Error ? e.message : undefined);
    } finally {
      setBusyId(null);
    }
  }

  async function toggleActive(r: Recurring) {
    setBusyId(r.id);
    try {
      await api.updateRecurring(r.id, { active: !r.active });
      toast.success(r.active ? `${r.name} paused` : `${r.name} resumed`);
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function remove(r: Recurring) {
    const ok = await confirm({
      title: `Delete "${r.name}"?`,
      description:
        "The schedule is removed. Transactions already logged from it are kept — this only stops it coming round again.",
      confirmLabel: "Delete bill",
    });
    if (!ok) return;
    setBusyId(r.id);
    try {
      await api.deleteRecurring(r.id);
      toast.success(`${r.name} deleted`);
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  /*
    Three buckets. "Due" is anything overdue or inside a week — the set that
    needs a decision today; everything else is scheduled; paused is parked.
  */
  const { due, later, paused } = useMemo(() => {
    const sorted = [...items].sort((a, b) => a.next_due.localeCompare(b.next_due));
    return {
      due: sorted.filter((r) => r.active && daysUntil(r.next_due) <= 7),
      later: sorted.filter((r) => r.active && daysUntil(r.next_due) > 7),
      paused: sorted.filter((r) => !r.active),
    };
  }, [items]);

  const overdueCount = due.filter((r) => daysUntil(r.next_due) < 0).length;
  const dueTotal = due.reduce((n, r) => n + (r.type === "expense" ? r.amount : 0), 0);

  const row = (r: Recurring) => {
    const Icon = getCategoryIcon(r.category);
    const income = r.type === "income";
    const status = dueStatus(r.next_due);
    return (
      <div
        key={r.id}
        className={cn(
          "flex items-center gap-3 px-4 py-3 transition-colors hover:bg-accent/40",
          !r.active && "opacity-60",
        )}
      >
        <span
          className={cn(
            "flex size-9 shrink-0 items-center justify-center rounded-lg",
            status.tone === "overdue" && r.active
              ? "bg-rose-400/10 text-rose-400"
              : income
                ? "bg-emerald-400/10 text-emerald-400"
                : "bg-secondary text-muted-foreground",
          )}
        >
          <Icon className="size-4" />
        </span>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{r.name}</span>
            {!r.active && <Badge variant="outline">Paused</Badge>}
          </div>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {freqLabel(r.frequency, r.interval)} · {r.category}
          </p>
        </div>

        <div className="hidden shrink-0 sm:block">
          <Badge
            variant={
              !r.active
                ? "outline"
                : status.tone === "overdue"
                  ? "danger"
                  : status.tone === "soon"
                    ? "warning"
                    : "outline"
            }
          >
            {status.text}
          </Badge>
        </div>

        <div
          className={cn(
            "tnum flex w-24 shrink-0 items-center justify-end gap-1 text-sm font-medium sm:w-28",
            income ? "text-emerald-400" : "text-foreground",
          )}
        >
          {income ? (
            <ArrowUpRight className="size-3.5" />
          ) : (
            <ArrowDownLeft className="size-3.5 text-muted-foreground/50" />
          )}
          {formatMoney(r.amount)}
        </div>

        {r.active && (
          <Button
            size="sm"
            variant={status.tone === "overdue" ? "default" : "outline"}
            onClick={() => pay(r)}
            loading={busyId === r.id}
            className="hidden shrink-0 sm:inline-flex"
          >
            {busyId !== r.id && <Check />}
            {income ? "Received" : "Paid"}
          </Button>
        )}

        <Menu
          align="end"
          trigger={
            <button
              aria-label={`Actions for ${r.name}`}
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <MoreHorizontal className="size-4" />
            </button>
          }
        >
          {r.active && (
            <MenuItem icon={Check} onSelect={() => pay(r)} className="sm:hidden">
              Mark {income ? "received" : "paid"}
            </MenuItem>
          )}
          <MenuItem icon={r.active ? Pause : Play} onSelect={() => toggleActive(r)}>
            {r.active ? "Pause" : "Resume"}
          </MenuItem>
          <MenuSeparator />
          <MenuItem icon={Trash2} destructive onSelect={() => remove(r)}>
            Delete
          </MenuItem>
        </Menu>
      </div>
    );
  };

  return (
    <PageShell className="space-y-6">
      {confirmDialog}
      <PageHeader
        title="Bills & subscriptions"
        description="Everything that comes round again. Mark one paid and it logs the transaction and rolls its own due date forward."
        actions={
          <NewRecurringDialog
            onCreated={reload}
            trigger={
              <Button>
                <Plus />
                Add bill
              </Button>
            }
          />
        }
      />

      {!loading && !error && items.length > 0 && summary && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat
            label="Committed each month"
            value={formatMoney(summary.monthlyExpense)}
            icon={Repeat}
            sub={`${items.filter((r) => r.active && r.type === "expense").length} active bills`}
          />
          <Stat
            label="Regular income"
            value={summary.monthlyIncome > 0 ? formatMoney(summary.monthlyIncome) : "—"}
            icon={ArrowUpRight}
            tone={summary.monthlyIncome > 0 ? "positive" : "default"}
            sub={summary.monthlyIncome > 0 ? "Expected every month" : "Nothing scheduled"}
          />
          <Stat
            label="Due inside a week"
            value={formatMoney(dueTotal)}
            icon={Check}
            tone={overdueCount > 0 ? "negative" : "default"}
            sub={
              overdueCount > 0
                ? `${overdueCount} already overdue`
                : `${due.length} item${due.length === 1 ? "" : "s"} coming up`
            }
          />
        </div>
      )}

      {/* Sits above the list on purpose: it is only ever shown when there is
          something to offer, and it is most useful right after an import. */}
      {!loading && !error && <DetectedRecurring onAdded={reload} />}

      {loading ? (
        <SkeletonRows count={5} />
      ) : error ? (
        <Card className="p-4">
          <LoadError message={error} onRetry={reload} />
        </Card>
      ) : items.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No recurring items yet"
          description="Add the bills and subscriptions you pay every month — rent, Netflix, insurance — or your regular income. Marking one paid logs the transaction for you."
          action={
            <NewRecurringDialog
              onCreated={reload}
              trigger={
                <Button>
                  <Plus />
                  Add your first bill
                </Button>
              }
            />
          }
        />
      ) : (
        <div className="space-y-6">
          {due.length > 0 && (
            <Section
              title="Due now"
              description={`${formatMoney(dueTotal)} across ${due.length} item${due.length === 1 ? "" : "s"}`}
            >
              <Card className="divide-y divide-border overflow-hidden">{due.map(row)}</Card>
            </Section>
          )}
          {later.length > 0 && (
            <Section title="Scheduled" description="Further out than a week">
              <Card className="divide-y divide-border overflow-hidden">{later.map(row)}</Card>
            </Section>
          )}
          {paused.length > 0 && (
            <Section title="Paused" description="Not counted in any total above">
              <Card className="divide-y divide-border overflow-hidden">{paused.map(row)}</Card>
            </Section>
          )}
        </div>
      )}
    </PageShell>
  );
}
