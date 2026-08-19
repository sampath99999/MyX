/*
  EMI maths for the public calculator.

  The app already projects a loan the other way round — you give it the EMI your
  bank quoted and it derives the schedule (lib/loan.ts, and amortize.ts on the
  server). A calculator has to solve the inverse: from principal, rate and
  tenure, what is the EMI?

  Everything below stays in integer paise and repeats the same reducing-balance
  loop the rest of MyX uses, so a loan calculated here and then tracked in the
  app agrees to the last paise — and both agree with the bank.
*/

export interface ScheduleRow {
  month: number;
  interest: number;
  principal: number;
  balance: number;
}

export interface EmiResult {
  emi: number;
  totalInterest: number;
  totalPayable: number;
  months: number;
  schedule: ScheduleRow[];
}

/** One month's interest on the outstanding balance, rounded the way banks post it. */
export function monthlyInterest(balancePaise: number, annualRate: number): number {
  return Math.round((balancePaise * annualRate) / 12 / 100);
}

/**
 * The standard annuity formula: P·r·(1+r)^n / ((1+r)^n − 1).
 *
 * Quoted in whole rupees rounded up, which is what banks actually put on a
 * sanction letter. It also matters arithmetically: rounding to the paise leaves
 * a few rupees outstanding after the final instalment, because each month's
 * interest is itself rounded — the schedule then runs to a 241st month holding
 * a token amount. Rounding the instalment up absorbs that, so the loan clears
 * within its stated tenure with a smaller last payment, exactly as a real
 * amortisation table does.
 *
 * Zero interest is a genuine case (employer and some subsidised loans) and would
 * divide by zero here, so it is handled separately rather than producing NaN.
 */
export function computeEmi(principalPaise: number, annualRate: number, months: number): number {
  if (!(principalPaise > 0) || !(months > 0) || annualRate < 0) return 0;

  const toWholeRupees = (paise: number) => Math.ceil(paise / 100) * 100;
  if (annualRate === 0) return toWholeRupees(principalPaise / months);

  const r = annualRate / 12 / 100;
  const growth = Math.pow(1 + r, months);
  return toWholeRupees((principalPaise * r * growth) / (growth - 1));
}

/**
 * Walk the loan month by month at the given EMI.
 *
 * The last instalment is trimmed to whatever is actually left, which is why the
 * total interest here can differ by a rupee or two from principal×rate×years —
 * the same rounding your bank's statement shows.
 */
export function buildSchedule(
  principalPaise: number,
  annualRate: number,
  emiPaise: number,
  maxMonths = 600,
): EmiResult {
  const empty: EmiResult = {
    emi: emiPaise,
    totalInterest: 0,
    totalPayable: 0,
    months: 0,
    schedule: [],
  };
  if (!(principalPaise > 0) || !(emiPaise > 0)) return empty;

  // An EMI at or below the first month's interest never touches the principal:
  // the balance grows forever. Report it rather than looping to the cap.
  if (emiPaise <= monthlyInterest(principalPaise, annualRate)) return empty;

  let balance = principalPaise;
  let totalInterest = 0;
  const schedule: ScheduleRow[] = [];

  for (let month = 1; balance > 0 && month <= maxMonths; month++) {
    const interest = monthlyInterest(balance, annualRate);
    const principal = Math.min(emiPaise - interest, balance);
    balance -= principal;
    totalInterest += interest;
    schedule.push({ month, interest, principal, balance });
  }

  return {
    emi: emiPaise,
    totalInterest,
    totalPayable: principalPaise + totalInterest,
    months: schedule.length,
    schedule,
  };
}

/** Principal, rate and tenure in, EMI and full schedule out. */
export function calculateLoan(
  principalRupees: number,
  annualRate: number,
  months: number,
): EmiResult {
  const principalPaise = Math.round(principalRupees * 100);
  const emi = computeEmi(principalPaise, annualRate, months);
  return buildSchedule(principalPaise, annualRate, emi);
}

/** Paise to a rupee string with Indian digit grouping. */
export function formatRupees(paise: number, withPaise = false): string {
  return `₹${(paise / 100).toLocaleString("en-IN", {
    minimumFractionDigits: withPaise ? 2 : 0,
    maximumFractionDigits: withPaise ? 2 : 0,
  })}`;
}

/** "3y 2m" — how people say a tenure out loud. */
export function formatTenure(months: number): string {
  const y = Math.floor(months / 12);
  const m = months % 12;
  if (!y) return `${m}m`;
  return m ? `${y}y ${m}m` : `${y}y`;
}
