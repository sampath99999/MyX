// Reducing-balance amortization in integer paise (matches monthly-rest banks).
// interest_month = round(balance * annualRate / 12 / 100)
// principal_month = emi - interest_month  (clamped to remaining balance on the last EMI)

export interface AmortRow {
  month: number;
  interest: number; // paise
  principal: number; // paise
  payment: number; // paise
  balance: number; // paise, after this payment
}

export interface AmortResult {
  rows: AmortRow[];
  months: number;
  totalInterest: number; // paise
  totalPaid: number; // paise
  coversInterest: boolean; // false if EMI can't cover first month's interest
}

/** Monthly interest on a balance, rounded to paise. */
export function monthlyInterest(balancePaise: number, annualRate: number): number {
  return Math.round((balancePaise * annualRate) / 12 / 100);
}

/**
 * Project the full schedule from a starting balance at a fixed rate & EMI.
 * Capped at maxMonths to avoid infinite loops when the EMI is too small.
 */
export function projectSchedule(
  balancePaise: number,
  annualRate: number,
  emiPaise: number,
  maxMonths = 1200,
): AmortResult {
  const firstInterest = monthlyInterest(balancePaise, annualRate);
  if (emiPaise <= firstInterest) {
    return { rows: [], months: 0, totalInterest: 0, totalPaid: 0, coversInterest: false };
  }

  const rows: AmortRow[] = [];
  let bal = balancePaise;
  let month = 0;
  let totalInterest = 0;
  let totalPaid = 0;

  while (bal > 0 && month < maxMonths) {
    month++;
    const interest = monthlyInterest(bal, annualRate);
    let principal = emiPaise - interest;
    if (principal > bal) principal = bal; // final EMI is smaller
    const payment = principal + interest;
    bal -= principal;
    totalInterest += interest;
    totalPaid += payment;
    rows.push({ month, interest, principal, payment, balance: bal });
  }

  return { rows, months: month, totalInterest, totalPaid, coversInterest: true };
}
