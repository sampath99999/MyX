import type { Env } from "../types";

/*
  Transactional email.

  Three transports, tried in order, because each one covers a case the others
  cannot:

    1. Resend — production. An HTTP API, which matters more than it sounds:
       Workers cannot open an SMTP connection, so every "free SMTP server" is
       unusable here regardless of its quota. Free tier is 3,000/month and
       100/day on one verified domain, which is far more than password resets
       and signup codes need.
    2. Cloudflare's send_email binding — kept because `wrangler dev` simulates
       it, so the whole flow can be exercised locally with no API key and no
       real mail leaving the machine. Sending for real through it needs the
       $5/month Workers Paid plan, which is why it is not first.
    3. Logging — local dev and any misconfiguration. The message goes to the
       Worker log and the caller is told it did not send.

  Nothing here ever returns a code or a reset link to the HTTP caller. It goes
  to the mailbox or to the log, both of which need access the requester must
  already have.
*/

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type SendResult = { sent: boolean; via?: "resend" | "binding"; reason?: string };

const RESEND_ENDPOINT = "https://api.resend.com/emails";

function fromAddress(env: Env): string {
  const address = env.EMAIL_FROM ?? "noreply@samchitech.com";
  // Resend accepts "Name <addr>"; a bare address works too but shows the raw
  // mailbox as the sender name in most clients.
  return `MyX <${address}>`;
}

async function sendViaResend(env: Env, message: EmailMessage): Promise<SendResult> {
  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: fromAddress(env),
      to: message.to,
      subject: message.subject,
      html: message.html,
      // Always both: some clients render only text, and a missing text part
      // hurts spam scoring.
      text: message.text,
    }),
  });

  if (!res.ok) {
    // Body carries the reason (unverified domain, bad key, quota). Logged, never
    // returned — see the callers, which answer identically either way.
    const detail = await res.text().catch(() => "");
    console.error(`[email] resend rejected ${res.status}: ${detail.slice(0, 300)}`);
    return { sent: false, reason: `resend-${res.status}` };
  }

  return { sent: true, via: "resend" };
}

async function sendViaBinding(env: Env, message: EmailMessage): Promise<SendResult> {
  await env.EMAIL!.send({
    to: message.to,
    from: { email: env.EMAIL_FROM ?? "noreply@samchitech.com", name: "MyX" },
    subject: message.subject,
    html: message.html,
    text: message.text,
  });
  return { sent: true, via: "binding" };
}

export async function sendEmail(env: Env, message: EmailMessage): Promise<SendResult> {
  try {
    if (env.RESEND_API_KEY) return await sendViaResend(env, message);
    if (env.EMAIL?.send) return await sendViaBinding(env, message);
  } catch (err) {
    // A transport failure must never surface in the HTTP response.
    console.error("[email] send failed:", err);
    return { sent: false, reason: "send-failed" };
  }

  console.warn(
    `[email] no transport configured — would have sent "${message.subject}" to ${message.to}\n${message.text}`,
  );
  return { sent: false, reason: "email-not-configured" };
}

/** Password reset. Copy lives beside the transport that carries it. */
export function passwordResetEmail(link: string, minutes: number): Omit<EmailMessage, "to"> {
  const text = [
    "Reset your MyX password",
    "",
    `Open this link to choose a new password. It expires in ${minutes} minutes and can only be used once:`,
    link,
    "",
    "If you did not ask for this, you can ignore this email — your password has not changed.",
  ].join("\n");

  const html = `<!doctype html>
<html><body style="margin:0;padding:24px;background:#f5f5f7;font-family:system-ui,-apple-system,'Segoe UI',sans-serif;color:#18181b">
  <div style="max-width:520px;margin:0 auto;background:#fff;border-radius:14px;padding:32px">
    <h1 style="margin:0 0 16px;font-size:20px">Reset your MyX password</h1>
    <p style="margin:0 0 24px;line-height:1.6;color:#52525b">
      Open the link below to choose a new password. It expires in ${minutes} minutes and can only be used once.
    </p>
    <a href="${link}" style="display:inline-block;background:#6b56ee;color:#fff;text-decoration:none;padding:12px 22px;border-radius:10px;font-weight:600">Choose a new password</a>
    <p style="margin:24px 0 0;line-height:1.6;color:#71717a;font-size:13px">
      If you did not ask for this you can ignore this email — your password has not changed.
    </p>
  </div>
</body></html>`;

  return { subject: "Reset your MyX password", html, text };
}
