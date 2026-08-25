/*
  Pasted nutrition text, in the shapes it actually arrives in.

  Every fixture below is the format of a real source — a US nutrition label, a
  search-result snippet, a European per-100g table, a packet quoting kilojoules.
  The cases that matter most are the ones where a naive parser returns a
  confident wrong number rather than nothing: saturated fat standing in for
  total fat, and per-100g figures read as a portion.
*/

import { describe, it, expect } from "vitest";
import { hasAnything, parseNutritionText } from "./nutritionParse";

describe("a US-style nutrition label", () => {
  const label = `Masala Dosa
Serving Size 1 dosa (150g)
Amount Per Serving
Calories 250
Total Fat 9g
  Saturated Fat 4g
  Trans Fat 0g
Total Carbohydrate 38g
  Dietary Fiber 2.5g
  Sugars 3g
Protein 4.5g`;

  it("reads every macro", () => {
    const p = parseNutritionText(label);
    expect(p.kcal).toBe(250);
    expect(p.protein).toBe(4.5);
    expect(p.carbs).toBe(38);
    expect(p.fat).toBe(9);
    expect(p.fibre).toBe(2.5);
  });

  it("takes total fat, not saturated fat", () => {
    // The trap: 4 is a plausible number and nothing on screen would say it is
    // the wrong one.
    expect(parseNutritionText(label).fat).toBe(9);
  });

  it("splits the serving into a label and its weight", () => {
    const p = parseNutritionText(label);
    expect(p.serving_label).toBe("1 dosa");
    expect(p.serving_grams).toBe(150);
  });

  it("finds the name and skips the measurement lines", () => {
    expect(parseNutritionText(label).name).toBe("Masala Dosa");
  });

  it("reports nothing missing", () => {
    expect(parseNutritionText(label).missing).toEqual([]);
  });
});

describe("a search-result snippet", () => {
  it("reads a single run-on line", () => {
    const p = parseNutritionText(
      "Idli: 58 calories, Protein 1.6 g, Carbohydrates 12 g, Fat 0.2 g",
    );
    expect(p.kcal).toBe(58);
    expect(p.protein).toBe(1.6);
    expect(p.carbs).toBe(12);
    expect(p.fat).toBe(0.2);
  });

  it("copes with the value written before the nutrient", () => {
    const p = parseNutritionText("Chapati — 120 kcal | 3.2 g protein | 20 g carbs | 3 g fat");
    expect(p.kcal).toBe(120);
    expect(p.protein).toBe(3.2);
    expect(p.carbs).toBe(20);
    expect(p.fat).toBe(3);
  });
});

describe("a per-100g table", () => {
  const table = `Paneer
Nutrition per 100 g
Energy\t265 kcal
Protein\t18 g
Carbohydrate\t3 g
of which sugars\t1.2 g
Fat\t20 g`;

  it("reads tab-separated values", () => {
    const p = parseNutritionText(table);
    expect(p.kcal).toBe(265);
    expect(p.protein).toBe(18);
    expect(p.fat).toBe(20);
  });

  it("says the numbers describe 100 g, and labels the serving so", () => {
    const p = parseNutritionText(table);
    // Without this the figures silently describe a portion nobody ate.
    expect(p.per100g).toBe(true);
    expect(p.serving_label).toBe("100 g");
    expect(p.serving_grams).toBe(100);
  });

  it("takes carbohydrate, not the sugars beneath it", () => {
    expect(parseNutritionText(table).carbs).toBe(3);
  });
});

describe("energy in kilojoules", () => {
  it("converts when only kJ is given", () => {
    const p = parseNutritionText("Energy 556 kJ\nProtein 2.7 g\nFat 3.7 g\nCarbohydrate 22 g");
    // 556 / 4.184 = 132.9
    expect(p.kcal).toBe(133);
  });

  it("prefers kcal when both are present", () => {
    const p = parseNutritionText("Energy 556 kJ / 133 kcal\nProtein 2.7 g");
    expect(p.kcal).toBe(133);
  });
});

describe("awkward input", () => {
  it("handles a decimal comma", () => {
    expect(parseNutritionText("Protein 2,7 g").protein).toBe(2.7);
  });

  it("strips a thousands separator from a kJ figure", () => {
    expect(parseNutritionText("Energy 1,046 kJ").kcal).toBe(250);
  });

  it("returns nothing rather than guessing at prose", () => {
    const p = parseNutritionText("I had a really nice lunch today with my family");
    expect(hasAnything(p)).toBe(false);
    expect(p.missing).toEqual(["kcal", "protein", "carbs", "fat"]);
  });

  it("is empty for empty input", () => {
    expect(hasAnything(parseNutritionText(""))).toBe(false);
  });

  it("names what it could not find, so the form can ask for it", () => {
    const p = parseNutritionText("Calories 250\nProtein 4.5g");
    expect(p.kcal).toBe(250);
    expect(p.missing).toEqual(["carbs", "fat"]);
  });

  it("never returns a negative number", () => {
    const p = parseNutritionText("Calories -250\nProtein -4g");
    for (const value of [p.kcal, p.protein, p.carbs, p.fat]) {
      if (value !== undefined) expect(value).toBeGreaterThanOrEqual(0);
    }
  });

  it("does not mistake a percentage for a value", () => {
    // Daily-value columns sit right beside the real figures on a label.
    const p = parseNutritionText("Total Fat 9g 12%\nProtein 4.5g 9%");
    expect(p.fat).toBe(9);
    expect(p.protein).toBe(4.5);
  });
});
