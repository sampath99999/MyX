/*
  Bank statement parsing, entirely in the browser.

  Deliberately client-side: a bank statement is about the most sensitive file a
  person owns, and there is no reason for it to touch a server. Only the rows
  the user confirms are ever sent, as ordinary transactions.

  No two Indian banks export the same shape. HDFC writes "Withdrawal Amt." and
  "Deposit Amt." as separate columns; ICICI uses a single signed amount; SBI
  uses "Debit"/"Credit" and a DD-MM-YY date; Kotak quotes fields containing
  commas. What follows handles that variety rather than one bank's idea of CSV.
*/

export interface ParsedRow {
  /** Original line number, so the preview can point at the offending row. */
  line: number;
  date: string | null;
  description: string;
  amount: number | null;
  type: "income" | "expense" | null;
}

export interface ParseResult {
  headers: string[];
  rows: ParsedRow[];
  /** Rows that could not be read, with the reason. Surfaced, never dropped silently. */
  skipped: { line: number; reason: string }[];
}

/**
 * Split one CSV line, honouring quotes.
 *
 * A naive split(",") breaks on "SWIGGY, BANGALORE" and on any amount written
 * as "1,234.00" — both of which appear in real statements constantly.
 */
export function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let field = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        // "" inside a quoted field is a literal quote.
        if (line[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += ch;
    } else if (ch === '"') inQuotes = true;
    else if (ch === ",") {
      out.push(field.trim());
      field = "";
    } else field += ch;
  }
  out.push(field.trim());
  return out;
}

/**
 * Parse a date in any of the forms banks actually use.
 *
 * Ambiguity is resolved in favour of DD/MM, because these are Indian bank
 * exports; an ISO-looking value is taken as ISO. Anything else is rejected
 * rather than guessed at, since a wrong date silently files a transaction in
 * the wrong month.
 */
export function parseDate(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;

  // Already ISO.
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;

  /*
    DD/MM/YYYY, DD-MM-YYYY, DD.MM.YY and friends.

    Four digits are tried before two: alternation is ordered, so (\d{2}|\d{4})
    matched the "20" of "2026" and every date silently became the year 2020.
  */
  const dmy = value.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4}|\d{2})/);
  if (dmy) {
    const day = Number(dmy[1]);
    const month = Number(dmy[2]);
    let year = Number(dmy[3]);
    if (dmy[3].length === 2) year += year < 70 ? 2000 : 1900;
    if (day < 1 || day > 31 || month < 1 || month > 12) return null;
    return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
  }

  // "05 Aug 2026" / "05-Aug-2026".
  const named = value.match(/^(\d{1,2})[\s\-]([A-Za-z]{3,})[\s\-](\d{4}|\d{2})/);
  if (named) {
    const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
    const month = months.indexOf(named[2].slice(0, 3).toLowerCase()) + 1;
    if (!month) return null;
    let year = Number(named[3]);
    if (named[3].length === 2) year += year < 70 ? 2000 : 1900;
    return `${year}-${String(month).padStart(2, "0")}-${String(Number(named[1])).padStart(2, "0")}`;
  }

  return null;
}

/**
 * Read an amount as banks print it.
 *
 * Handles "1,234.56", "₹1,234.56", "1234.56 Dr", "(1,234.56)" and a trailing
 * minus. Returns the magnitude plus whether the notation said it was money
 * going out, which the caller combines with whichever column it came from.
 */
export function parseAmount(raw: string): { value: number; negative: boolean } | null {
  const value = raw.trim();
  if (!value) return null;

  const bracketed = /^\(.*\)$/.test(value);
  const marked = /(^|[\s.])(dr|debit)\b/i.test(value);
  /*
    Strip the Dr/Cr marker before whitespace, not after. Removing spaces first
    left "500.00Dr", where \b no longer sits between "0" and "D" — so the marker
    survived, Number() saw NaN, and every marked row was silently unreadable.
  */
  const cleaned = value
    .replace(/(dr|cr|debit|credit)\.?\s*$/i, "")
    .replace(/[₹$€£,()\s]/g, "");

  const num = Number(cleaned);
  if (!Number.isFinite(num) || num === 0) return null;

  return { value: Math.abs(num), negative: bracketed || marked || num < 0 };
}

/** Column roles the importer needs filled in. */
export interface ColumnMap {
  date: number;
  description: number;
  /** A single signed amount column. */
  amount?: number;
  /** Or separate columns, as most Indian banks export. */
  debit?: number;
  credit?: number;
}

const HEADER_HINTS = {
  date: [/^(txn|transaction|value)?\s*date$/i, /date/i],
  description: [/narration|particular|description|remark|details|transaction remarks/i],
  debit: [/withdrawal|debit|paid out|dr\b/i],
  credit: [/deposit|credit|paid in|cr\b/i],
  amount: [/^amount$/i, /amount/i],
};

/** Best guess at which column is which, so the common case needs no mapping. */
export function guessColumns(headers: string[]): Partial<ColumnMap> {
  const find = (patterns: RegExp[]) => {
    for (const pattern of patterns) {
      const i = headers.findIndex((h) => pattern.test(h.trim()));
      if (i !== -1) return i;
    }
    return undefined;
  };

  const debit = find(HEADER_HINTS.debit);
  const credit = find(HEADER_HINTS.credit);

  return {
    date: find(HEADER_HINTS.date),
    description: find(HEADER_HINTS.description),
    debit,
    credit,
    // A single amount column only counts when there is no debit/credit pair,
    // or "Withdrawal Amt." would be read twice.
    amount: debit === undefined && credit === undefined ? find(HEADER_HINTS.amount) : undefined,
  };
}

/**
 * Turn raw CSV text into rows ready for review.
 *
 * Statement exports usually carry preamble — account number, address, a blank
 * line — before the real header, so the header is found by looking for the
 * first line that parses into several columns and mentions a date.
 */
export function parseStatement(text: string, map?: ColumnMap): ParseResult {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trimEnd())
    .filter((l) => l.trim().length > 0);

  if (lines.length === 0) return { headers: [], rows: [], skipped: [] };

  let headerIndex = lines.findIndex((l) => {
    const cells = splitCsvLine(l);
    return cells.length >= 3 && cells.some((cell) => /date/i.test(cell));
  });
  if (headerIndex === -1) headerIndex = 0;

  const headers = splitCsvLine(lines[headerIndex]);
  const columns = { ...guessColumns(headers), ...map } as ColumnMap;

  const rows: ParsedRow[] = [];
  const skipped: { line: number; reason: string }[] = [];

  for (let i = headerIndex + 1; i < lines.length; i++) {
    const cells = splitCsvLine(lines[i]);
    const line = i + 1;

    // Trailing summary lines ("Closing balance", totals) are shorter than the
    // header and are not transactions.
    if (cells.length < 2) continue;

    const date = columns.date !== undefined ? parseDate(cells[columns.date] ?? "") : null;
    if (!date) {
      skipped.push({ line, reason: "no readable date" });
      continue;
    }

    const description =
      columns.description !== undefined ? (cells[columns.description] ?? "").trim() : "";

    let amount: number | null = null;
    let type: "income" | "expense" | null = null;

    if (columns.debit !== undefined || columns.credit !== undefined) {
      const debit = columns.debit !== undefined ? parseAmount(cells[columns.debit] ?? "") : null;
      const credit = columns.credit !== undefined ? parseAmount(cells[columns.credit] ?? "") : null;
      if (debit) {
        amount = debit.value;
        type = "expense";
      } else if (credit) {
        amount = credit.value;
        type = "income";
      }
    } else if (columns.amount !== undefined) {
      const parsed = parseAmount(cells[columns.amount] ?? "");
      if (parsed) {
        amount = parsed.value;
        type = parsed.negative ? "expense" : "income";
      }
    }

    if (amount === null || type === null) {
      skipped.push({ line, reason: "no readable amount" });
      continue;
    }

    rows.push({ line, date, description, amount, type });
  }

  return { headers, rows, skipped };
}

/**
 * A first guess at the category, from the merchant text.
 *
 * Only a starting point — the preview lets every row be changed. Getting this
 * roughly right for the obvious cases is the difference between reviewing 200
 * rows and retyping them.
 */
const CATEGORY_HINTS: [RegExp, string][] = [
  [/swiggy|zomato|restaurant|cafe|dominos|pizza|eatery|food/i, "Food"],
  [/bigbasket|blinkit|zepto|dmart|grocer|supermarket|reliance fresh/i, "Groceries"],
  [/uber|ola|rapido|irctc|petrol|fuel|hpcl|iocl|bpcl|metro|toll|fastag/i, "Transport"],
  [/rent|landlord/i, "Housing"],
  [/electricity|water bill|gas|broadband|airtel|jio|vodafone|bsnl|wifi/i, "Utilities"],
  [/netflix|spotify|prime|hotstar|youtube|icloud|subscription/i, "Subscriptions"],
  [/amazon|flipkart|myntra|ajio|nykaa|shopping/i, "Shopping"],
  [/pharmacy|apollo|medical|hospital|clinic|doctor|health/i, "Health"],
  [/salary|payroll|stipend/i, "Salary"],
  [/emi|loan/i, "Loans"],
  [/sip|mutual fund|zerodha|groww|upstox|invest/i, "Investments"],
  [/insurance|premium|lic\b/i, "Insurance"],
];

export function guessCategory(description: string, type: "income" | "expense"): string {
  for (const [pattern, category] of CATEGORY_HINTS) {
    if (pattern.test(description)) return category;
  }
  return type === "income" ? "Income" : "Other";
}
