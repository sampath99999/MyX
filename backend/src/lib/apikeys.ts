/*
  Generating, hashing and resolving API keys. See migrations/0023_api_keys.sql
  for why they exist and why only a hash is stored.

  Everything here runs inside the Workers runtime — Web Crypto only, no deps.
*/

/**
 * Every key starts with this. Two jobs: middleware can tell a key from a JWT
 * without parsing either, and a secret scanner has something to match on if one
 * is ever pasted into a repo.
 */
export const API_KEY_PREFIX = "myx_";

/** 256 bits of CSPRNG. The reason no password-style KDF is needed on the hash. */
const KEY_BYTES = 32;

/**
 * How much of the key the UI is allowed to show. "myx_" plus eight characters
 * is enough to tell two keys apart in a list and leaves ~200 bits unshown, so
 * this half is treated as public — it is stored in plaintext and used as the
 * rate-limit bucket.
 */
export const DISPLAY_PREFIX_LENGTH = 12;

/** Enough for every device someone could plausibly connect; not unbounded. */
export const MAX_KEYS_PER_USER = 10;

/**
 * last_used_at is only precise to this.
 *
 * The obvious implementation writes the timestamp on every authenticated
 * request, which would add one D1 write per API call — spending the very
 * free-tier quota lib/usage.ts exists to watch, and for a column nobody reads
 * more than once a week. Five-minute resolution answers the only question the
 * column is for ("is this key still in use, or can I revoke it?") at a
 * negligible fraction of the writes.
 */
export const LAST_USED_THROTTLE_SECONDS = 300;

export type ApiKeyScope = "read" | "write";

export function isApiKeyScope(value: unknown): value is ApiKeyScope {
  return value === "read" || value === "write";
}

/** True for anything shaped like one of our keys — not a claim that it is valid. */
export function looksLikeApiKey(token: string): boolean {
  return token.startsWith(API_KEY_PREFIX);
}

function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** A fresh key. This is the only moment the plaintext exists on our side. */
export function generateApiKey(): string {
  return API_KEY_PREFIX + toBase64Url(crypto.getRandomValues(new Uint8Array(KEY_BYTES)));
}

/** The public head of a key, for the Settings list and the rate-limit bucket. */
export function displayPrefix(token: string): string {
  return token.slice(0, DISPLAY_PREFIX_LENGTH);
}

/** Hex SHA-256 — what actually goes in the table. */
export async function hashApiKey(token: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** A key and the account behind it, in one lookup. */
export interface ApiKeyRecord {
  id: number;
  user_id: number;
  scope: ApiKeyScope;
  expires_at: number | null;
  last_used_at: number | null;
  /* From users, so authentication does not need a second round trip. */
  email: string;
  name: string;
  email_verified: number;
  deleted_at: number | null;
}

/**
 * Look a key up by its hash, joined to its owner.
 *
 * One query rather than two: the middleware needs the account's state
 * (verified, not deleted) on every request anyway, exactly as the JWT path
 * needs token_version.
 */
export async function resolveApiKey(
  db: D1Database,
  token: string,
): Promise<ApiKeyRecord | null> {
  const hash = await hashApiKey(token);
  return db
    .prepare(
      `SELECT k.id, k.user_id, k.scope, k.expires_at, k.last_used_at,
              u.email, u.name, u.email_verified, u.deleted_at
         FROM api_keys k JOIN users u ON u.id = k.user_id
        WHERE k.key_hash = ?`,
    )
    .bind(hash)
    .first<ApiKeyRecord>();
}

/** True once a key's last_used_at is stale enough to be worth a write. */
export function shouldTouch(record: ApiKeyRecord, now: number): boolean {
  return (record.last_used_at ?? 0) + LAST_USED_THROTTLE_SECONDS <= now;
}

/**
 * Record that a key was used. Never awaited on the request path — a failure to
 * update a "last seen" column must not fail the request it was observing.
 */
export function touchApiKey(db: D1Database, id: number, now: number): Promise<unknown> {
  return db
    .prepare("UPDATE api_keys SET last_used_at = ? WHERE id = ?")
    .bind(now, id)
    .run()
    .catch((err) => {
      console.error("[apikeys] failed to record last_used_at:", err);
    });
}
