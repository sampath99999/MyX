/*
  The arithmetic behind Meals.

  This is the code that fails quietly. A broken route throws; a portion
  multiplier that rounds the wrong way just reports slightly wrong calories
  forever, and nobody finds out. So the properties here are mostly about
  totals staying honest under repetition.
*/

import { describe, it, expect } from "vitest";
import {
  ACTIVITY_FACTORS,
  DEFAULT_TARGETS,
  GOAL_ADJUSTMENT,
  basalMetabolicRate,
  deriveTargets,
  isMeal,
  scaleNutrition,
  sumNutrition,
  toCg,
  toGrams,
  totalDailyEnergy,
  type Profile,
} from "./nutrition";

const idli = { kcal: 58, protein_cg: 160, carbs_cg: 1200, fat_cg: 20, fibre_cg: 60 };

describe("scaleNutrition", () => {
  it("leaves a single serving alone", () => {
    expect(scaleNutrition(idli, 100)).toEqual(idli);
  });

  it("doubles a double portion", () => {
    expect(scaleNutrition(idli, 200)).toEqual({
      kcal: 116,
      protein_cg: 320,
      carbs_cg: 2400,
      fat_cg: 40,
      fibre_cg: 120,
    });
  });

  it("handles a half portion", () => {
    expect(scaleNutrition(idli, 50)).toEqual({
      kcal: 29,
      protein_cg: 80,
      carbs_cg: 600,
      fat_cg: 10,
      fibre_cg: 30,
    });
  });

  it("returns whole numbers for awkward portions", () => {
    // Three idlis and a bit — the sort of quantity a person actually eats.
    const scaled = scaleNutrition(idli, 350);
    for (const value of Object.values(scaled)) {
      expect(Number.isInteger(value)).toBe(true);
    }
  });

  it("never drifts, however many entries are summed", () => {
    /*
      The reason the columns are integers. Twenty entries of a third of a
      serving must land on an exact total; the same sum in floats would come
      back as 386.99999999999994 and every daily figure would inherit it.
    */
    const rows = Array.from({ length: 20 }, () => scaleNutrition(idli, 33));
    const total = sumNutrition(rows);
    expect(total.kcal).toBe(19 * 20);
    expect(Number.isInteger(total.protein_cg)).toBe(true);
  });
});

describe("sumNutrition", () => {
  it("adds a day up", () => {
    expect(sumNutrition([idli, idli, idli])).toEqual({
      kcal: 174,
      protein_cg: 480,
      carbs_cg: 3600,
      fat_cg: 60,
      fibre_cg: 180,
    });
  });

  it("is zero for an empty day rather than undefined", () => {
    expect(sumNutrition([])).toEqual({
      kcal: 0,
      protein_cg: 0,
      carbs_cg: 0,
      fat_cg: 0,
      fibre_cg: 0,
    });
  });
});

describe("gram conversion", () => {
  it("round-trips", () => {
    for (const g of [0, 0.5, 1.6, 12, 27.35, 250]) {
      expect(toGrams(toCg(g))).toBeCloseTo(g, 2);
    }
  });

  it("keeps two decimals of a gram, which is all this data deserves", () => {
    expect(toCg(1.615)).toBe(162);
    expect(toGrams(162)).toBe(1.62);
  });
});

describe("isMeal", () => {
  it("accepts the four real ones", () => {
    for (const m of ["breakfast", "lunch", "dinner", "snack"]) expect(isMeal(m)).toBe(true);
  });

  it("rejects anything else, so nothing lands in a section no screen renders", () => {
    for (const m of ["brunch", "", "BREAKFAST", null, 3]) expect(isMeal(m)).toBe(false);
  });
});

const profile: Profile = {
  sex: "male",
  age: 30,
  height_cm: 175,
  weight_g: 75_000,
  activity: "moderate",
  goal: "maintain",
};

describe("basalMetabolicRate", () => {
  it("matches Mifflin-St Jeor for a known case", () => {
    // 10(75) + 6.25(175) - 5(30) + 5 = 1698.75 -> 1699
    expect(basalMetabolicRate(profile)).toBe(1699);
  });

  it("is lower for women at the same size, by the formula's constant", () => {
    const female = basalMetabolicRate({ ...profile, sex: "female" });
    expect(basalMetabolicRate(profile) - female).toBe(166);
  });

  it("falls with age", () => {
    expect(basalMetabolicRate({ ...profile, age: 60 })).toBeLessThan(basalMetabolicRate(profile));
  });
});

describe("totalDailyEnergy", () => {
  it("scales BMR by the activity factor", () => {
    expect(totalDailyEnergy(profile)).toBe(
      Math.round(basalMetabolicRate(profile) * ACTIVITY_FACTORS.moderate),
    );
  });

  it("rises monotonically with activity", () => {
    const levels = ["sedentary", "light", "moderate", "active", "very_active"] as const;
    const values = levels.map((activity) => totalDailyEnergy({ ...profile, activity }));
    for (let i = 1; i < values.length; i++) expect(values[i]).toBeGreaterThan(values[i - 1]);
  });
});

describe("deriveTargets", () => {
  it("puts a deficit below maintenance and a surplus above it", () => {
    const maintain = deriveTargets({ ...profile, goal: "maintain" }).kcal;
    expect(deriveTargets({ ...profile, goal: "lose" }).kcal).toBe(maintain + GOAL_ADJUSTMENT.lose);
    expect(deriveTargets({ ...profile, goal: "gain" }).kcal).toBe(maintain + GOAL_ADJUSTMENT.gain);
  });

  it("asks for more protein when losing than when maintaining", () => {
    // Not a rounding accident: protein is what stops a deficit eating muscle.
    expect(deriveTargets({ ...profile, goal: "lose" }).protein_cg).toBeGreaterThan(
      deriveTargets({ ...profile, goal: "maintain" }).protein_cg,
    );
  });

  it("produces macros that add back up to roughly the calorie target", () => {
    const t = deriveTargets(profile);
    const fromMacros =
      toGrams(t.protein_cg) * 4 + toGrams(t.carbs_cg) * 4 + toGrams(t.fat_cg) * 9;
    // Within a rounding whisker of the target it was split from.
    expect(Math.abs(fromMacros - t.kcal)).toBeLessThan(20);
  });

  it("never returns a starvation target, however aggressive the inputs", () => {
    const tiny = deriveTargets({
      sex: "female",
      age: 70,
      height_cm: 145,
      weight_g: 40_000,
      activity: "sedentary",
      goal: "lose",
    });
    expect(tiny.kcal).toBeGreaterThanOrEqual(1200);
  });

  it("never returns negative carbohydrate", () => {
    /*
      The honest arithmetic can go below zero: a heavy person on an aggressive
      deficit has a protein and fat allowance that already spends the budget.
      A negative target is not a diet, it is a bug on screen.
    */
    const heavy = deriveTargets({
      sex: "male",
      age: 25,
      height_cm: 160,
      weight_g: 150_000,
      activity: "sedentary",
      goal: "lose",
    });
    expect(heavy.carbs_cg).toBeGreaterThan(0);
  });

  it("scales protein with bodyweight", () => {
    const light = deriveTargets({ ...profile, weight_g: 55_000 });
    const heavy = deriveTargets({ ...profile, weight_g: 95_000 });
    expect(heavy.protein_cg).toBeGreaterThan(light.protein_cg);
  });
});

describe("DEFAULT_TARGETS", () => {
  it("is a real day of food for someone who has not filled anything in", () => {
    expect(DEFAULT_TARGETS.kcal).toBeGreaterThan(1500);
    expect(DEFAULT_TARGETS.kcal).toBeLessThan(2600);
    expect(toGrams(DEFAULT_TARGETS.protein_cg)).toBeGreaterThan(50);
  });
});
