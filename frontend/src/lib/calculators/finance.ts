/*
  The maths behind the public calculators.

  Every function here is pure, takes plain rupees (not paise) and returns plain
  numbers, so each one is trivially testable — see finance.test.ts. Nothing in
  this file touches React, the DOM or the network.

  Two rules the whole file follows:

  1. **Match the convention people are used to.** An FD in India compounds
     quarterly, an RD compounds quarterly on each instalment separately, a SIP
     is invested at the start of the month. Being "more correct" than the bank
     produces a number that disagrees with the customer's passbook, which is
     worse than useless on a calculator people are checking against a real
     account.
  2. **Say which convention was used.** Where a choice exists, the comment names
     it, and the page shows an assumptions note. A calculator that silently
     picks one of three defensible answers is how these pages lose trust.
*/

/** Years → months, guarding the junk a number input can hand us. */
const monthsIn = (years: number) => Math.max(0, Math.round(years * 12));

const finite = (n: number) => (Number.isFinite(n) ? n : 0);

/* ------------------------------------------------------------------ SIP */

export interface GrowthPoint {
  /** 1-based year. */
  year: number;
  invested: number;
  value: number;
}

export interface GrowthResult {
  invested: number;
  value: number;
  returns: number;
  series: GrowthPoint[];
}

/**
 * A monthly SIP, invested at the *start* of each month.
 *
 * FV = P × [((1+i)^n − 1) / i] × (1+i), where i is the monthly rate and n the
 * number of instalments. The trailing (1+i) is the "start of month" assumption
 * — it is what every Indian fund house and comparison site uses, and dropping
 * it understates a 20-year SIP by roughly one month's growth.
 */
export function sip(monthly: number, annualRate: number, years: number): GrowthResult {
  const n = monthsIn(years);
  const i = annualRate / 12 / 100;
  const series: GrowthPoint[] = [];

  let value = 0;
  let invested = 0;
  for (let m = 1; m <= n; m++) {
    invested += monthly;
    value = (value + monthly) * (1 + i);
    if (m % 12 === 0 || m === n) {
      series.push({ year: Math.ceil(m / 12), invested, value: finite(value) });
    }
  }

  return {
    invested,
    value: finite(value),
    returns: finite(value) - invested,
    series,
  };
}

/**
 * A SIP that goes up once a year — the "step-up" or "top-up" SIP.
 *
 * The instalment rises by `stepUpPercent` on each anniversary, which is how
 * these are actually sold (your salary went up, so does the SIP). Modelled
 * month by month rather than with a closed form, because the closed form for a
 * growing annuity breaks when the step-up equals the return rate.
 */
export function stepUpSip(
  monthly: number,
  annualRate: number,
  years: number,
  stepUpPercent: number,
): GrowthResult {
  const n = monthsIn(years);
  const i = annualRate / 12 / 100;
  const step = 1 + stepUpPercent / 100;
  const series: GrowthPoint[] = [];

  let value = 0;
  let invested = 0;
  let instalment = monthly;
  for (let m = 1; m <= n; m++) {
    if (m > 1 && (m - 1) % 12 === 0) instalment *= step;
    invested += instalment;
    value = (value + instalment) * (1 + i);
    if (m % 12 === 0 || m === n) {
      series.push({ year: Math.ceil(m / 12), invested, value: finite(value) });
    }
  }

  return { invested, value: finite(value), returns: finite(value) - invested, series };
}

/** A one-off investment compounding annually: FV = P(1+r)^t. */
export function lumpsum(amount: number, annualRate: number, years: number): GrowthResult {
  const r = annualRate / 100;
  const series: GrowthPoint[] = [];
  const wholeYears = Math.max(1, Math.round(years));

  for (let y = 1; y <= wholeYears; y++) {
    series.push({ year: y, invested: amount, value: finite(amount * Math.pow(1 + r, y)) });
  }

  const value = finite(amount * Math.pow(1 + r, years));
  return { invested: amount, value, returns: value - amount, series };
}

/* --------------------------------------------------------------- SWP */

export interface SwpResult {
  /** What is left at the end. Zero once the corpus is exhausted. */
  finalBalance: number;
  totalWithdrawn: number;
  /** The month the corpus runs dry, or null if it survives the full term. */
  exhaustedInMonth: number | null;
  series: { year: number; balance: number; withdrawn: number }[];
}

/**
 * A systematic withdrawal plan: take `monthly` out, let the rest keep growing.
 *
 * The withdrawal happens at the end of the month, after that month's growth —
 * the order matters over a long horizon and this is the conservative reading.
 */
export function swp(
  corpus: number,
  monthly: number,
  annualRate: number,
  years: number,
): SwpResult {
  const n = monthsIn(years);
  const i = annualRate / 12 / 100;
  const series: { year: number; balance: number; withdrawn: number }[] = [];

  let balance = corpus;
  let withdrawn = 0;
  let exhaustedInMonth: number | null = null;

  for (let m = 1; m <= n; m++) {
    if (balance <= 0) {
      if (exhaustedInMonth === null) exhaustedInMonth = m;
    } else {
      balance *= 1 + i;
      const take = Math.min(monthly, balance);
      balance -= take;
      withdrawn += take;
      if (balance <= 0 && exhaustedInMonth === null) exhaustedInMonth = m;
    }
    if (m % 12 === 0 || m === n) {
      series.push({ year: Math.ceil(m / 12), balance: Math.max(0, finite(balance)), withdrawn });
    }
  }

  return {
    finalBalance: Math.max(0, finite(balance)),
    totalWithdrawn: withdrawn,
    exhaustedInMonth,
    series,
  };
}

/* --------------------------------------------------------------- deposits */

/**
 * A fixed deposit. Indian banks compound FDs **quarterly** unless the product
 * says otherwise, so that is the default here.
 */
export function fd(
  principal: number,
  annualRate: number,
  years: number,
  compoundsPerYear = 4,
): GrowthResult {
  const n = compoundsPerYear;
  const r = annualRate / 100;
  const series: GrowthPoint[] = [];
  const wholeYears = Math.max(1, Math.round(years));

  for (let y = 1; y <= wholeYears; y++) {
    series.push({
      year: y,
      invested: principal,
      value: finite(principal * Math.pow(1 + r / n, n * y)),
    });
  }

  const value = finite(principal * Math.pow(1 + r / n, n * years));
  return { invested: principal, value, returns: value - principal, series };
}

/**
 * A recurring deposit.
 *
 * Each instalment is a separate deposit that compounds quarterly for however
 * long it is in the account — the first one for the full term, the last one for
 * a single month. Summing them is what banks do; the single closed-form "RD
 * formula" floating around the internet is an approximation of exactly this.
 */
export function rd(monthly: number, annualRate: number, years: number): GrowthResult {
  const n = monthsIn(years);
  const quarterlyRate = annualRate / 400;
  const series: GrowthPoint[] = [];

  let invested = 0;
  for (let m = 1; m <= n; m++) {
    invested += monthly;
    if (m % 12 === 0 || m === n) {
      // Re-sum at each checkpoint so the series shows true maturity value to date.
      let value = 0;
      for (let k = 1; k <= m; k++) {
        const monthsHeld = m - k + 1;
        value += monthly * Math.pow(1 + quarterlyRate, (4 * monthsHeld) / 12);
      }
      series.push({ year: Math.ceil(m / 12), invested, value: finite(value) });
    }
  }

  const value = series.length ? series[series.length - 1].value : 0;
  return { invested, value, returns: value - invested, series };
}

/**
 * PPF: an annual deposit, interest credited annually on the running balance.
 *
 * Real PPF interest is computed on the lowest balance between the 5th and the
 * last day of each month, so depositing in April earns materially more than
 * depositing in March. Modelling that needs a deposit *date*, which is a
 * control nobody wants on a quick calculator — this uses the standard
 * "deposit, then compound" convention every comparison site uses, and the page
 * says so.
 */
export function ppf(yearlyDeposit: number, annualRate: number, years: number): GrowthResult {
  const r = annualRate / 100;
  const series: GrowthPoint[] = [];
  const wholeYears = Math.max(1, Math.round(years));

  let balance = 0;
  let invested = 0;
  for (let y = 1; y <= wholeYears; y++) {
    invested += yearlyDeposit;
    balance = (balance + yearlyDeposit) * (1 + r);
    series.push({ year: y, invested, value: finite(balance) });
  }

  return { invested, value: finite(balance), returns: finite(balance) - invested, series };
}

/* --------------------------------------------------------------- interest */

/** A = P(1 + r/n)^(nt). `compoundsPerYear` of 1 is annual, 4 quarterly, 12 monthly. */
export function compoundInterest(
  principal: number,
  annualRate: number,
  years: number,
  compoundsPerYear = 1,
): GrowthResult {
  return fd(principal, annualRate, years, compoundsPerYear);
}

export interface SimpleInterestResult {
  interest: number;
  total: number;
  principal: number;
}

/** I = P × r × t ÷ 100. No compounding at all, which is the point of it. */
export function simpleInterest(
  principal: number,
  annualRate: number,
  years: number,
): SimpleInterestResult {
  const interest = finite((principal * annualRate * years) / 100);
  return { interest, total: principal + interest, principal };
}

/**
 * Compound annual growth rate, as a percentage.
 *
 * Returns null where the answer would be meaningless — a zero or negative
 * starting value, or a zero term. Showing "Infinity%" is worse than showing
 * nothing.
 */
export function cagr(begin: number, end: number, years: number): number | null {
  if (!(begin > 0) || !(end > 0) || !(years > 0)) return null;
  return finite((Math.pow(end / begin, 1 / years) - 1) * 100);
}

/* --------------------------------------------------------------- misc */

export interface GstResult {
  base: number;
  gst: number;
  total: number;
  cgst: number;
  sgst: number;
}

/**
 * GST added to, or stripped out of, an amount.
 *
 * `mode: "exclusive"` treats the amount as pre-tax and adds GST on top;
 * `"inclusive"` treats it as the final price and works backwards. Getting these
 * two the wrong way round is the single most common mistake on GST
 * calculators, so both are offered explicitly rather than guessed.
 *
 * CGST and SGST are each half the total for an intra-state supply; an
 * inter-state supply is the same total as IGST.
 */
export function gst(amount: number, ratePercent: number, mode: "exclusive" | "inclusive"): GstResult {
  const r = ratePercent / 100;
  const base = mode === "exclusive" ? amount : finite(amount / (1 + r));
  const tax = mode === "exclusive" ? finite(amount * r) : amount - base;
  return { base, gst: tax, total: base + tax, cgst: tax / 2, sgst: tax / 2 };
}

export interface InflationResult {
  /** What today's basket costs after `years` of inflation. */
  futureCost: number;
  /** What today's money is worth in today's terms after `years`. */
  futureValueOfToday: number;
  erosion: number;
  series: { year: number; cost: number }[];
}

/** Both directions, because "what will it cost" and "what will my money be
 *  worth" are the two questions people actually mean by this. */
export function inflation(amount: number, annualRate: number, years: number): InflationResult {
  const r = annualRate / 100;
  const wholeYears = Math.max(1, Math.round(years));
  const series: { year: number; cost: number }[] = [];
  for (let y = 1; y <= wholeYears; y++) {
    series.push({ year: y, cost: finite(amount * Math.pow(1 + r, y)) });
  }
  const futureCost = finite(amount * Math.pow(1 + r, years));
  const futureValueOfToday = finite(amount / Math.pow(1 + r, years));
  return {
    futureCost,
    futureValueOfToday,
    erosion: amount - futureValueOfToday,
    series,
  };
}
