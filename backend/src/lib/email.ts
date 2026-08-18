import type { Env } from "../types";

/*
  Transactional email via Cloudflare's Email Sending binding.

  The binding is optional on purpose. Email Sending needs the domain onboarded
  (`wrangler email sending enable samchitech.com`), which is an account-level
  step, and local dev has no binding at all. Rather than make password reset
  fail closed in those situations, an unconfigured mailer logs the message and
  reports that it did not send — the caller decides what to do with that.

  Nothing here ever puts a reset link in a response body. The link goes to the
  mailbox or to the Worker log, both of which require access the requester has
  to already have.
*/

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export type SendResult = { sent: boolean; reason?: string };

export async function sendEmail(env: Env, message: EmailMessage): Promise<SendResult> {
  if (!env.EMAIL?.send) {
    // Local dev, or the binding not yet provisioned. Log enough to complete the
    // flow by hand without printing anything that is not already in the email.
    console.warn(
      `[email] no EMAIL binding — would have sent "${message.subject}" to ${message.to}\n${message.text}`,
    );
    return { sent: false, reason: "email-not-configured" };
  }

  try {
    await env.EMAIL.send({
      to: message.to,
      from: { email: env.EMAIL_FROM ?? "noreply@samchitech.com", name: "MyX" },
      subject: message.subject,
      html: message.html,
      // Always both: some clients only render text, and text-only-missing hurts
      // spam scoring.
      text: message.text,
    });
    return { sent: true };
  } catch (err) {
    // A send failure must not leak into the HTTP response — see routes/auth.ts,
    // where forgot-password answers identically no matter what happened.
    console.error("[email] send failed:", err);
    return { sent: false, reason: "send-failed" };
  }
}

/** The one email MyX sends. Kept here so the copy lives next to the transport. */
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
