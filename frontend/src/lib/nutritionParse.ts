/*
  Pulling nutrition out of pasted text.

  Adding a food by hand means retyping six numbers that are already on screen
  somewhere else — a search result, a nutrition label, the back of a packet. So
  the form takes a paste and fills itself in.

  Everything here fills fields rather than saving them. The parser is guessing at
  text written by someone who was not thinking about parsers, and it will
  sometimes guess wrong; the fields stay editable and nothing is written until
  the person has looked at it. It also reports what it could not find, because
  the failure that matters is not "no match" — that is visible — it is
  confidently extracting the wrong number.

  Three traps get explicit handling, all of which produce plausible-looking wrong
  data rather than an obvious failure:

  - "Saturated Fat 4g" answers a naive search for fat and under-reports the real
    figure, so qualifying lines are dropped and Total Fat wins.
  - "Energy 556 kJ / 133 kcal" gives up 556 to anything that takes the first
    number after the word, and 556 kcal is four times a real dosa.
  - Plenty of sources quote per 100 g rather than per serving. Missing that puts
    every number out by whatever the portion actually weighs.
*/

export interface ParsedNutrition {
  name?: string;
  serving_label?: string;
  serving_grams?: number;
  kcal?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fibre?: number;
  /** Fields the text did not yield, so the form can say what still needs typing. */
  missing: ("kcal" | "protein" | "carbs" | "fat")[];
  /** True when the numbers describe 100 g rather than a portion. */
  per100g: boolean;
}

/** Kilojoules per kilocalorie, for sources that quote energy the other way. */
const KJ_PER_KCAL = 4.184;

const NUTRIENT_WORDS =
  /(calorie|energy|protein|carb|fat|fibre|fiber|sugar|sodium|cholesterol|serving|kcal|kj|saturat|trans|nutrition|amount per|daily value)/i;

/** A number with an optional decimal, written with either separator. */
const NUMBER = "(\\d+(?:[.,]\\d+)?)";

function toNumber(raw: string): number | undefined {
  // Thousands separators turn up in kJ figures; decimal commas turn up in text
  // copied from European sources. Both mean the same thing to a person.
  const cleaned = raw.replace(/,(?=\d{3}\b)/g, "").replace(",", ".");
  const value = Number(cleaned);
  return Number.isFinite(value) && value >= 0 ? value : undefined;
}

/**
 * Find a nutrient's value, accepting either order.
 *
 * "Protein 2.7 g", "Protein: 2.7g", "2.7 g protein" and a tab-separated table
 * cell are all the same statement, and all four turn up in pasted text.
 *
 * The unit is required rather than optional, and that is what keeps the
 * daily-value column off the end of a nutrition label from being read as the
 * figure: "Total Fat 9g 12%" carries two numbers and only one is grams.
 */
function findValue(text: string, label: string, unitPattern = "g(?:rams?)?"): number | undefined {
  const unit = `\\s*(?:${unitPattern})\\b`;
  const patterns = [
    /*
      Label first: "Protein 2.7 g".

      The gap cannot cross a field separator, which matters on the one-line
      snippets people paste out of search results. In "3.2 g protein | 20 g
      carbs", a gap that steps over the pipe finds 20 immediately after the word
      protein and reports it with complete confidence. A colon stays allowed,
      because "Protein: 2.7g" is the same statement; % stays excluded so a
      daily-value column cannot be crossed either.
    */
    new RegExp(`${label}\\b[^\\n\\d%|,;/]{0,20}?${NUMBER}${unit}`, "i"),
    // Value first: "2.7 g protein"
    new RegExp(`${NUMBER}${unit}[^\\n\\d]{0,20}?${label}\\b`, "i"),
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    const value = match?.[1] !== undefined ? toNumber(match[1]) : undefined;
    if (value !== undefined) return value;
  }
  return undefined;
}

/**
 * Lines that qualify a nutrient rather than state it.
 *
 * Dropped before looking for fat and carbohydrate, so "Saturated Fat 4g" cannot
 * stand in for the total and "of which sugars" cannot stand in for carbs. This
 * is the difference between a number that is wrong and a number that is wrong in
 * a way nobody notices.
 */
function withoutQualifiedLines(text: string): string {
  return text
    .split("\n")
    .filter((line) => !/^\s*(?:-|–|•)?\s*(?:saturat|trans|poly|mono|of which|incl)/i.test(line))
    .join("\n");
}

/**
 * Energy, which arrives in more shapes than any other field.
 *
 * The kcal-qualified form is tried first, and that ordering is load-bearing —
 * see the note about kJ at the top of the file.
 */
function findEnergy(text: string): number | undefined {
  // "133 kcal", "58 calories" — the unit follows the number.
  const qualified = text.match(/(\d+(?:[.,]\d+)?)\s*k?cal(?:ories)?\b/i);
  if (qualified) {
    const value = toNumber(qualified[1]);
    if (value !== undefined) return Math.round(value);
  }

  // "Calories 250", "Energy: 265" — and the trailing unit, if any, sets the scale.
  const labelled = text.match(
    /(?:calories|energy)\b[^\n\d]{0,20}?(\d+(?:[.,]\d+)?)\s*(kj|kcal|cal)?/i,
  );
  if (labelled) {
    const value = toNumber(labelled[1]);
    if (value !== undefined) {
      return Math.round(labelled[2]?.toLowerCase() === "kj" ? value / KJ_PER_KCAL : value);
    }
  }

  // A bare kilojoule figure. Converting beats reporting nothing at all.
  const kj = text.match(/(\d+(?:[.,]\d+)?)\s*kj\b/i);
  if (kj) {
    const value = toNumber(kj[1]);
    if (value !== undefined) return Math.round(value / KJ_PER_KCAL);
  }

  return undefined;
}

/** "1 dosa (150g)" → label "1 dosa", 150 grams. */
function findServing(text: string): { label?: string; grams?: number } {
  const line = text.match(/serving\s*size[:\s\t]*([^\n]+)/i)?.[1]?.trim();
  if (!line) return {};

  const grams = line.match(/(\d+(?:[.,]\d+)?)\s*g(?:rams?)?\b/i)?.[1];
  const label = line
    .replace(/\((?:about\s*)?\d+(?:[.,]\d+)?\s*g(?:rams?)?\)/i, "")
    .replace(/[,\s]+$/, "")
    .trim();

  return {
    label: label.slice(0, 40) || undefined,
    grams: grams ? Math.round(toNumber(grams) ?? 0) || undefined : undefined,
  };
}

/**
 * The first line that reads like a name rather than a measurement.
 *
 * Deliberately conservative. A wrong name is obvious on screen and costs one
 * correction; a wrong calorie figure is invisible and costs a month of data.
 */
function findName(text: string): string | undefined {
  for (const raw of text.split("\n")) {
    const line = raw.trim().replace(/^[-•*\s]+/, "");
    if (line.length < 2 || line.length > 60) continue;
    if (NUTRIENT_WORDS.test(line)) continue;
    if (/^\d/.test(line)) continue;
    return line.slice(0, 60);
  }
  return undefined;
}

export function parseNutritionText(input: string): ParsedNutrition {
  const text = input.replace(/\r/g, "");
  const unqualified = withoutQualifiedLines(text);

  const per100g = /per\s*100\s*(?:g|gram|ml)\b/i.test(text);

  const kcal = findEnergy(text);
  const protein = findValue(text, "protein");
  const carbs =
    findValue(unqualified, "total\\s*carbohydrates?") ??
    findValue(unqualified, "carbohydrates?") ??
    findValue(unqualified, "carbs?");
  const fat = findValue(unqualified, "total\\s*fat") ?? findValue(unqualified, "fat");
  const fibre = findValue(text, "(?:dietary\\s*)?fib(?:re|er)");

  const serving = findServing(text);

  const missing: ParsedNutrition["missing"] = [];
  if (kcal === undefined) missing.push("kcal");
  if (protein === undefined) missing.push("protein");
  if (carbs === undefined) missing.push("carbs");
  if (fat === undefined) missing.push("fat");

  return {
    name: findName(text),
    // A per-100g source describes 100 g, and saying so is the difference between
    // numbers that are right and numbers quietly out by a third.
    serving_label: per100g ? "100 g" : serving.label,
    serving_grams: per100g ? 100 : serving.grams,
    kcal,
    protein,
    carbs,
    fat,
    fibre,
    missing,
    per100g,
  };
}

/** True when there is enough here to be worth filling anything in. */
export function hasAnything(parsed: ParsedNutrition): boolean {
  return (
    parsed.kcal !== undefined ||
    parsed.protein !== undefined ||
    parsed.carbs !== undefined ||
    parsed.fat !== undefined
  );
}
