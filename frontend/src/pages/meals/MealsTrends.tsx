import { useCallback, useState } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Flame, Scale, TrendingDown, Loader2 } from "lucide-react";
import { PageShell, EmptyState } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { SkeletonRows } from "@/components/ui/skeleton";
import LoadError from "@/components/LoadError";
import { useAuthenticatedLoad } from "@/lib/useAuthenticatedLoad";
import { useToast } from "@/components/ui/toast";
import { api, ApiError, type MealTrends, type WeightLog } from "@/lib/api";
import { useChartTheme } from "@/lib/chart";
import { cn } from "@/lib/utils";

/*
  Whether any of it is working.

  Two charts, and the second is the point. Calories alone are an input with no
  output — a number you can hit every day for a month while nothing happens,
  because the target was an estimate in the first place. Weight is the
  measurement that tells you whether the estimate was right, so it sits directly
  under the intake chart rather than in a module of its own.
*/

const WINDOWS = [7, 30, 90];

function Stat({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl border border-border/60 p-4">
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Icon className="size-3.5" />
        {label}
      </p>
      <p className="tnum mt-1.5 text-xl font-semibold tracking-tight">{value}</p>
      {hint && <p className="mt-0.5 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

const shortDay = (day: string) =>
  new Date(`${day}T00:00:00`).toLocaleDateString(undefined, { day: "numeric", month: "short" });

export default function MealsTrendsPage() {
  const { success, error: errorToast } = useToast();
  const [days, setDays] = useState(30);
  const [trends, setTrends] = useState<MealTrends | null>(null);
  const [weight, setWeight] = useState<WeightLog | null>(null);
  const [entry, setEntry] = useState("");
  const [saving, setSaving] = useState(false);
  // The app's shared chart palette, which resolves for light mode too. Hardcoding
  // --color-primary here drew a near-white line in dark and a near-black one in
  // light, neither of which is the accent anyone expects.
  const theme = useChartTheme();

  const load = useCallback(async () => {
    const [t, w] = await Promise.all([api.mealTrends(days), api.weightLog(Math.max(days, 90))]);
    setTrends(t);
    setWeight(w);
  }, [days]);

  const { loading, error, reload } = useAuthenticatedLoad(load);

  async function logWeight(e: React.FormEvent) {
    e.preventDefault();
    const kg = Number(entry);
    if (!Number.isFinite(kg) || kg <= 0) return;
    setSaving(true);
    try {
      await api.logWeight({ kg });
      success("Weight logged", `${kg} kg today`);
      setEntry("");
      void reload();
    } catch (err) {
      errorToast("Could not save", err instanceof ApiError ? err.message : "Try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <PageShell width="narrow" className="space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Trends</h1>
        <div className="flex gap-1 rounded-lg border border-border/60 p-0.5">
          {WINDOWS.map((n) => (
            <button
              key={n}
              type="button"
              onClick={() => setDays(n)}
              className={cn(
                "rounded-md px-2.5 py-1 text-xs font-medium transition-colors",
                days === n ? "bg-accent" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {n}d
            </button>
          ))}
        </div>
      </div>

      {loading && !trends ? (
        <SkeletonRows count={4} />
      ) : error ? (
        <LoadError message={error} onRetry={reload} />
      ) : trends ? (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat
              icon={Flame}
              label="Average"
              value={trends.average.kcal ? trends.average.kcal.toLocaleString("en-IN") : "—"}
              /* Averaged over days actually logged, and the label says so —
                 dividing a week's food by seven when four were recorded invents
                 a diet nobody was on. */
              hint={`over ${trends.logged_days} logged day${trends.logged_days === 1 ? "" : "s"}`}
            />
            <Stat
              icon={Flame}
              label="Protein"
              value={trends.average.protein ? `${trends.average.protein} g` : "—"}
              hint={`target ${Math.round(trends.target.protein)} g`}
            />
            <Stat
              icon={TrendingDown}
              label="Under target"
              value={`${trends.on_target_days}/${trends.logged_days}`}
              hint="days within budget"
            />
            <Stat
              icon={Flame}
              label="Streak"
              value={trends.streak ? `${trends.streak}` : "—"}
              hint={trends.streak === 1 ? "day logged" : "days logged"}
            />
          </div>

          <section className="rounded-2xl border border-border/60 p-4">
            <h2 className="text-sm font-semibold">Calories</h2>
            {trends.logged_days === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">
                Nothing logged in this window yet.
              </p>
            ) : (
              <div className="mt-4">
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={trends.series} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                    <defs>
                      <linearGradient id="kcalFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor={theme.net} stopOpacity={0.35} />
                        <stop offset="100%" stopColor={theme.net} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid stroke={theme.grid} vertical={false} />
                    <XAxis
                      dataKey="day"
                      tickFormatter={shortDay}
                      stroke={theme.axis}
                      fontSize={11}
                      minTickGap={24}
                      axisLine={false}
                      tickLine={false}
                      dy={6}
                    />
                    <YAxis stroke={theme.axis} fontSize={11} axisLine={false} tickLine={false} width={48} />
                    <Tooltip
                      contentStyle={{
                        background: theme.tooltipBg,
                        border: `1px solid ${theme.tooltipBorder}`,
                        borderRadius: 12,
                        fontSize: 12,
                      }}
                      cursor={{ stroke: theme.cursor }}
                      labelFormatter={(d) => shortDay(String(d))}
                      formatter={(v) => [`${Number(v).toLocaleString("en-IN")} kcal`, "Eaten"]}
                    />
                    {/* The target as a line rather than a number in a corner:
                        the question is never "what is my target", it is
                        "how often am I over it". */}
                    <ReferenceLine y={trends.target.kcal} strokeDasharray="4 4" stroke={theme.axis} />
                    <Area
                      type="monotone"
                      dataKey="kcal"
                      stroke={theme.net}
                      strokeWidth={2}
                      fill="url(#kcalFill)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>

          <section className="rounded-2xl border border-border/60 p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="text-sm font-semibold">Weight</h2>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  The measurement that says whether the calorie target was right.
                </p>
              </div>
              <form onSubmit={logWeight} className="flex items-center gap-2">
                <span className="relative">
                  <input
                    value={entry}
                    onChange={(e) => setEntry(e.target.value)}
                    inputMode="decimal"
                    placeholder={weight?.latest ? String(weight.latest.kg) : "70.5"}
                    className="w-24 rounded-lg border border-input bg-transparent py-1.5 pl-3 pr-8 text-sm outline-none focus:border-ring"
                  />
                  <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
                    kg
                  </span>
                </span>
                <Button size="sm" type="submit" disabled={!entry || saving}>
                  {saving ? <Loader2 className="size-3.5 animate-spin" /> : "Log"}
                </Button>
              </form>
            </div>

            {!weight || weight.readings.length === 0 ? (
              <EmptyState
                icon={Scale}
                compact
                className="mt-4"
                title="No readings yet"
                description="Log your weight every few days. The trend matters; any single reading is mostly water."
              />
            ) : (
              <>
                <div className="mt-4 flex items-baseline gap-3">
                  <span className="tnum text-2xl font-semibold">{weight.latest?.kg} kg</span>
                  {weight.change_kg !== null && weight.readings.length > 1 && (
                    <span
                      className={cn(
                        "tnum text-sm font-medium",
                        weight.change_kg < 0 ? "text-emerald-400" : "text-muted-foreground",
                      )}
                    >
                      {weight.change_kg > 0 ? "+" : ""}
                      {weight.change_kg.toFixed(1)} kg
                    </span>
                  )}
                </div>
                <div className="mt-3">
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart
                      data={weight.readings}
                      margin={{ top: 4, right: 4, bottom: 0, left: -20 }}
                    >
                      <CartesianGrid stroke={theme.grid} vertical={false} />
                      <XAxis
                        dataKey="day"
                        tickFormatter={shortDay}
                        stroke={theme.axis}
                        fontSize={11}
                        minTickGap={24}
                        axisLine={false}
                        tickLine={false}
                        dy={6}
                      />
                      <YAxis
                        stroke={theme.axis}
                        fontSize={11}
                        axisLine={false}
                        tickLine={false}
                        width={48}
                        domain={["dataMin - 1", "dataMax + 1"]}
                      />
                      <Tooltip
                        contentStyle={{
                          background: theme.tooltipBg,
                          border: `1px solid ${theme.tooltipBorder}`,
                          borderRadius: 12,
                          fontSize: 12,
                        }}
                        labelFormatter={(d) => shortDay(String(d))}
                        formatter={(v) => [`${Number(v)} kg`, "Weight"]}
                      />
                      <Line
                        type="monotone"
                        dataKey="kg"
                        stroke={theme.net}
                        strokeWidth={2}
                        dot={{ r: 2.5 }}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </>
            )}
          </section>
        </>
      ) : null}
    </PageShell>
  );
}
