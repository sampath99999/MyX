import { useCallback, useState } from "react";
import { Plus, Wallet2, Trash2, Loader2, TrendingUp, TrendingDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
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

  const load = useCallback(async () => {
    const { investments } = await api.listInvestments();
    setInvestments(investments);
  }, []);

  const { loading, error, reload } = useAuthenticatedLoad(load);

  async function onDelete(id: number) {
    setDeletingId(id);
    try {
      await api.deleteInvestment(id);
      await reload();
    } finally {
      setDeletingId(null);
    }
  }

  const totalInvested = investments.reduce((s, i) => s + i.invested, 0);
  const totalCurrent = investments.reduce((s, i) => s + i.current, 0);
  const totalGain = totalCurrent - totalInvested;
  const totalGainPercent = totalInvested > 0 ? Math.round((totalGain / totalInvested) * 1000) / 10 : 0;

  return (
    <div className="p-6 lg:p-8 space-y-8">
      {/* Header row */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Investments</h2>
          {investments.length > 0 && (
            <p className="text-sm text-muted-foreground">
              {formatMoney(totalCurrent)} current value across {investments.length} holding
              {investments.length === 1 ? "" : "s"}
            </p>
          )}
        </div>
        <NewInvestmentDialog
          onCreated={reload}
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" />
              New investment
            </Button>
          }
        />
      </div>

      {investments.length > 0 && (
        <Card className="glass p-5 animate-in-up">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <p className="text-xs text-muted-foreground">Invested</p>
              <p className="mt-1 text-xl font-bold tracking-tight tabular-nums">
                {formatMoney(totalInvested)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Current value</p>
              <p className="mt-1 text-xl font-bold tracking-tight tabular-nums">
                {formatMoney(totalCurrent)}
              </p>
            </div>
            <div>
              <p className="text-xs text-muted-foreground">Gain / loss</p>
              <p
                className={cn(
                  "mt-1 flex items-center gap-1.5 text-xl font-bold tracking-tight tabular-nums",
                  totalGain >= 0 ? "text-emerald-400" : "text-rose-400",
                )}
              >
                {totalGain >= 0 ? (
                  <TrendingUp className="h-4 w-4" />
                ) : (
                  <TrendingDown className="h-4 w-4" />
                )}
                {totalGain >= 0 ? "+" : ""}
                {formatMoney(totalGain)}
                <span className="text-sm font-medium text-muted-foreground">
                  ({totalGainPercent >= 0 ? "+" : ""}
                  {totalGainPercent}%)
                </span>
              </p>
            </div>
          </div>
        </Card>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : error ? (
        <LoadError message={error} onRetry={reload} />
      ) : investments.length === 0 ? (
        <Card className="glass flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Wallet2 className="h-7 w-7 text-primary" />
          </div>
          <div>
            <p className="font-medium">No investments yet</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-xs">
              Add stocks, mutual funds, FDs, gold or crypto you hold and track their gain or loss.
            </p>
          </div>
          <NewInvestmentDialog
            onCreated={reload}
            trigger={
              <Button size="sm" variant="secondary">
                <Plus className="h-4 w-4" />
                Add your first holding
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {investments.map((inv, i) => {
            const meta = investmentTypeMeta(inv.type);
            const up = inv.gain >= 0;
            return (
              <Card
                key={inv.id}
                className="glass group relative p-5 animate-in-up"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <button
                  onClick={() => onDelete(inv.id)}
                  disabled={deletingId === inv.id}
                  title="Delete investment"
                  className="absolute right-4 top-4 text-muted-foreground/40 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 disabled:opacity-100"
                >
                  {deletingId === inv.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Trash2 className="h-4 w-4" />
                  )}
                </button>

                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-background/50 text-primary">
                    <meta.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{inv.name}</div>
                    <div className="text-xs text-muted-foreground">{meta.label}</div>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="flex items-baseline justify-between">
                    <span className="text-lg font-bold tracking-tight">{formatMoney(inv.current)}</span>
                    <span className="text-sm text-muted-foreground">of {formatMoney(inv.invested)}</span>
                  </div>
                  <div
                    className={cn(
                      "mt-1.5 flex items-center gap-1 text-sm font-medium",
                      up ? "text-emerald-400" : "text-rose-400",
                    )}
                  >
                    {up ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                    {up ? "+" : ""}
                    {formatMoney(inv.gain)} ({inv.gainPercent >= 0 ? "+" : ""}
                    {inv.gainPercent}%)
                  </div>
                </div>

                <EditInvestmentDialog
                  investment={inv}
                  onDone={reload}
                  trigger={
                    <Button variant="secondary" size="sm" className="mt-5 w-full">
                      Update value
                    </Button>
                  }
                />
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
