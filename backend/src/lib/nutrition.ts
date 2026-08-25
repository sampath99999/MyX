/*
  The arithmetic behind Meals.

  Split out from the routes for one reason: it is the part that can be wrong
  without anything failing. A route that breaks returns a 500 and gets noticed;
  a portion multiplier that rounds the wrong way just quietly reports the wrong
  number of calories forever. So it lives here, where it can be tested directly.

  Everything is integers — kcal whole, macros in centigrams (100 = 1.00 g). See
  migrations/0024_meals.sql for why.
*/

/** The four sections of a day. Order matters; screens render them in it. */
export const MEALS = ["breakfast", "lunch", "dinner", "snack"] as const;
export type Meal = (typeof MEALS)[number];

export function isMeal(value: unknown): value is Meal {
  return MEALS.includes(value as Meal);
}

/** Quantity is stored ×100, so one serving is 100 and half of one is 50. */
export const QUANTITY_SCALE = 100;

/**
 * Ten servings of anything is already implausible; a hundred is a typo or an
 * agent that misread "1 katori" as "100 g". Bounded so one bad entry cannot
 * make a day's total meaningless.
 */
export const MAX_QUANTITY_CX = 2000;

export const nutritionFields = ["kcal", "protein_cg", "carbs_cg", "fat_cg", "fibre_cg"] as const;
export type NutritionField = (typeof nutritionFields)[number];
export type Nutrition = Record<NutritionField, number>;

/** Grams in, centigrams out. */
export const toCg = (grams: number): number => Math.round(grams * 100);

/** Centigrams in, grams out — one decimal, which is all this data deserves. */
export const toGrams = (cg: number): number => Math.round(cg) / 100;

/**
 * One food's nutrition scaled to the portion actually eaten.
 *
 * Rounded per field rather than kept fractional, because this is written to the
 * row once and every later read is a plain sum. The alternative — storing the
 * quantity and multiplying on read — puts a float multiply in the middle of
 * every daily total, which is the thing the integer columns exist to avoid.
 */
export function scaleNutrition(food: Nutrition, quantityCx: number): Nutrition {
  const out = {} as Nutrition;
  for (const field of nutritionFields) {
    out[field] = Math.round((food[field] * quantityCx) / QUANTITY_SCALE);
  }
  return out;
}

/** Adds nutrition rows up. Used for a meal, a day, and a template. */
export function sumNutrition(rows: Nutrition[]): Nutrition {
  const total = { kcal: 0, protein_cg: 0, carbs_cg: 0, fat_cg: 0, fibre_cg: 0 };
  for (const row of rows) {
    for (const field of nutritionFields) total[field] += row[field] ?? 0;
  }
  return total;
}

/* ---- targets ------------------------------------------------------------- */

export type Sex = "male" | "female";
export type Activity = "sedentary" | "light" | "moderate" | "active" | "very_active";
export type Goal = "lose" | "maintain" | "gain";

export interface Profile {
  sex: Sex;
  age: number;
  height_cm: number;
  weight_g: number;
  activity: Activity;
  goal: Goal;
}

/** Standard multipliers applied to BMR to get daily expenditure. */
export const ACTIVITY_FACTORS: Record<Activity, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  active: 1.725,
  very_active: 1.9,
};

/**
 * Calorie adjustment per goal.
 *
 * A 500 kcal deficit is about half a kilo a week, which is the most that can be
 * lost without shedding muscle alongside it. The surplus is deliberately much
 * smaller than the deficit: weight gained faster than roughly 350 kcal a day
 * over maintenance is mostly fat, so a bigger number would just be lying about
 * what it buys.
 */
export const GOAL_ADJUSTMENT: Record<Goal, number> = {
  lose: -500,
  maintain: 0,
  gain: 350,
};

/**
 * Protein target in grams per kilogram of bodyweight.
 *
 * Higher when losing than when maintaining, which surprises people. Protein is
 * what stops a deficit eating muscle as well as fat, so the leaner the calorie
 * budget the more of it should be protein.
 */
const PROTEIN_G_PER_KG: Record<Goal, number> = {
  lose: 1.8,
  maintain: 1.4,
  gain: 1.6,
};

/** Share of calories from fat. Below about 20% hormones suffer; this sits above it. */
const FAT_SHARE = 0.25;

const KCAL_PER_G_PROTEIN = 4;
const KCAL_PER_G_CARB = 4;
const KCAL_PER_G_FAT = 9;

/** Mifflin-St Jeor, the least-bad of the BMR estimates. */
export function basalMetabolicRate(profile: Profile): number {
  const kg = profile.weight_g / 1000;
  const base = 10 * kg + 6.25 * profile.height_cm - 5 * profile.age;
  return Math.round(base + (profile.sex === "male" ? 5 : -161));
}

/** BMR scaled for how much the person actually moves. */
export function totalDailyEnergy(profile: Profile): number {
  return Math.round(basalMetabolicRate(profile) * ACTIVITY_FACTORS[profile.activity]);
}

export interface Targets {
  kcal: number;
  protein_cg: number;
  carbs_cg: number;
  fat_cg: number;
}

/**
 * A full set of targets from a profile.
 *
 * Protein is set from bodyweight and fat from a share of calories; carbohydrate
 * is whatever is left. That ordering is deliberate — protein and fat both have
 * floors worth respecting, and carbohydrate is the one that can absorb the
 * remainder without doing any harm.
 *
 * The floor on carbohydrate stops an aggressive deficit on a heavy person
 * producing a negative number, which the honest reading of the arithmetic would
 * otherwise give.
 */
export function deriveTargets(profile: Profile): Targets {
  const kcal = Math.max(1200, totalDailyEnergy(profile) + GOAL_ADJUSTMENT[profile.goal]);
  const kg = profile.weight_g / 1000;

  const proteinG = Math.round(kg * PROTEIN_G_PER_KG[profile.goal]);
  const fatG = Math.round((kcal * FAT_SHARE) / KCAL_PER_G_FAT);
  const remaining = kcal - proteinG * KCAL_PER_G_PROTEIN - fatG * KCAL_PER_G_FAT;
  const carbsG = Math.max(50, Math.round(remaining / KCAL_PER_G_CARB));

  return {
    kcal,
    protein_cg: toCg(proteinG),
    carbs_cg: toCg(carbsG),
    fat_cg: toCg(fatG),
  };
}

/** Sensible defaults for someone who has not filled the profile in. */
export const DEFAULT_TARGETS: Targets = {
  kcal: 2000,
  protein_cg: toCg(90),
  carbs_cg: toCg(250),
  fat_cg: toCg(60),
};

export const dateRe = /^\d{4}-\d{2}-\d{2}$/;
