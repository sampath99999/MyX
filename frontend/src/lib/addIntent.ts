import { useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";

/*
  "Add something" as a thing the URL can ask for.

  The Add button lives in the app shell, but the form for adding a transaction
  lives on the Money screen, the one for a note lives in Notes, and so on. So
  the button cannot open anything itself — it has to send you to the right
  screen and say what you came for. That message is a query parameter.

  A parameter rather than a path segment, for the reason recorded in
  pages/money/Transactions.tsx: AppLayout treats a change of pathname as a
  change of screen and resets the scroller, and a modal is a state of a screen
  rather than a different one.

  It is consumed once and removed. Leaving ?add=1 in the URL would reopen the
  dialog on every back-navigation and on every reload, which is the sort of
  thing that makes an app feel possessed.
*/

export const ADD_PARAM = "add";

/** Builds the link the Add menu navigates to. */
export function addLink(path: string): string {
  return `${path}${path.includes("?") ? "&" : "?"}${ADD_PARAM}=1`;
}

/**
 * Runs `onIntent` once when the current URL asks for an add, then clears the
 * parameter.
 *
 * The callback is held in a ref so a page can pass an inline arrow function
 * without the effect re-running on every render — which would reopen the dialog
 * the moment anything else on the screen changed.
 */
export function useAddIntent(onIntent: () => void): void {
  const [params, setParams] = useSearchParams();
  const handler = useRef(onIntent);
  handler.current = onIntent;

  useEffect(() => {
    if (params.get(ADD_PARAM) !== "1") return;

    const next = new URLSearchParams(params);
    next.delete(ADD_PARAM);
    // Replace, so Back returns to wherever the user actually came from rather
    // than to the same screen with the dialog opening again.
    setParams(next, { replace: true });

    handler.current();
  }, [params, setParams]);
}
