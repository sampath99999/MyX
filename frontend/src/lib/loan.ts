// Frontend loan projection — mirrors the backend amortize.ts (integer paise,
// monthly reducing balance) so the "live preview" in the dialog matches what
// the server will store, which in turn matches the bank.

function monthlyInterestPaise(balance: number, annualRate: number): number {
  return Math.round((balance * annualRate) / 12 / 100);
}

export interface LoanPreview {
  coversInterest: boolean;
  months: number;
  years: string; // e.g. "3y 2m"
  totalInterest: number; // rupees
  totalPaid: number; // rupees
  firstInterest: number; // rupees
  firstPrincipal: number; // rupees
}

/** Project a loan from rupee inputs. Returns null if inputs are incomplete. */
export function previewLoan(
  principalRupees: number,
  annualRate: number,
  emiRupees: number,
): LoanPreview | null {
  if (
    !Number.isFinite(principalRupees) ||
    principalRupees <= 0 ||
    !Number.isFinite(annualRate) ||
    annualRate < 0 ||
    !Number.isFinite(emiRupees) ||
    emiRupees <= 0
  ) {
    return null;
  }

  const balance0 = Math.round(principalRupees * 100);
  const emi = Math.round(emiRupees * 100);
  const firstInterest = monthlyInterestPaise(balance0, annualRate);
  if (emi <= firstInterest) {
    return {
      coversInterest: false,
      months: 0,
      years: "",
      totalInterest: 0,
      totalPaid: 0,
      firstInterest: firstInterest / 100,
      firstPrincipal: 0,
    };
  }

  let bal = balance0;
  let month = 0;
  let totalInterest = 0;
  while (bal > 0 && month < 1200) {
    month++;
    const i = monthlyInterestPaise(bal, annualRate);
    let p = emi - i;
    if (p > bal) p = bal;
    bal -= p;
    totalInterest += i;
  }

  const y = Math.floor(month / 12);
  const m = month % 12;
  return {
    coversInterest: true,
    months: month,
    years: y > 0 ? `${y}y${m > 0 ? ` ${m}m` : ""}` : `${m}m`,
    totalInterest: totalInterest / 100,
    totalPaid: (balance0 + totalInterest) / 100,
    firstInterest: firstInterest / 100,
    firstPrincipal: (emi - firstInterest) / 100,
  };
}
