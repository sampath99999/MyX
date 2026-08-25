import { useCallback, useEffect, useState } from "react";
import {
  Check,
  ClipboardPaste,
  Library,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { PageShell, EmptyState } from "@/components/ui/page";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { SkeletonRows } from "@/components/ui/skeleton";
import LoadError from "@/components/LoadError";
import { useAuthenticatedLoad } from "@/lib/useAuthenticatedLoad";
import { useToast } from "@/components/ui/toast";
import { api, ApiError, type Food } from "@/lib/api";
import { hasAnything, parseNutritionText, type ParsedNutrition } from "@/lib/nutritionParse";
import { cn } from "@/lib/utils";

/*
  The food library, and the ability to argue with it.

  The seeded numbers are estimates — home cooking varies with the hand that made
  it, and anything fried varies a lot. That is fine for the fifty foods someone
  eats occasionally and not fine for the ten they eat every week, so editing has
  to be here. Editing a built-in writes a personal copy rather than changing the
  shared row; the screen says so, because "I corrected idli" quietly altering
  everyone's breakfast would be worse than not offering it.
*/

const BLANK = {
  name: "",
  serving_label: "1 serving",
  category: "other",
  kcal: "",
  protein: "",
  carbs: "",
  fat: "",
};

/** Names the fields a paste did not yield, so the form can ask for them. */
const MISSING_LABELS: Record<string, string> = {
  kcal: "calories",
  protein: "protein",
  carbs: "carbs",
  fat: "fat",
};

function PasteBox({ onExtract }: { onExtract: (parsed: ParsedNutrition) => void }) {
  const [text, setText] = useState("");
  const [result, setResult] = useState<ParsedNutrition | null>(null);

  function extract(value: string) {
    setText(value);
    if (!value.trim()) {
      setResult(null);
      return;
    }
    const parsed = parseNutritionText(value);
    setResult(parsed);
    if (hasAnything(parsed)) onExtract(parsed);
  }

  return (
    <div className="rounded-xl border border-border/60 bg-muted/20 p-3">
      <label className="block">
        <span className="flex items-center gap-1.5 text-xs font-medium">
          <ClipboardPaste className="size-3.5 text-primary" />
          Paste from anywhere
        </span>
        <textarea
          value={text}
          onChange={(e) => extract(e.target.value)}
          rows={3}
          placeholder={"Serving Size 1 dosa (150g)\nCalories 250\nTotal Fat 9g\nProtein 4.5g"}
          className="mt-2 w-full resize-y rounded-lg border border-input bg-background px-3 py-2 font-mono text-xs outline-none focus:border-ring"
        />
      </label>

      {result && hasAnything(result) ? (
        <div className="mt-2 space-y-1">
          <p className="flex items-center gap-1.5 text-xs text-emerald-400">
            <Check className="size-3.5" />
            Filled in below — check it before saving.
          </p>
          {result.per100g && (
            /* The one misread that produces confidently wrong data rather than
               none: per-100g figures logged as if they were a portion. */
            <p className="flex items-start gap-1.5 text-xs text-amber-400">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" />
              These are per 100 g, so the serving has been set to 100 g. Change it if you
              measure this food some other way.
            </p>
          )}
          {result.missing.length > 0 && (
            <p className="text-xs text-muted-foreground">
              Could not find {result.missing.map((m) => MISSING_LABELS[m]).join(", ")} — type
              {result.missing.length === 1 ? " it" : " those"} in below.
            </p>
          )}
        </div>
      ) : text.trim() ? (
        <p className="mt-2 text-xs text-muted-foreground">
          No numbers found in that. Fill the fields in by hand.
        </p>
      ) : null}
    </div>
  );
}

function FoodForm({
  food,
  open,
  onOpenChange,
  onSaved,
}: {
  food: Food | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { success, error: errorToast } = useToast();
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(
      food
        ? {
            name: food.name,
            serving_label: food.serving_label,
            category: food.category,
            kcal: String(food.kcal),
            protein: String(food.protein),
            carbs: String(food.carbs),
            fat: String(food.fat),
          }
        : BLANK,
    );
  }, [open, food]);

  async function save() {
    setBusy(true);
    try {
      const payload = {
        name: form.name.trim(),
        serving_label: form.serving_label.trim() || "1 serving",
        category: form.category,
        kcal: Number(form.kcal) || 0,
        protein: Number(form.protein) || 0,
        carbs: Number(form.carbs) || 0,
        fat: Number(form.fat) || 0,
      };
      if (food) {
        const res = await api.updateFood(food.id, payload);
        success(
          res.copied ? "Saved as your own copy" : "Food updated",
          res.copied ? "The built-in version is unchanged for everyone else." : undefined,
        );
      } else {
        await api.createFood(payload);
        success(`${payload.name} added`);
      }
      onSaved();
      onOpenChange(false);
    } catch (err) {
      errorToast("Could not save", err instanceof ApiError ? err.message : "Check the values.");
    } finally {
      setBusy(false);
    }
  }

  const field = (key: keyof typeof BLANK, label: string, suffix?: string, type = "text") => (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="relative mt-1 block">
        <input
          type={type}
          value={form[key]}
          onChange={(e) => setForm({ ...form, [key]: e.target.value })}
          className="w-full rounded-lg border border-input bg-transparent px-3 py-2 outline-none focus:border-ring"
        />
        {suffix && (
          <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">
            {suffix}
          </span>
        )}
      </span>
    </label>
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{food ? `Edit ${food.name}` : "Add a food"}</DialogTitle>
          <DialogDescription>
            {food && !food.custom
              ? "This is a built-in. Saving keeps your version and leaves the shared one alone."
              : "Per one serving, however you normally measure it."}
          </DialogDescription>
        </DialogHeader>

        {/*
          Paste first, type second.

          The numbers are almost always already on a screen somewhere — a search
          result, a nutrition label, the back of a packet — and retyping six of
          them is the reason a food never gets added. This fills the fields
          below rather than saving anything, because the parser is reading text
          written by people who were not thinking about parsers: it will
          sometimes be wrong, and every value it produces stays editable and
          visible before anything is written.
        */}
        <PasteBox
          onExtract={(parsed) =>
            setForm((prev) => ({
              ...prev,
              // Only overwrite what was actually found. A paste that omits fat
              // should not blank a figure already typed in by hand.
              name: parsed.name ?? prev.name,
              serving_label: parsed.serving_label ?? prev.serving_label,
              kcal: parsed.kcal !== undefined ? String(parsed.kcal) : prev.kcal,
              protein: parsed.protein !== undefined ? String(parsed.protein) : prev.protein,
              carbs: parsed.carbs !== undefined ? String(parsed.carbs) : prev.carbs,
              fat: parsed.fat !== undefined ? String(parsed.fat) : prev.fat,
            }))
          }
        />

        <div className="space-y-3">
          {field("name", "Name")}
          {field("serving_label", "One serving is")}
          {field("kcal", "Calories", "kcal", "number")}
          <div className="grid grid-cols-3 gap-3">
            {field("protein", "Protein", "g", "number")}
            {field("carbs", "Carbs", "g", "number")}
            {field("fat", "Fat", "g", "number")}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy || !form.name.trim()}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export default function FoodLibrary() {
  const { success, error: errorToast } = useToast();
  const [query, setQuery] = useState("");
  const [foods, setFoods] = useState<Food[]>([]);
  const [editing, setEditing] = useState<Food | null>(null);
  const [formOpen, setFormOpen] = useState(false);

  const load = useCallback(async () => {
    const res = await api.searchFoods({ q: query.trim() || undefined, limit: 120 });
    setFoods(res.foods);
  }, [query]);

  const { loading, error, reload } = useAuthenticatedLoad(load);

  async function remove(food: Food) {
    try {
      await api.deleteFood(food.id);
      success(`${food.name} removed`);
      void reload();
    } catch (err) {
      errorToast("Could not remove", err instanceof ApiError ? err.message : "Try again.");
    }
  }

  return (
    <PageShell width="narrow" className="space-y-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-xl font-semibold tracking-tight">Foods</h1>
        <Button
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          <Plus /> Add food
        </Button>
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search the library…"
          className="w-full rounded-xl border border-input bg-transparent py-2.5 pl-9 pr-3 outline-none focus:border-ring"
        />
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        Built-in values are good estimates, not measurements — within roughly 15% for home cooking,
        and looser for anything fried. Correct the ones you eat often; your version replaces the
        built-in for you and nobody else.
      </p>

      {loading && foods.length === 0 ? (
        <SkeletonRows count={6} />
      ) : error ? (
        <LoadError message={error} onRetry={reload} />
      ) : foods.length === 0 ? (
        <EmptyState
          icon={Library}
          title="Nothing matches"
          description="Add it and it will be in the picker from then on."
        />
      ) : (
        <ul className="space-y-2">
          {foods.map((food) => (
            <li
              key={food.id}
              className="group flex items-center gap-3 rounded-xl border border-border/60 p-3"
            >
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 truncate text-sm font-medium">
                  {food.name}
                  {food.custom && (
                    <span className="rounded-full border border-border/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                      yours
                    </span>
                  )}
                </p>
                <p className="tnum mt-0.5 text-xs text-muted-foreground">
                  {food.serving_label} · {food.kcal} kcal · P {food.protein}g · C {food.carbs}g · F{" "}
                  {food.fat}g
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setEditing(food);
                  setFormOpen(true);
                }}
                aria-label={`Edit ${food.name}`}
                className="text-muted-foreground transition-colors hover:text-foreground"
              >
                <Pencil className="size-4" />
              </button>
              <button
                type="button"
                onClick={() => remove(food)}
                aria-label={`Remove ${food.name}`}
                className={cn(
                  "transition-colors",
                  food.custom
                    ? "text-muted-foreground hover:text-destructive"
                    : "pointer-events-none opacity-0",
                )}
              >
                <Trash2 className="size-4" />
              </button>
            </li>
          ))}
        </ul>
      )}

      <FoodForm food={editing} open={formOpen} onOpenChange={setFormOpen} onSaved={reload} />
    </PageShell>
  );
}
