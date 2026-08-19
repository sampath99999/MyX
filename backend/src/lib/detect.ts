/*
  Finding the bills already hiding in someone's transactions.

  After importing a bank statement an account has hundreds of rows, and the ones
  that repeat every month — rent, Netflix, the SIP, the phone bill — are exactly
  the ones worth turning into recurring rules. Asking the user to spot them and
  retype them is asking them to do work the data already answers.

  Pure functions on purpose: the interesting part is the judgement about what
  counts as regular, and that is much easier to be sure of in a test than
  through a database.
*/

export interface TxnLike {
  type: "income" | "expense";
  amount: number; // paise
  category: string;
  note: string | null;
  occurred_on: string; // YYYY-MM-DD
}

export interface Suggestion {
  signature: string;
  name: string;
  type: "income" | "expense";
  /** paise — the median, so one odd month cannot drag the proposal. */
  amount: number;
  category: string;
  frequency: "weekly" | "monthly" | "yearly";
  interval: number;
  next_due: string;
  occurrences: number;
  last_seen: string;
  /** 0–1. How regular this actually looked; the UI leads with the best ones. */
  confidence: number;
}

/** Occurrences below this are a coincidence, not a pattern. */
const MIN_OCCURRENCES = 3;
/** How far back to look. Long enough for a yearly bill to show up twice. */
export const LOOKBACK_DAYS = 400;

/**
 * Reduces a bank description to what is stable about it.
 *
 * Statement narrations carry the date, a reference number and often the amount:
 *   "UPI/NETFLIX/423891/08AUG26" and "UPI/NETFLIX/518203/08SEP26"
 * are the same subscription. Stripping digits is crude and it is the single
 * highest-value thing here — without it every month looks like a new payee.
 */
export function signatureOf(note: string | null, category: string): string {
  const base = (note ?? "").toLowerCase();
  const cleaned = base
    .replace(/\d+/g, " ")
    // Month names in narrations survive the digit strip and would otherwise
    // split one bill into twelve.
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)\b/g, " ")
    // Everything a bank uses as a separator.
    .replace(/[^a-z ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // Some rows have no note at all (a bare "Food" expense). Falling back to the
  // category keeps those groupable instead of collapsing them all into "".
  return cleaned.length >= 3 ? cleaned : `category:${category.toLowerCase()}`;
}

const daysBetween = (a: string, b: string) =>
  Math.round(
    (new Date(`${b}T00:00:00Z`).getTime() - new Date(`${a}T00:00:00Z`).getTime()) / 86_400_000,
  );

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

/** The shape of a gap, or null when it is not one of the rhythms we name. */
function classify(gapDays: number): { frequency: Suggestion["frequency"]; interval: number } | null {
  // Windows rather than exact numbers: months are 28–31 days, bills land on
  // weekends, and a direct debit can slip a day or two.
  if (gapDays >= 6 && gapDays <= 8) return { frequency: "weekly", interval: 1 };
  if (gapDays >= 13 && gapDays <= 16) return { frequency: "weekly", interval: 2 };
  if (gapDays >= 26 && gapDays <= 35) return { frequency: "monthly", interval: 1 };
  if (gapDays >= 58 && gapDays <= 66) return { frequency: "monthly", interval: 2 };
  if (gapDays >= 85 && gapDays <= 97) return { frequency: "monthly", interval: 3 };
  if (gapDays >= 355 && gapDays <= 375) return { frequency: "yearly", interval: 1 };
  return null;
}

/** Advance a date by one period. Mirrors advanceDate() in routes/recurring.ts. */
function advance(iso: string, frequency: Suggestion["frequency"], interval: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (frequency === "weekly") {
    date.setUTCDate(date.getUTCDate() + 7 * interval);
  } else if (frequency === "monthly") {
    const target = date.getUTCMonth() + interval;
    const year = date.getUTCFullYear() + Math.floor(target / 12);
    const month = ((target % 12) + 12) % 12;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    date.setUTCFullYear(year, month, Math.min(d, lastDay));
  } else {
    date.setUTCFullYear(date.getUTCFullYear() + interval);
  }
  return date.toISOString().slice(0, 10);
}

/** The most frequent value, ties broken by first appearance. */
function mode<T>(values: T[]): T {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best = values[0];
  let bestCount = 0;
  for (const [value, count] of counts) {
    if (count > bestCount) {
      best = value;
      bestCount = count;
    }
  }
  return best;
}

/** "netflix subscription" -> "Netflix Subscription" */
function titleCase(text: string): string {
  return text
    .split(" ")
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/**
 * Groups transactions into candidate recurring rules.
 *
 * `today` is a parameter rather than read from the clock so the behaviour is
 * pinnable in a test.
 */
export function detectRecurring(transactions: TxnLike[], today: string): Suggestion[] {
  const groups = new Map<string, TxnLike[]>();
  for (const t of transactions) {
    const key = `${t.type}|${signatureOf(t.note, t.category)}`;
    const list = groups.get(key);
    if (list) list.push(t);
    else groups.set(key, [t]);
  }

  const suggestions: Suggestion[] = [];

  for (const [key, rows] of groups) {
    if (rows.length < MIN_OCCURRENCES) continue;

    const dates = [...new Set(rows.map((r) => r.occurred_on))].sort();
    if (dates.length < MIN_OCCURRENCES) continue;

    const gaps: number[] = [];
    for (let i = 1; i < dates.length; i++) gaps.push(daysBetween(dates[i - 1], dates[i]));

    const typical = classify(median(gaps));
    if (!typical) continue;

    /*
      A regular gap is not enough on its own — "three payments 30 days apart"
      also describes three unrelated purchases that happened to land monthly.
      The amounts have to agree too, and how tightly they agree is most of the
      confidence score.
    */
    const amounts = rows.map((r) => r.amount);
    const typicalAmount = median(amounts);
    if (typicalAmount <= 0) continue;
    const spread =
      amounts.reduce((worst, a) => Math.max(worst, Math.abs(a - typicalAmount)), 0) / typicalAmount;
    if (spread > 0.25) continue;

    // How many gaps actually matched the rhythm, rather than just the median.
    const onRhythm = gaps.filter((g) => {
      const c = classify(g);
      return c?.frequency === typical.frequency && c.interval === typical.interval;
    }).length;
    const regularity = onRhythm / gaps.length;
    if (regularity < 0.6) continue;

    const lastSeen = dates[dates.length - 1];
    let nextDue = advance(lastSeen, typical.frequency, typical.interval);
    // A bill whose next date has already passed is due now, not in the past.
    while (nextDue < today) nextDue = advance(nextDue, typical.frequency, typical.interval);

    const signature = key.split("|").slice(1).join("|");
    const rawName = mode(rows.map((r) => (r.note ?? "").trim()).filter(Boolean));

    suggestions.push({
      signature,
      name: rawName ? rawName.slice(0, 60) : titleCase(signature.replace(/^category:/, "")),
      type: rows[0].type,
      amount: typicalAmount,
      category: mode(rows.map((r) => r.category)),
      frequency: typical.frequency,
      interval: typical.interval,
      next_due: nextDue,
      occurrences: dates.length,
      last_seen: lastSeen,
      // More history and tighter amounts both mean more certainty; five
      // occurrences is treated as "as much evidence as we need".
      confidence:
        Math.round(
          (regularity * 0.5 + (1 - Math.min(spread / 0.25, 1)) * 0.3 + Math.min(dates.length / 5, 1) * 0.2) *
            100,
        ) / 100,
    });
  }

  return suggestions.sort(
    (a, b) => b.confidence - a.confidence || b.occurrences - a.occurrences,
  );
}
