/*
  Bank statement parsing.

  The fixtures below are the shapes real Indian bank exports actually take —
  HDFC's separate withdrawal/deposit columns, ICICI's single signed amount,
  SBI's DD-MM-YY dates, preamble rows before the header, quoted merchant names
  containing commas. A parser tested only against tidy CSV is a parser that
  fails on every file it will ever be given.
*/

import { describe, it, expect } from "vitest";
import { splitCsvLine, parseDate, parseAmount, guessColumns, parseStatement, guessCategory } from "./csv";

describe("splitCsvLine", () => {
  it("keeps commas inside quoted fields", () => {
    // "SWIGGY, BANGALORE" is one merchant, not two columns.
    expect(splitCsvLine('05/08/2026,"SWIGGY, BANGALORE",450.00')).toEqual([
      "05/08/2026",
      "SWIGGY, BANGALORE",
      "450.00",
    ]);
  });

  it("keeps thousands separators inside quoted amounts", () => {
    expect(splitCsvLine('05/08/2026,RENT,"24,000.00"')).toEqual(["05/08/2026", "RENT", "24,000.00"]);
  });

  it("reads a doubled quote as a literal one", () => {
    expect(splitCsvLine('a,"say ""hi""",b')).toEqual(["a", 'say "hi"', "b"]);
  });

  it("keeps empty cells, so column positions do not shift", () => {
    expect(splitCsvLine("05/08/2026,RENT,,24000")).toEqual(["05/08/2026", "RENT", "", "24000"]);
  });
});

describe("parseDate", () => {
  it("reads the formats banks actually print", () => {
    expect(parseDate("05/08/2026")).toBe("2026-08-05");
    expect(parseDate("05-08-2026")).toBe("2026-08-05");
    expect(parseDate("5.8.2026")).toBe("2026-08-05");
    expect(parseDate("2026-08-05")).toBe("2026-08-05");
    expect(parseDate("05-Aug-2026")).toBe("2026-08-05");
    expect(parseDate("05 August 2026")).toBe("2026-08-05");
  });

  it("reads day-first, because these are Indian statements", () => {
    // 05/08 is 5 August here, not 8 May — guessing the other way files half a
    // year of transactions into the wrong months.
    expect(parseDate("05/08/2026")).toBe("2026-08-05");
    expect(parseDate("31/01/2026")).toBe("2026-01-31");
  });

  it("expands two-digit years", () => {
    expect(parseDate("05-08-26")).toBe("2026-08-05");
    expect(parseDate("05-08-99")).toBe("1999-08-05");
  });

  it("rejects rather than guesses at nonsense", () => {
    expect(parseDate("")).toBeNull();
    expect(parseDate("Closing Balance")).toBeNull();
    expect(parseDate("45/13/2026")).toBeNull();
  });
});

describe("parseAmount", () => {
  it("strips currency and separators", () => {
    expect(parseAmount("1,234.56")).toEqual({ value: 1234.56, negative: false });
    expect(parseAmount("₹24,000.00")).toEqual({ value: 24000, negative: false });
  });

  it("recognises every way a statement says money left", () => {
    expect(parseAmount("-500")?.negative).toBe(true);
    expect(parseAmount("(500)")?.negative).toBe(true);
    expect(parseAmount("500.00 Dr")?.negative).toBe(true);
    expect(parseAmount("500.00 Cr")?.negative).toBe(false);
  });

  it("returns null for blanks and zeroes", () => {
    expect(parseAmount("")).toBeNull();
    expect(parseAmount("  ")).toBeNull();
    expect(parseAmount("0.00")).toBeNull();
  });
});

describe("guessColumns", () => {
  it("maps an HDFC-style header", () => {
    const headers = ["Date", "Narration", "Chq./Ref.No.", "Withdrawal Amt.", "Deposit Amt.", "Closing Balance"];
    expect(guessColumns(headers)).toMatchObject({ date: 0, description: 1, debit: 3, credit: 4 });
  });

  it("maps an SBI-style header", () => {
    const headers = ["Txn Date", "Description", "Debit", "Credit", "Balance"];
    expect(guessColumns(headers)).toMatchObject({ date: 0, description: 1, debit: 2, credit: 3 });
  });

  it("uses a single amount column only when there is no debit/credit pair", () => {
    expect(guessColumns(["Date", "Particulars", "Amount"])).toMatchObject({ amount: 2 });
    // Otherwise "Withdrawal Amt." would be claimed twice.
    expect(guessColumns(["Date", "Narration", "Withdrawal Amt.", "Deposit Amt."]).amount).toBeUndefined();
  });
});

describe("parseStatement", () => {
  const HDFC = `Account Number,XXXXXXXX1234
Statement of account

Date,Narration,Withdrawal Amt.,Deposit Amt.,Closing Balance
05/08/2026,"SWIGGY, BANGALORE",450.00,,"1,20,000.00"
01/08/2026,SALARY AUG,,"96,500.00","1,20,450.00"
Closing Balance,,,,120000.00`;

  it("finds the header past the statement preamble", () => {
    const result = parseStatement(HDFC);
    expect(result.headers[0]).toBe("Date");
    expect(result.rows).toHaveLength(2);
  });

  it("reads a withdrawal as an expense and a deposit as income", () => {
    const { rows } = parseStatement(HDFC);
    expect(rows[0]).toMatchObject({ date: "2026-08-05", amount: 450, type: "expense" });
    expect(rows[1]).toMatchObject({ date: "2026-08-01", amount: 96500, type: "income" });
  });

  it("reports what it skipped instead of dropping it quietly", () => {
    const { skipped } = parseStatement(HDFC);
    // The trailing "Closing Balance" line is not a transaction.
    expect(skipped).toHaveLength(1);
    expect(skipped[0].reason).toMatch(/date/);
  });

  it("handles a single signed amount column", () => {
    const icici = `Date,Particulars,Amount
05/08/2026,SWIGGY,-450.00
01/08/2026,SALARY,96500.00`;
    const { rows } = parseStatement(icici);
    expect(rows[0]).toMatchObject({ amount: 450, type: "expense" });
    expect(rows[1]).toMatchObject({ amount: 96500, type: "income" });
  });

  it("accepts an explicit mapping when the guess is wrong", () => {
    const odd = `A,B,C
05/08/2026,450.00,COFFEE`;
    const { rows } = parseStatement(odd, { date: 0, description: 2, amount: 1 });
    expect(rows[0]).toMatchObject({ description: "COFFEE", amount: 450 });
  });

  it("survives an empty file", () => {
    expect(parseStatement("")).toEqual({ headers: [], rows: [], skipped: [] });
  });
});

describe("guessCategory", () => {
  it("recognises common Indian merchants", () => {
    expect(guessCategory("SWIGGY BANGALORE", "expense")).toBe("Food");
    expect(guessCategory("UPI/ZEPTO/123", "expense")).toBe("Groceries");
    expect(guessCategory("OLA CABS", "expense")).toBe("Transport");
    expect(guessCategory("NETFLIX SUBSCRIPTION", "expense")).toBe("Subscriptions");
    expect(guessCategory("SALARY CREDIT AUG", "income")).toBe("Salary");
  });

  it("falls back by direction rather than guessing", () => {
    expect(guessCategory("NEFT/XYZ/12345", "expense")).toBe("Other");
    expect(guessCategory("NEFT/XYZ/12345", "income")).toBe("Income");
  });
});
