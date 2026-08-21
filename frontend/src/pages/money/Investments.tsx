import { useCallback, useMemo, useState } from "react";
import { Plus, LineChart, Trash2, TrendingUp, TrendingDown, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Stat, Meter } from "@/components/ui/stat";
import { PageShell, PageHeader, Section, EmptyState } from "@/components/ui/page";
import { SkeletonCards } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/toast";
import { useConfirm } from "@/components/ui/confirm";
import NewInvestmentDialog from "@/components/NewInvestmentDialog";
import EditInvestmentDialog from "@/components/EditInvestmentDialog";
import LoadError from "@/components/LoadError";
import { api, formatMoney, type Investment } from "@/lib/api";
import { investmentTypeMeta } from "@/lib/investmentTypes";
import { useAuthenticatedLoad } from "@/lib/useAuthenticatedLoad";
import { cn } from "@/lib/utils";

export default function Investments() {
  const [investments, setInvestments] = useState<Investment[]>([]);
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const toast = useToast();
  const { confirm, confirmDialog } = useConfirm();

  const load = useCallback(async () => {
    const { investments } = await api.listInvestments();
    setInvestments(investments);
  }, []);

  const { loading, error, reload } = useAuthenticatedLoad(load);

  async function onDelete(inv: Investment) {
    const ok = await confirm({
      title: `Remove "${inv.name}"?`,
      description: "The holding and its recorded valuations are deleted. This cannot be undone.",
      confirmLabel: "Remove holding",
    });
    if (!ok) return;
    setDeletingId(inv.id);
    try {
      await api.deleteInvestment(inv.id);
      toast.success(`"${inv.name}" removed`);
      await reload();
    } finally {
      setDeletingId(null);
    }
  }

  const totals = useMemo(() => {
    const invested = investments.reduce((s, i) => s + i.invested, 0);
    const current = investments.reduce((s, i) => s + i.current, 0);
    const gain = current - invested;
    return {
      invested,
      current,
      gain,
      gainPercent: invested > 0 ? Math.round((gain / invested) * 1000) / 10 : 0,
    };
  }, [investments]);

  /*
    Allocation by asset class.

    A list of holdings tells you what you own; it does not tell you that 63% of
    it is in one mutual fund — which is the thing a portfolio screen exists to
    surface. Grouped here rather than server-side because the whole list is
    already loaded and it is a dozen rows at most.
  */
  const allocation = useMemo(() => {
    const byType = new Map<string, number>();
    for (const i of investments) byType.set(i.type, (byType.get(i.type) ?? 0) + i.current);
    return [...byType.entries()]
      .map(([type, value]) => ({
        type,
        value,
        meta: investmentTypeMeta(type as Investment["type"]),
        share: totals.current > 0 ? value / totals.current : 0,
      }))
      .sort((a, b) => b.value - a.value);
  }, [investments, totals.current]);

  return (
    <PageShell className="space-y-6">
      {confirmDialog}
      <PageHeader
        title="Investments"
        description="Holdings you value by hand — no market feed, no surprises. Update a value and the gain follows."
        actions={
          <NewInvestmentDialog
            onCreated={reload}
            trigger={
              <Button>
                <Plus />
                Add holding
              </Button>
            }
          />
        }
      />

      {!loading && !error && investments.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-3">
          <Stat label="Invested" value={formatMoney(totals.invested)} sub="What you put in" />
          <Stat
            label="Current value"
            value={formatMoney(totals.current)}
            sub={`${investments.length} holding${investments.length === 1 ? "" : "s"}`}
          />
          <Stat
            label="Gain / loss"
            value={`${totals.gain >= 0 ? "+" : ""}${formatMoney(totals.gain)}`}
            icon={totals.gain >= 0 ? TrendingUp : TrendingDown}
            tone={totals.gain >= 0 ? "positive" : "negative"}
            sub={`${totals.gainPercent >= 0 ? "+" : ""}${totals.gainPercent}% overall`}
          />
        </div>
      )}

      {loading ? (
        <SkeletonCards count={6} />
      ) : error ? (
        <Card className="p-4">
          <LoadError message={error} onRetry={reload} />
        </Card>
      ) : investments.length === 0 ? (
        <EmptyState
          icon={LineChart}
          title="No holdings tracked"
          description="Add the stocks, mutual funds, FDs, PPF, gold or crypto you hold. MyX keeps the invested amount and the value you last recorded, and derives the rest."
          action={
            <NewInvestmentDialog
              onCreated={reload}
              trigger={
                <Button>
                  <Plus />
                  Add your first holding
                </Button>
              }
            />
          }
        />
      ) : (
        <div className="grid gap-4 lg:grid-cols-3">
          <Section className="lg:col-span-2" title="Holdings">
            <div className="grid gap-3 md:grid-cols-2">
              {investments.map((inv) => {
                const meta = investmentTypeMeta(inv.type);
                const up = inv.gain >= 0;
                return (
                  <Card key={inv.id} className="flex flex-col p-5">
                    <div className="flex items-start gap-3">
                      <span className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-secondary text-muted-foreground">
                        <meta.icon className="size-4" />
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold">{inv.name}</p>
                        <p className="mt-0.5 text-xs text-muted-foreground">{meta.label}</p>
                      </div>
                      <button
                        onClick={() => onDelete(inv)}
                        disabled={deletingId === inv.id}
                        aria-label={`Remove ${inv.name}`}
                        className="-mr-1.5 -mt-1.5 flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-rose-400"
                      >
                        <Trash2 className="size-4" />
                      </button>
                    </div>

                    <div className="mt-5">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="tnum text-xl font-semibold tracking-tight">
                          {formatMoney(inv.current)}
                        </span>
                        <span className="tnum text-sm text-muted-foreground">
                          from {formatMoney(inv.invested)}
                        </span>
                      </div>
                      <p
                        className={cn(
                          "tnum mt-1.5 flex items-center gap-1.5 text-sm font-medium",
                          up ? "text-emerald-400" : "text-rose-400",
                        )}
                      >
                        {up ? (
                          <TrendingUp className="size-3.5" />
                        ) : (
                          <TrendingDown className="size-3.5" />
                        )}
                        {up ? "+" : ""}
                        {formatMoney(inv.gain)} ({inv.gainPercent >= 0 ? "+" : ""}
                        {inv.gainPercent}%)
                      </p>
                    </div>

                    {inv.notes && (
                      <p className="mt-3 line-clamp-2 text-xs leading-relaxed text-muted-foreground">
                        {inv.notes}
                      </p>
                    )}

                    <EditInvestmentDialog
                      investment={inv}
                      onDone={reload}
                      trigger={
                        <Button variant="outline" className="mt-4 w-full">
                          <Pencil />
                          Update value
                        </Button>
                      }
                    />
                  </Card>
                );
              })}
            </div>
          </Section>

          <Section title="Allocation" description="Where the portfolio sits today">
            <Card className="p-5">
              <ul className="space-y-4">
                {allocation.map((a) => (
                  <li key={a.type}>
                    <div className="flex items-center justify-between gap-3 text-sm">
                      <span className="flex min-w-0 items-center gap-2">
                        <a.meta.icon className="size-3.5 shrink-0 text-muted-foreground" />
                        <span className="truncate">{a.meta.label}</span>
                      </span>
                      <span className="tnum shrink-0 text-xs text-muted-foreground">
                        {Math.round(a.share * 100)}%
                      </span>
                    </div>
                    <Meter className="mt-2" value={a.share} />
                    <p className="tnum mt-1.5 text-xs text-muted-foreground">
                      {formatMoney(a.value)}
                    </p>
                  </li>
                ))}
              </ul>
            </Card>
          </Section>
        </div>
      )}
    </PageShell>
  );
}
