import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, clearToken, getToken, setToken, UNAUTHORIZED_EVENT, type User } from "./api";

interface AuthState {
  user: User | null;
  loading: boolean;
  /** Resolves true when this sign-in cancelled a pending account deletion. */
  login: (email: string, password: string) => Promise<boolean>;
  register: (email: string, name: string, password: string) => Promise<void>;
  logout: () => void;
  /** Re-read the user from the server — used after email verification flips a flag. */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  // Restore session from an existing token on first load.
  useEffect(() => {
    let active = true;
    async function restore() {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const { user } = await api.me();
        if (active) setUser(user);
      } catch {
        clearToken();
      } finally {
        if (active) setLoading(false);
      }
    }
    restore();
    return () => {
      active = false;
    };
  }, []);

  // Any request rejected with 401 means the token expired or was revoked
  // elsewhere. Drop the user so <Protected> routes fall through to /login.
  useEffect(() => {
    const onUnauthorized = () => setUser(null);
    window.addEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
    return () => window.removeEventListener(UNAUTHORIZED_EVENT, onUnauthorized);
  }, []);

  async function refresh() {
    try {
      const { user } = await api.me();
      setUser(user);
    } catch {
      // A failure here is not worth surfacing: the caller is refreshing a flag,
      // and a 401 has already torn the session down through the api layer.
    }
  }

  async function login(email: string, password: string) {
    const res = await api.login({ email, password });
    setToken(res.token);
    setUser(res.user);
    // The server cancels a scheduled deletion when the owner signs back in; the
    // caller needs to know so it can say so rather than silently carrying on.
    return res.restored === true;
  }

  async function register(email: string, name: string, password: string) {
    const res = await api.register({ email, name, password });
    setToken(res.token);
    setUser(res.user);
  }

  function logout() {
    // Revoke server-side first so the token is dead everywhere, not just in this
    // browser. Clearing local state does not wait on the network: if the request
    // fails the user is still signed out here, and the token expires within 24h.
    api.logout().catch(() => {});
    clearToken();
    setUser(null);
  }

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout, refresh }}>
      {children}
    </AuthContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
