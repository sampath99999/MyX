// Convert a rupee amount to words using the Indian numbering system
// (thousand / lakh / crore). e.g. 123456.50 -> "One Lakh Twenty Three Thousand
// Four Hundred Fifty Six Rupees and Fifty Paise".

const ONES = [
  "", "One", "Two", "Three", "Four", "Five", "Six", "Seven", "Eight", "Nine",
  "Ten", "Eleven", "Twelve", "Thirteen", "Fourteen", "Fifteen", "Sixteen",
  "Seventeen", "Eighteen", "Nineteen",
];
const TENS = ["", "", "Twenty", "Thirty", "Forty", "Fifty", "Sixty", "Seventy", "Eighty", "Ninety"];

function twoDigits(n: number): string {
  if (n < 20) return ONES[n];
  return TENS[Math.floor(n / 10)] + (n % 10 ? " " + ONES[n % 10] : "");
}

function threeDigits(n: number): string {
  const hundred = Math.floor(n / 100);
  const rest = n % 100;
  let out = "";
  if (hundred) out += ONES[hundred] + " Hundred";
  if (rest) out += (out ? " " : "") + twoDigits(rest);
  return out;
}

function intToWords(n: number): string {
  if (n === 0) return "Zero";
  let words = "";
  const crore = Math.floor(n / 10_000_000);
  n %= 10_000_000;
  const lakh = Math.floor(n / 100_000);
  n %= 100_000;
  const thousand = Math.floor(n / 1000);
  n %= 1000;
  const hundred = n;

  if (crore) words += threeDigits(crore) + " Crore ";
  if (lakh) words += twoDigits(lakh) + " Lakh ";
  if (thousand) words += twoDigits(thousand) + " Thousand ";
  if (hundred) words += threeDigits(hundred);
  return words.trim();
}

/** Returns "" for empty/zero/invalid so callers can show a placeholder instead. */
export function amountToWords(amount: number): string {
  if (!Number.isFinite(amount) || amount <= 0) return "";
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);

  const parts: string[] = [];
  if (rupees > 0) parts.push(`${intToWords(rupees)} Rupee${rupees === 1 ? "" : "s"}`);
  if (paise > 0) parts.push(`${intToWords(paise)} Paise`);
  return parts.join(" and ");
}
