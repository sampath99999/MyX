import { lazy, type ComponentType } from "react";

/*
  Route chunks that survive a deployment.

  Every route in this app is a separate `import()`, and Vite fingerprints the
  file it resolves to — `Project-BSP9RnHG.js`. The filename is baked into the
  index.html that loaded the page, so a tab that was opened before a deploy is
  holding a list of chunk names from the build *it* loaded. Deploy, and those
  names may no longer be the ones on the server; click into a route that has
  not been fetched yet and the import fails with

      Failed to fetch dynamically imported module

  which React then throws to the nearest error boundary. Nothing is broken —
  the app is simply a version behind — but the screen the user asked for does
  not appear, and it stays that way because the browser remembers the failed
  module for the life of the page.

  The same message covers a plain network blip on a phone that changed cells
  mid-navigation, and the short window during a deploy when the new index.html
  is live but its assets have not reached every edge yet. All three are fixed
  the same way, and all three are invisible to the user, so the recovery has to
  be automatic.

  One retry, because a blip is worth waiting 350ms for and a reload is
  disruptive. Then, once, a reload: index.html is served `max-age=0,
  must-revalidate` (see public/_headers), so a fresh load is guaranteed to
  bring the current chunk names with it.

  The reload is guarded by a session flag, which is the part that matters. A
  route that is genuinely missing — a bad build, an asset that failed to
  upload — would otherwise reload, fail, reload, forever, and a boot loop is a
  far worse failure than the one being fixed. After one attempt the error is
  allowed through to the error boundary, where it is at least visible.
*/

const RELOAD_FLAG = "myx.chunk-reloaded";

/** sessionStorage throws in Safari's private mode; a failure here is not fatal. */
function readFlag(): boolean {
  try {
    return sessionStorage.getItem(RELOAD_FLAG) === "1";
  } catch {
    return false;
  }
}
function writeFlag() {
  try {
    sessionStorage.setItem(RELOAD_FLAG, "1");
  } catch {
    /* Without storage the guard is gone, so the reload below never happens. */
  }
}
function clearFlag() {
  try {
    sessionStorage.removeItem(RELOAD_FLAG);
  } catch {
    /* Nothing to clear. */
  }
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * The recovery itself, separate from React so it can be tested without
 * rendering: `lazy` does not call its loader until something mounts.
 *
 * `delayMs` exists for the same reason — a test should not sit through the
 * real pause to assert what happens after it.
 */
export async function loadWithRetry<M>(load: () => Promise<M>, delayMs = 350): Promise<M> {
  try {
    const mod = await load();
    // Something loaded, so whatever went wrong before is over. Clearing on
    // success rather than only on boot means a session that recovers can
    // recover again later — a second deploy in one sitting is not unusual.
    clearFlag();
    return mod;
  } catch {
    await wait(delayMs);
    try {
      const mod = await load();
      clearFlag();
      return mod;
    } catch (second) {
      if (readFlag()) throw second;
      writeFlag();
      window.location.reload();
      // The reload takes over. Resolving here would render into a document
      // that is already being torn down.
      return new Promise<never>(() => {});
    }
  }
}

/**
 * `React.lazy`, with a retry and a one-shot reload when the chunk cannot be
 * fetched. Drop-in: same call shape as `lazy(() => import("..."))`.
 */
// `ComponentType<any>` to match React.lazy's own constraint: a narrower
// parameter type here would reject every page component that takes props.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export default function lazyWithRetry<T extends ComponentType<any>>(
  load: () => Promise<{ default: T }>,
) {
  return lazy(() => loadWithRetry(load));
}
