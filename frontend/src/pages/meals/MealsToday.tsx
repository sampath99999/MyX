import { useCallback, useState } from "react";
import {
  ChevronLeft,
  ChevronRight,
  CopyPlus,
  Plus,
  Settings2,
  Trash2,
  UtensilsCrossed,
} from "lucide-react";
import { PageShell, EmptyState } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import { SkeletonRows } from "@/components/ui/skeleton";
import LoadError from "@/components/LoadError";
import CalorieRing from "@/components/meals/CalorieRing";
import FoodPicker from "@/components/meals/FoodPicker";
import TargetsDialog from "@/components/meals/TargetsDialog";
import { useAuthenticatedLoad } from "@/lib/useAuthenticatedLoad";
import { useToast } from "@/components/ui/toast";
import { api, ApiError, MEAL_LABELS, type MealDay, type MealName } from "@/lib/api";
import { useAddIntent } from "@/lib/addIntent";

/*
  The day.

  One call fills this screen — entries, per-meal subtotals, the day's totals,
  the targets and what is left — because it is the screen the module opens on
  and four round trips from a phone is how a screen comes to feel slow.

  Deleting is immediate with an Undo in the toast rather than a confirmation
  dialog. That follows the rule the rest of the app settled on: an undo is
  faster than a confirm and safer, because a confirm gets dismissed reflexively.
*/

const iso = (d: Date) => d.toLocaleDateString("en-CA");

/**
 * Which meal the clock suggests.
 *
 * Arriving from the Add menu means "record what I just ate", and at 1pm that is
 * lunch. Guessing costs nothing when wrong — the picker's title says which meal
 * it is filling and every section has its own Add button — and asking would put
 * a question between someone and the thing they came to do.
 */
function mealForNow(now = new Date()): MealName {
  const hour = now.getHours();
  if (hour < 11) return "breakfast";
  if (hour < 16) return "lunch";
  if (hour < 21) return "dinner";
  return "snack";
}

function dayLabel(date: string): string {
  const today = iso(new Date());
  const yesterday = iso(new Date(Date.now() - 86_400_000));
  if (date === today) return "Today";
  if (date === yesterday) return "Yesterday";
  return new Date(`${date}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

export default function MealsToday() {
  const { success, error: errorToast } = useToast();
  const [date, setDate] = useState(() => iso(new Date()));
  const [day, setDay] = useState<MealDay | null>(null);
  const [picker, setPicker] = useState<MealName | null>(null);
  const [targetsOpen, setTargetsOpen] = useState(false);

  /* Sent here by the Add menu: open the picker on whichever meal it is now. */
  useAddIntent(() => {
    setDate(iso(new Date()));
    setPicker(mealForNow());
  });

  const load = useCallback(async () => {
    setDay(await api.mealDay(date));
  }, [date]);

  const { loading, error, reload } = useAuthenticatedLoad(load);

  const shiftDay = (delta: number) => {
    const next = new Date(`${date}T00:00:00`);
    next.setDate(next.getDate() + delta);
    setDate(iso(next));
  };

  const isToday = date === iso(new Date());

  async function removeEntry(id: number, name: string) {
    // Optimistic: the row goes now and the refetch confirms it. Waiting for a
    // round trip to remove a row the user just deleted feels broken.
    setDay((prev) =>
      prev
        ? {
            ...prev,
            meals: prev.meals.map((m) => ({
              ...m,
              entries: m.entries.filter((e) => e.id !== id),
            })),
          }
        : prev,
    );
    try {
      await api.deleteMealEntry(id);
      success(`${name} removed`);
      void reload();
    } catch (err) {
      errorToast("Could not remove that", err instanceof ApiError ? err.message : "Try again.");
      void reload();
    }
  }

  async function copyYesterday() {
    const from = iso(new Date(new Date(`${date}T00:00:00`).getTime() - 86_400_000));
    try {
      const res = await api.copyMeals({ from, to: date });
      success(`${res.copied} items copied`, "From the day before.");
      void reload();
    } catch (err) {
      errorToast(
        "Nothing to copy",
        err instanceof ApiError ? err.message : "The day before has nothing logged.",
      );
    }
  }

  return (
    <PageShell width="narrow" className="space-y-6">
      {/* Day switcher. A food log is read backwards as often as forwards —
          "what did I eat yesterday" is the second most common question it
          answers — so moving between days is a first-class control, not a
          date field hidden behind a menu. */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => shiftDay(-1)}
            aria-label="Previous day"
            className="flex size-9 items-center justify-center rounded-lg border border-border/60 transition-colors hover:bg-accent"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => shiftDay(1)}
            disabled={isToday}
            aria-label="Next day"
            className="flex size-9 items-center justify-center rounded-lg border border-border/60 transition-colors hover:bg-accent disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>
          <h1 className="ml-2 text-xl font-semibold tracking-tight">{dayLabel(date)}</h1>
        </div>

        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={copyYesterday}
            title="Copy the day before"
            aria-label="Copy the day before"
            className="flex size-9 items-center justify-center rounded-lg border border-border/60 transition-colors hover:bg-accent"
          >
            <CopyPlus className="size-4" />
          </button>
          <button
            type="button"
            onClick={() => setTargetsOpen(true)}
            title="Daily targets"
            aria-label="Daily targets"
            className="flex size-9 items-center justify-center rounded-lg border border-border/60 transition-colors hover:bg-accent"
          >
            <Settings2 className="size-4" />
          </button>
        </div>
      </div>

      {loading && !day ? (
        <SkeletonRows count={5} />
      ) : error ? (
        <LoadError message={error} onRetry={reload} />
      ) : day ? (
        <>
          <CalorieRing totals={day.totals} targets={day.targets} remaining={day.remaining} />

          {day.logged === 0 && (
            <EmptyState
              icon={UtensilsCrossed}
              compact
              title="Nothing logged yet"
              description={
                isToday
                  ? "Add what you have eaten so far, or copy the day before."
                  : "Nothing was logged on this day."
              }
              action={
                <Button onClick={() => setPicker("breakfast")}>
                  <Plus /> Add food
                </Button>
              }
            />
          )}

          <div className="space-y-4">
            {day.meals.map((section) => (
              <section key={section.meal} className="rounded-2xl border border-border/60">
                <header className="flex items-center justify-between gap-3 border-b border-border/60 px-4 py-3">
                  <div className="flex items-baseline gap-2">
                    <h2 className="text-sm font-semibold">{MEAL_LABELS[section.meal]}</h2>
                    {section.totals.kcal > 0 && (
                      <span className="tnum text-xs text-muted-foreground">
                        {section.totals.kcal.toLocaleString("en-IN")} kcal
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setPicker(section.meal)}
                    className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-medium text-primary transition-colors hover:bg-accent"
                  >
                    <Plus className="size-3.5" /> Add
                  </button>
                </header>

                {section.entries.length === 0 ? (
                  <p className="px-4 py-4 text-xs text-muted-foreground">Nothing yet.</p>
                ) : (
                  <ul className="divide-y divide-border/60">
                    {section.entries.map((entry) => (
                      <li key={entry.id} className="group flex items-center gap-3 px-4 py-2.5">
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm">{entry.name}</p>
                          <p className="tnum mt-0.5 text-xs text-muted-foreground">
                            {entry.quantity !== 1 && `${entry.quantity} × `}
                            {entry.serving_label} · P {Math.round(entry.protein)}g · C{" "}
                            {Math.round(entry.carbs)}g · F {Math.round(entry.fat)}g
                          </p>
                        </div>
                        <span className="tnum text-sm font-medium">
                          {entry.kcal.toLocaleString("en-IN")}
                        </span>
                        <button
                          type="button"
                          onClick={() => removeEntry(entry.id, entry.name)}
                          aria-label={`Remove ${entry.name}`}
                          className="text-muted-foreground opacity-0 transition-opacity hover:text-destructive focus:opacity-100 group-hover:opacity-100"
                        >
                          <Trash2 className="size-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            ))}
          </div>
        </>
      ) : null}

      <FoodPicker
        open={picker !== null}
        meal={picker ?? "snack"}
        date={date}
        onOpenChange={(open) => !open && setPicker(null)}
        onLogged={reload}
      />

      <TargetsDialog
        open={targetsOpen}
        onOpenChange={setTargetsOpen}
        onSaved={reload}
      />
    </PageShell>
  );
}
