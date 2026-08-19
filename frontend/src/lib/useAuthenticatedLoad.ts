import { useCallback, useEffect, useState } from "react";
import { ApiError } from "./api";
import { useAuth } from "./auth";

/**
 * Fired when something is written from outside the screen that displays it —
 * currently the header's quick add. Anything loaded through this hook refetches.
 */
export const DATA_CHANGED_EVENT = "myx:data-changed";

/** Tell every mounted screen that the data underneath it has moved. */
export function announceDataChanged() {
  window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT));
}

/** Fetch data when the authenticated user is available; refetch when user changes (e.g. after login). */
export function useAuthenticatedLoad(load: () => Promise<void>) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    if (!user) return;
    setError(null);
    setLoading(true);
    try {
      await load();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to load data.");
    } finally {
      setLoading(false);
    }
  }, [user, load]);

  useEffect(() => {
    if (!user) return;
    reload();
  }, [user?.id, reload]);

  /*
    Quick add lives in the app header now, so a transaction can be created from
    any screen — including the ones showing the numbers it just changed. The
    dialog announces the write and every mounted screen refetches, which is what
    keeps the dashboard from displaying a balance that is one transaction stale.
  */
  useEffect(() => {
    if (!user) return;
    const onChanged = () => reload();
    window.addEventListener(DATA_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(DATA_CHANGED_EVENT, onChanged);
  }, [user, reload]);

  return { loading, error, reload };
}
