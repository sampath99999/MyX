import { describe, it, expect } from "vitest";
import {
  hashPassword,
  verifyPassword,
  signToken,
  verifyToken,
  shouldRenew,
  TOKEN_TTL_SECONDS,
  MAX_PASSWORD_LENGTH,
  MIN_PASSWORD_LENGTH,
  type JwtPayload,
} from "./auth";

const SECRET = "test-secret-do-not-use";
const USER = { id: 7, email: "a@b.co", name: "Ada L", token_version: 3 };

describe("password hashing", () => {
  it("round-trips a correct password", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(await verifyPassword("correct horse battery", stored)).toBe(true);
  });

  it("rejects a wrong password", async () => {
    const stored = await hashPassword("correct horse battery");
    expect(await verifyPassword("Correct horse battery", stored)).toBe(false);
    expect(await verifyPassword("", stored)).toBe(false);
  });

  it("salts per user, so identical passwords hash differently", async () => {
    const a = await hashPassword("same-password");
    const b = await hashPassword("same-password");
    expect(a).not.toBe(b);
    expect(await verifyPassword("same-password", a)).toBe(true);
    expect(await verifyPassword("same-password", b)).toBe(true);
  });

  it("stores the parameters alongside the hash so cost can be raised later", async () => {
    const [scheme, iterations] = (await hashPassword("x")).split("$");
    expect(scheme).toBe("pbkdf2");
    expect(Number(iterations)).toBeGreaterThanOrEqual(100_000);
  });

  it("returns false on a malformed stored hash instead of throwing", async () => {
    for (const bad of ["", "nonsense", "pbkdf2$100000$onlythree", "bcrypt$1$2$3"]) {
      await expect(verifyPassword("x", bad)).resolves.toBe(false);
    }
  });

  it("keeps the configured password bounds sane", () => {
    expect(MIN_PASSWORD_LENGTH).toBeGreaterThanOrEqual(8);
    // Unbounded input would make each attempt an arbitrarily expensive hash.
    expect(MAX_PASSWORD_LENGTH).toBeLessThanOrEqual(256);
    expect(MAX_PASSWORD_LENGTH).toBeGreaterThan(MIN_PASSWORD_LENGTH);
  });
});

describe("tokens", () => {
  it("round-trips a signed token", async () => {
    const payload = await verifyToken(await signToken(USER, SECRET), SECRET);
    expect(payload.sub).toBe(USER.id);
    expect(payload.email).toBe(USER.email);
  });

  it("rejects a token signed with a different secret", async () => {
    const token = await signToken(USER, SECRET);
    await expect(verifyToken(token, "other-secret")).rejects.toThrow();
  });

  it("carries the token version so revocation can be enforced", async () => {
    const payload = await verifyToken(await signToken(USER, SECRET), SECRET);
    expect(payload.tv).toBe(3);
  });

  it("defaults token version to 0 for a user row that predates the column", async () => {
    const payload = await verifyToken(
      await signToken({ id: 1, email: "x@y.z", name: "X" }, SECRET),
      SECRET,
    );
    expect(payload.tv).toBe(0);
  });

  it("expires within a day, bounding the damage from a stolen token", async () => {
    const payload = await verifyToken(await signToken(USER, SECRET), SECRET);
    expect(payload.exp - payload.iat).toBe(TOKEN_TTL_SECONDS);
    expect(TOKEN_TTL_SECONDS).toBeLessThanOrEqual(60 * 60 * 24);
  });
});

describe("shouldRenew", () => {
  const mk = (iat: number, exp: number) => ({ iat, exp }) as JwtPayload;

  it("is false for a freshly issued token", () => {
    expect(shouldRenew(mk(1000, 1000 + 86400), 1000)).toBe(false);
  });

  it("is false just before the halfway mark", () => {
    expect(shouldRenew(mk(0, 86400), 43199)).toBe(false);
  });

  it("turns true at the halfway mark", () => {
    expect(shouldRenew(mk(0, 86400), 43200)).toBe(true);
  });

  it("is true for an almost-expired token", () => {
    expect(shouldRenew(mk(0, 86400), 86399)).toBe(true);
  });

  it("renews defensively when the claims are missing or nonsensical", () => {
    expect(shouldRenew({} as JwtPayload, 1000)).toBe(true);
    expect(shouldRenew(mk(500, 100), 1000)).toBe(true);
  });
});
