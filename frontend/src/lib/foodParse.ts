/*
  Natural-language food entry: "2 idli, 1 filter coffee" in one box.

  The same idea as taskParse.ts, and for the same reason. Logging breakfast is
  six taps through a picker or one line of typing, and the module lives or dies
  on how long that takes — a tracker abandoned in a week has no features at all.

  What this does not do is guess at nutrition. It splits a line into quantities
  and names; matching those names against the food library happens against real
  rows, so an unmatched item is reported as unmatched rather than invented. A
  food log that quietly makes numbers up is worse than no food log.
*/

export interface ParsedFoodItem {
  /** What to search the library for. */
  name: string;
  /** Servings. Defaults to 1 when the line does not say. */
  quantity: number;
}

/** Words for small numbers, because people type them. */
const WORD_NUMBERS: Record<string, number> = {
  a: 1,
  an: 1,
  one: 1,
  two: 2,
  three: 3,
  four: 4,
  five: 5,
  six: 6,
  seven: 7,
  eight: 8,
  nine: 9,
  ten: 10,
  half: 0.5,
};

/**
 * Measure words that belong to the portion, not the food.
 *
 * "2 katori dal" and "2 dal" mean the same thing to the library, whose serving
 * for dal already *is* a katori. Dropping the measure word is what lets the
 * name match a row.
 */
const MEASURE_WORDS = new Set([
  "katori",
  "katoris",
  "bowl",
  "bowls",
  "plate",
  "plates",
  "glass",
  "glasses",
  "cup",
  "cups",
  "piece",
  "pieces",
  "pcs",
  "slice",
  "slices",
  "serving",
  "servings",
  "spoon",
  "spoons",
  "tbsp",
  "tsp",
  "scoop",
  "scoops",
]);

/** Split on commas, "and", "+", and newlines — all the ways a list gets written. */
function splitItems(input: string): string[] {
  return input
    .split(/\s*(?:,|\+|\band\b|\n)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
}

/**
 * Leading quantity, in any of the forms people write it:
 * "2 dosa", "1.5 katori rice", "two idli", "half plate biryani".
 */
function readQuantity(text: string): { quantity: number; rest: string } {
  /*
    Fractions first. The plain-number pattern below happily matches the "1" of
    "1/2 dosa" and hands back "/2 dosa" as the food name, so the more specific
    shape has to be tried before the more general one.
  */
  const fraction = text.match(/^(\d+)\s*\/\s*(\d+)\s+(.*)$/);
  if (fraction) {
    const value = Number(fraction[1]) / Number(fraction[2]);
    if (Number.isFinite(value) && value > 0) return { quantity: value, rest: fraction[3] };
  }

  const numeric = text.match(/^(\d+(?:\.\d+)?)\s*(?:x\s*)?(.*)$/i);
  if (numeric) {
    const value = Number(numeric[1]);
    if (Number.isFinite(value) && value > 0) return { quantity: value, rest: numeric[2] };
  }

  const word = text.match(/^([a-z]+)\s+(.*)$/i);
  if (word) {
    const value = WORD_NUMBERS[word[1].toLowerCase()];
    if (value) return { quantity: value, rest: word[2] };
  }

  return { quantity: 1, rest: text };
}

/** Drops the measure word so "2 katori dal" searches for "dal". */
function stripMeasure(text: string): string {
  const parts = text.trim().split(/\s+/);
  while (parts.length > 1 && MEASURE_WORDS.has(parts[0].toLowerCase())) parts.shift();
  // "of" survives the measure word often enough to be worth removing too.
  if (parts.length > 1 && parts[0].toLowerCase() === "of") parts.shift();
  return parts.join(" ");
}

/**
 * Parse a line into the items it names.
 *
 * Quantities are capped at something a person could eat: a line reading
 * "100 dosa" is a typo or a stray digit, and letting it through puts 13,000
 * calories in a day and makes every chart useless.
 */
export const MAX_PARSED_QUANTITY = 20;

export function parseFoodLine(input: string): ParsedFoodItem[] {
  return splitItems(input)
    .map((part) => {
      const { quantity, rest } = readQuantity(part);
      const name = stripMeasure(rest).trim();
      if (!name) return null;
      return {
        name,
        quantity: Math.min(Math.round(quantity * 100) / 100, MAX_PARSED_QUANTITY),
      };
    })
    .filter((item): item is ParsedFoodItem => item !== null);
}
