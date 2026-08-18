/*
  One-time codes for email verification.

  A 6-digit code is a deliberate trade: it is short enough to retype from a
  phone, which is the entire point, and short enough that the *code* is not what
  makes this safe. What makes it safe is the surrounding policy — a 15-minute
  life, at most 5 guesses, and a new request replacing the old code rather than
  adding to it. Those three together bound an attacker to 5 tries in a million
  per window.
*/

export const OTP_TTL_SECONDS = 15 * 60;
export const OTP_MAX_ATTEMPTS = 5;
export const OTP_LENGTH = 6;

/**
 * Six digits from the CSPRNG.
 *
 * Rejection sampling rather than `% 1000000`: a plain modulo over a 32-bit draw
 * makes the low codes fractionally likelier, and there is no reason to accept a
 * biased distribution when discarding the rare out-of-range draw is free.
 */
export function generateOtp(): string {
  const ceiling = 1_000_000;
  const limit = Math.floor(0xffffffff / ceiling) * ceiling;
  const buf = new Uint32Array(1);
  let draw: number;
  do {
    crypto.getRandomValues(buf);
    draw = buf[0];
  } while (draw >= limit);
  return String(draw % ceiling).padStart(OTP_LENGTH, "0");
}

export async function hashOtp(code: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(code));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Accepts "123 456" and "123-456" — people paste codes the way they see them. */
export function normalizeOtp(input: unknown): string {
  return String(input ?? "").replace(/\D/g, "");
}

export function isWellFormedOtp(code: string): boolean {
  return new RegExp(`^\\d{${OTP_LENGTH}}$`).test(code);
}

/** The verification email. Kept beside the code rules it describes. */
export function verificationEmail(code: string, minutes: number) {
  const text = [
    `Your MyX verification code is ${code}`,
    "",
    `Enter it in the app to confirm this address. It expires in ${minutes} minutes.`,
    "",
    "If you did not create a MyX account, you can ignore this email.",
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f5f7;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#18181b">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:32px">
    <h1 style="margin:0 0 16px;font-size:20px">Confirm your email</h1>
    <p style="margin:0 0 24px;line-height:1.6;color:#52525b">Enter this code in MyX to finish setting up your account.</p>
    <div style="font-size:34px;font-weight:700;letter-spacing:10px;background:#f4f4f5;border-radius:12px;padding:18px;text-align:center">${code}</div>
    <p style="margin:24px 0 0;line-height:1.6;color:#71717a;font-size:13px">
      It expires in ${minutes} minutes. If you did not create a MyX account you can ignore this email.
    </p>
  </div>
</body></html>`;

  return { subject: `${code} is your MyX verification code`, html, text };
}
