// Shared money input helpers.

/** Keep only digits and a single decimal point (max 2 decimals). */
export function sanitizeAmount(raw: string): string {
  let v = raw.replace(/[^\d.]/g, "");
  const firstDot = v.indexOf(".");
  if (firstDot !== -1) {
    v = v.slice(0, firstDot + 1) + v.slice(firstDot + 1).replace(/\./g, "");
    const [int, dec] = v.split(".");
    v = int + "." + dec.slice(0, 2);
  }
  return v;
}
