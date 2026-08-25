import { useEffect, useState } from "react";
import { Calculator, Loader2, PencilLine } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/ui/toast";
import { api, ApiError, type NutritionProfile } from "@/lib/api";
import { cn } from "@/lib/utils";

/*
  Daily targets, two ways.

  Both are offered because both are real situations. Someone handed numbers by a
  dietitian wants to type those in and be left alone; someone starting from
  nothing has no idea what their maintenance calories are and wants to be asked
  five questions. Offering only the first makes the module useless to beginners;
  offering only the second overrides people who already know better.
*/

const ACTIVITIES: { value: NutritionProfile["activity"]; label: string; hint: string }[] = [
  { value: "sedentary", label: "Sedentary", hint: "Desk job, little exercise" },
  { value: "light", label: "Light", hint: "Exercise 1–3 days a week" },
  { value: "moderate", label: "Moderate", hint: "Exercise 3–5 days a week" },
  { value: "active", label: "Active", hint: "Exercise 6–7 days a week" },
  { value: "very_active", label: "Very active", hint: "Physical job, or twice a day" },
];

const GOALS: { value: NutritionProfile["goal"]; label: string }[] = [
  { value: "lose", label: "Lose weight" },
  { value: "maintain", label: "Maintain" },
  { value: "gain", label: "Gain weight" },
];

function Field({
  label,
  suffix,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; suffix?: string }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <span className="relative mt-1 block">
        <input
          {...props}
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
}

export default function TargetsDialog({
  open,
  onOpenChange,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSaved: () => void;
}) {
  const { success, error: errorToast } = useToast();
  const [mode, setMode] = useState<"calculate" | "manual">("calculate");
  const [busy, setBusy] = useState(false);

  const [kcal, setKcal] = useState("2000");
  const [protein, setProtein] = useState("90");
  const [carbs, setCarbs] = useState("250");
  const [fat, setFat] = useState("60");

  const [profile, setProfile] = useState<NutritionProfile>({
    sex: "male",
    age: 30,
    height_cm: 170,
    weight_kg: 70,
    activity: "light",
    goal: "maintain",
  });

  useEffect(() => {
    if (!open) return;
    api
      .mealTargets()
      .then((res) => {
        setKcal(String(res.targets.kcal));
        setProtein(String(Math.round(res.targets.protein)));
        setCarbs(String(Math.round(res.targets.carbs)));
        setFat(String(Math.round(res.targets.fat)));
        if (res.profile) {
          setProfile(res.profile);
          // Someone who set them up from a profile wants to adjust the profile,
          // not retype four numbers derived from it.
          setMode("calculate");
        } else if (res.configured) {
          setMode("manual");
        }
      })
      .catch(() => {});
  }, [open]);

  async function save() {
    setBusy(true);
    try {
      const res =
        mode === "calculate"
          ? await api.setMealTargets({ profile })
          : await api.setMealTargets({
              kcal: Number(kcal),
              protein: Number(protein),
              carbs: Number(carbs),
              fat: Number(fat),
            });
      success(
        "Targets saved",
        `${res.targets.kcal.toLocaleString("en-IN")} kcal · ${Math.round(res.targets.protein)}g protein`,
      );
      onSaved();
      onOpenChange(false);
    } catch (err) {
      errorToast("Could not save", err instanceof ApiError ? err.message : "Check the values.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Daily targets</DialogTitle>
          <DialogDescription>
            What a day should add up to. Work them out from your details, or type them in.
          </DialogDescription>
        </DialogHeader>

        <div className="flex gap-1 rounded-xl border border-border/60 p-1">
          {(
            [
              { value: "calculate" as const, label: "Work them out", icon: Calculator },
              { value: "manual" as const, label: "Type them in", icon: PencilLine },
            ]
          ).map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setMode(option.value)}
              className={cn(
                "flex flex-1 items-center justify-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                mode === option.value ? "bg-accent" : "text-muted-foreground hover:text-foreground",
              )}
            >
              <option.icon className="size-4" />
              {option.label}
            </button>
          ))}
        </div>

        {mode === "calculate" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="text-xs font-medium text-muted-foreground">Sex</span>
                <select
                  value={profile.sex}
                  onChange={(e) =>
                    setProfile({ ...profile, sex: e.target.value as NutritionProfile["sex"] })
                  }
                  className="mt-1 w-full rounded-lg border border-input bg-transparent px-3 py-2 outline-none focus:border-ring"
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </label>
              <Field
                label="Age"
                type="number"
                value={profile.age}
                onChange={(e) => setProfile({ ...profile, age: Number(e.target.value) })}
              />
              <Field
                label="Height"
                type="number"
                suffix="cm"
                value={profile.height_cm}
                onChange={(e) => setProfile({ ...profile, height_cm: Number(e.target.value) })}
              />
              <Field
                label="Weight"
                type="number"
                suffix="kg"
                value={profile.weight_kg}
                onChange={(e) => setProfile({ ...profile, weight_kg: Number(e.target.value) })}
              />
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground">How active are you?</p>
              <div className="mt-2 space-y-1.5">
                {ACTIVITIES.map((option) => (
                  <label
                    key={option.value}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-lg border p-2.5 transition-colors",
                      profile.activity === option.value
                        ? "border-primary bg-primary/5"
                        : "border-border/60 hover:bg-accent",
                    )}
                  >
                    <input
                      type="radio"
                      name="activity"
                      checked={profile.activity === option.value}
                      onChange={() => setProfile({ ...profile, activity: option.value })}
                      className="accent-primary"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{option.label}</span>
                      <span className="block text-xs text-muted-foreground">{option.hint}</span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <p className="text-xs font-medium text-muted-foreground">Goal</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {GOALS.map((option) => (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setProfile({ ...profile, goal: option.value })}
                    className={cn(
                      "rounded-lg border px-2 py-2 text-xs font-medium transition-colors",
                      profile.goal === option.value
                        ? "border-primary bg-primary/5"
                        : "border-border/60 hover:bg-accent",
                    )}
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-xs leading-relaxed text-muted-foreground">
              Worked out with the Mifflin-St Jeor equation, which estimates. Treat the result as a
              starting point and adjust it after a couple of weeks against what the scale actually
              does — that feedback is worth more than any formula.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            <Field
              label="Calories"
              type="number"
              suffix="kcal"
              value={kcal}
              onChange={(e) => setKcal(e.target.value)}
            />
            <div className="grid grid-cols-3 gap-3">
              <Field
                label="Protein"
                type="number"
                suffix="g"
                value={protein}
                onChange={(e) => setProtein(e.target.value)}
              />
              <Field
                label="Carbs"
                type="number"
                suffix="g"
                value={carbs}
                onChange={(e) => setCarbs(e.target.value)}
              />
              <Field
                label="Fat"
                type="number"
                suffix="g"
                value={fat}
                onChange={(e) => setFat(e.target.value)}
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button onClick={save} disabled={busy}>
            {busy && <Loader2 className="size-4 animate-spin" />}
            Save targets
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
