/*
  Transport selection and failure behaviour.

  The property that matters most is the last one tested here: a mail outage must
  never become a signup or reset outage, and must never change what the HTTP
  caller sees. Everything else is about picking the right transport.
*/

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { sendEmail } from "./email";
import type { Env } from "../types";

const MESSAGE = { to: "someone@example.com", subject: "Hello", html: "<p>Hi</p>", text: "Hi" };

function envWith(overrides: Partial<Env>): Env {
  return { EMAIL_FROM: "noreply@samchitech.com", ...overrides } as Env;
}

beforeEach(() => {
  // Quiet the deliberate console.error/warn on the failure paths.
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe("sendEmail transport selection", () => {
  it("uses Resend when a key is present", async () => {
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ id: "abc" }), { status: 200 }));

    const result = await sendEmail(envWith({ RESEND_API_KEY: "re_test_key" }), MESSAGE);

    expect(result).toEqual({ sent: true, via: "resend" });
    const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.resend.com/emails");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer re_test_key");

    const body = JSON.parse(init.body as string);
    expect(body.to).toBe(MESSAGE.to);
    // Both parts always — text-only-missing hurts deliverability.
    expect(body.html).toBe(MESSAGE.html);
    expect(body.text).toBe(MESSAGE.text);
    expect(body.from).toBe("MyX <noreply@samchitech.com>");
  });

  it("prefers Resend over the binding when both are configured", async () => {
    const send = vi.fn().mockResolvedValue(undefined);
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));

    const result = await sendEmail(
      envWith({ RESEND_API_KEY: "re_test_key", EMAIL: { send } as unknown as Env["EMAIL"] }),
      MESSAGE,
    );

    expect(result.via).toBe("resend");
    expect(send).not.toHaveBeenCalled();
  });

  it("falls back to the Cloudflare binding with no key — the local dev path", async () => {
    const send = vi.fn().mockResolvedValue(undefined);

    const result = await sendEmail(envWith({ EMAIL: { send } as unknown as Env["EMAIL"] }), MESSAGE);

    expect(result).toEqual({ sent: true, via: "binding" });
    expect(send).toHaveBeenCalledOnce();
    expect(send.mock.calls[0][0]).toMatchObject({ to: MESSAGE.to, subject: MESSAGE.subject });
  });

  it("reports not-configured when there is no transport at all", async () => {
    const result = await sendEmail(envWith({}), MESSAGE);
    expect(result).toEqual({ sent: false, reason: "email-not-configured" });
  });
});

describe("sendEmail failure handling", () => {
  it("reports a rejected Resend call without throwing", async () => {
    // What an unverified sending domain or a bad key actually looks like.
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(JSON.stringify({ message: "Domain is not verified" }), { status: 403 }),
    );

    const result = await sendEmail(envWith({ RESEND_API_KEY: "re_test_key" }), MESSAGE);
    expect(result).toEqual({ sent: false, reason: "resend-403" });
  });

  it("swallows a network failure rather than throwing at the caller", async () => {
    vi.spyOn(globalThis, "fetch").mockRejectedValue(new Error("connection reset"));

    // If this rejected, /forgot and /register would 500 — a mail outage must not
    // become a signup outage.
    const result = await sendEmail(envWith({ RESEND_API_KEY: "re_test_key" }), MESSAGE);
    expect(result).toEqual({ sent: false, reason: "send-failed" });
  });

  it("swallows a binding failure too", async () => {
    const send = vi.fn().mockRejectedValue(new Error("not entitled"));
    const result = await sendEmail(envWith({ EMAIL: { send } as unknown as Env["EMAIL"] }), MESSAGE);
    expect(result).toEqual({ sent: false, reason: "send-failed" });
  });

  it("never puts the message body in the returned value", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("nope", { status: 500 }));

    const result = await sendEmail(envWith({ RESEND_API_KEY: "re_test_key" }), {
      ...MESSAGE,
      text: "Your code is 123456",
    });
    expect(JSON.stringify(result)).not.toContain("123456");
  });
});
