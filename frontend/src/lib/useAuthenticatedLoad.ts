import { useCallback, useEffect, useState } from "react";
import { ApiError } from "./api";
import { useAuth } from "./auth";

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

  return { loading, error, reload };
}
