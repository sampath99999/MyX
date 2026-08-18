/**
 * Which origins may call this API.
 *
 * The old policy reflected whatever Origin the caller sent, which meant any
 * website could script requests against this API with a stolen token. Tokens
 * live in localStorage rather than cookies, so this was not a CSRF hole on its
 * own, but there is no reason for the allowed set to be wider than "this app".
 *
 * Configured with the ALLOWED_ORIGINS var (comma-separated). The defaults cover
 * the deployed Pages site and local dev, so nothing has to be set to work.
 */
const DEFAULT_ORIGINS = [
  "https://myx.samchitech.com",
  "https://myx-app.pages.dev",
  "http://localhost:5173",
  "http://127.0.0.1:5173",
];

/** Pages gives every deployment its own <hash>.myx-app.pages.dev host. */
const PAGES_PREVIEW_SUFFIX = ".myx-app.pages.dev";

export function isAllowedOrigin(origin: string, configured?: string): boolean {
  const allowed = configured
    ? configured.split(",").map((o) => o.trim()).filter(Boolean)
    : DEFAULT_ORIGINS;

  if (allowed.includes(origin)) return true;

  // Preview deployments, but only over https and only as a real subdomain —
  // a bare suffix test would also match "https://evil-myx-app.pages.dev".
  try {
    const { protocol, hostname } = new URL(origin);
    return protocol === "https:" && hostname.endsWith(PAGES_PREVIEW_SUFFIX);
  } catch {
    return false;
  }
}
