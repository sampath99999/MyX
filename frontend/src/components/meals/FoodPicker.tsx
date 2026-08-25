import { useEffect, useMemo, useRef, useState } from "react";
import { Clock, Loader2, Minus, Plus, Search, Sparkles, Star, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api, ApiError, MEAL_LABELS, type Food, type MealName } from "@/lib/api";
import { parseFoodLine } from "@/lib/foodParse";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

/*
  Adding food, in as few taps as possible.

  Everything here is arranged around one number: how long it takes to record a
  meal you have eaten a hundred times before. Most logging is repetition, so the
  dialog opens on what you ate recently and what you eat often, and typing is
  the fallback rather than the entry point. A picker that opens on an empty
  search box makes you work for the common case and reserves its convenience for
  the rare one.

  The typed line is parsed rather than searched: "2 idli, 1 filter coffee" logs
  two things at once. Names that match nothing are reported as unmatched and
  never invented — a food log that quietly makes numbers up is worse than none.
*/

function Portion({
  quantity,
  onChange,
}: {
  quantity: number;
  onChange: (next: number) => void;
}) {
  // Half-serving steps: the difference between one and two rotis matters, the
  // difference between 1.0 and 1.1 does not, and small steps make the control
  // slow to use for the portions people actually eat.
  const step = (delta: number) => onChange(Math.max(0.5, Math.round((quantity + delta) * 2) / 2));

  return (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={() => step(-0.5)}
        disabled={quantity <= 0.5}
        aria-label="Smaller portion"
        className="flex size-7 items-center justify-center rounded-lg border border-border/60 transition-colors hover:bg-accent disabled:opacity-40"
      >
        <Minus className="size-3.5" />
      </button>
      <span className="tnum w-8 text-center text-sm font-semibold">{quantity}</span>
      <button
        type="button"
        onClick={() => step(0.5)}
        aria-label="Larger portion"
        className="flex size-7 items-center justify-center rounded-lg border border-border/60 transition-colors hover:bg-accent"
      >
        <Plus className="size-3.5" />
      </button>
    </div>
  );
}

function FoodRow({
  food,
  onAdd,
}: {
  food: Food;
  onAdd: (food: Food, quantity: number) => void;
}) {
  const [quantity, setQuantity] = useState(1);

  return (
    <li className="flex items-center gap-3 rounded-xl border border-border/60 p-2.5">
      <button
        type="button"
        onClick={() => onAdd(food, quantity)}
        className="min-w-0 flex-1 text-left"
      >
        <p className="truncate text-sm font-medium">{food.name}</p>
        <p className="tnum mt-0.5 text-xs text-muted-foreground">
          {Math.round(food.kcal * quantity)} kcal · {food.serving_label}
          {quantity !== 1 && ` × ${quantity}`} · P {Math.round(food.protein * quantity)}g
        </p>
      </button>
      <Portion quantity={quantity} onChange={setQuantity} />
      <Button size="sm" onClick={() => onAdd(food, quantity)}>
        Add
      </Button>
    </li>
  );
}

export default function FoodPicker({
  open,
  meal,
  date,
  onOpenChange,
  onLogged,
}: {
  open: boolean;
  meal: MealName;
  date: string;
  onOpenChange: (open: boolean) => void;
  onLogged: () => void;
}) {
  const { success, error: errorToast } = useToast();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Food[] | null>(null);
  const [suggestions, setSuggestions] = useState<{ recent: Food[]; frequent: Food[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setQuery("");
    setResults(null);
    api
      .foodSuggestions()
      .then(setSuggestions)
      .catch(() => setSuggestions({ recent: [], frequent: [] }));
    // Focus after the dialog's own animation, or the caret lands nowhere.
    const timer = setTimeout(() => inputRef.current?.focus(), 120);
    return () => clearTimeout(timer);
  }, [open]);

  // Debounced, because this fires on every keystroke and each one is a D1 read.
  useEffect(() => {
    if (!open) return;
    const term = query.trim();
    if (term.length < 2) {
      setResults(null);
      return;
    }
    setSearching(true);
    const timer = setTimeout(() => {
      api
        .searchFoods({ q: term, limit: 40 })
        .then((res) => setResults(res.foods))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 200);
    return () => clearTimeout(timer);
  }, [query, open]);

  /*
    What a typed line would log, if it names more than one thing. Shown as an
    offer rather than applied automatically: "dal" is both a search term and a
    complete line, and guessing wrong either way is worse than asking.
  */
  const parsed = useMemo(() => {
    const items = parseFoodLine(query);
    return items.length > 1 ? items : [];
  }, [query]);

  async function logOne(food: Food, quantity: number) {
    setBusy(true);
    try {
      await api.logMeal({ food_id: food.id, quantity, meal, logged_on: date });
      success(`${food.name} added`, `${Math.round(food.kcal * quantity)} kcal to ${MEAL_LABELS[meal].toLowerCase()}`);
      onLogged();
      setQuery("");
      setResults(null);
      inputRef.current?.focus();
    } catch (err) {
      errorToast("Could not log that", err instanceof ApiError ? err.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  /** Log a whole typed line, matching each item against the library. */
  async function logLine() {
    const items = parseFoodLine(query);
    if (items.length === 0) return;
    setBusy(true);

    const unmatched: string[] = [];
    let logged = 0;
    try {
      for (const item of items) {
        const { foods } = await api.searchFoods({ q: item.name, limit: 1 });
        if (foods.length === 0) {
          unmatched.push(item.name);
          continue;
        }
        await api.logMeal({
          food_id: foods[0].id,
          quantity: item.quantity,
          meal,
          logged_on: date,
        });
        logged++;
      }

      onLogged();
      setQuery("");
      if (logged > 0) {
        success(
          `${logged} item${logged === 1 ? "" : "s"} added`,
          // Naming what failed matters more than celebrating what worked: a
          // silent drop is how a day quietly under-reports.
          unmatched.length ? `No match for ${unmatched.join(", ")} — add those by hand.` : undefined,
        );
      } else {
        errorToast("Nothing matched", `No food found for ${unmatched.join(", ")}.`);
      }
    } catch (err) {
      errorToast("Could not log that", err instanceof ApiError ? err.message : "Try again.");
    } finally {
      setBusy(false);
    }
  }

  const showSuggestions = query.trim().length < 2;
  const recent = suggestions?.recent ?? [];
  const frequent = suggestions?.frequent ?? [];
  // A food in both lists is one row, not two — Recent wins, being more specific.
  const frequentOnly = frequent.filter((f) => !recent.some((r) => r.id === f.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Add to {MEAL_LABELS[meal].toLowerCase()}</DialogTitle>
          <DialogDescription>
            Search the library, or type a whole line like "2 idli, 1 filter coffee".
          </DialogDescription>
        </DialogHeader>

        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && parsed.length > 1) {
                e.preventDefault();
                void logLine();
              }
            }}
            placeholder="idli, dal, coffee…"
            className="w-full rounded-xl border border-input bg-transparent py-2.5 pl-9 pr-9 outline-none focus:border-ring"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery("")}
              aria-label="Clear"
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          )}
        </div>

        {parsed.length > 1 && (
          <button
            type="button"
            onClick={() => void logLine()}
            disabled={busy}
            className="flex items-center gap-2 rounded-xl border border-primary/40 bg-primary/5 p-3 text-left transition-colors hover:bg-primary/10 disabled:opacity-50"
          >
            <Sparkles className="size-4 shrink-0 text-primary" />
            <span className="min-w-0 flex-1 text-sm">
              Log {parsed.length} items:{" "}
              <span className="text-muted-foreground">
                {parsed.map((p) => `${p.quantity} × ${p.name}`).join(", ")}
              </span>
            </span>
          </button>
        )}

        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {showSuggestions ? (
            <div className="space-y-5">
              {recent.length > 0 && (
                <section>
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Clock className="size-3.5" /> Recent
                  </p>
                  <ul className="space-y-2">
                    {recent.map((food) => (
                      <FoodRow key={food.id} food={food} onAdd={logOne} />
                    ))}
                  </ul>
                </section>
              )}

              {frequentOnly.length > 0 && (
                <section>
                  <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Star className="size-3.5" /> Often
                  </p>
                  <ul className="space-y-2">
                    {frequentOnly.map((food) => (
                      <FoodRow key={food.id} food={food} onAdd={logOne} />
                    ))}
                  </ul>
                </section>
              )}

              {recent.length === 0 && frequentOnly.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Start typing to search 160-odd everyday foods.
                  <br />
                  What you log will show up here next time.
                </p>
              )}
            </div>
          ) : searching && results === null ? (
            <p className="flex items-center justify-center gap-2 py-8 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin" /> Searching…
            </p>
          ) : results && results.length > 0 ? (
            <ul className="space-y-2">
              {results.map((food) => (
                <FoodRow key={food.id} food={food} onAdd={logOne} />
              ))}
            </ul>
          ) : (
            <div className="py-8 text-center">
              <p className="text-sm text-muted-foreground">Nothing in the library matches that.</p>
              <p className="mt-1 text-xs text-muted-foreground">
                Add it under <span className="font-medium text-foreground">Foods</span> and it will
                be here from then on.
              </p>
            </div>
          )}
        </div>

        <div className={cn("flex justify-end", busy && "opacity-60")}>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Done
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
