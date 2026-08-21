import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { api, clearToken, getToken, setToken, UNAUTHORIZED_EVENT, type User } from "./api";

interface AuthState {
  user: User | null;
  loading: boolean;
  /**
   * True when the server refuses data to an unverified account. It is what
   * separates "confirm your email when you get a chance" from a locked door,
   * and it comes from the server because only the server knows.
   */
  verificationRequired: boolean;
  /** Resolves true when this sign-in cancelled a pending account deletion. */
  login: (email: string, password: string) => Promise<boolean>;
  /**
   * Creates the account and puts its token in play, but deliberately does not
   * sign the user into the app — see the implementation for why. Returns the
   * new user so the caller can show the address the code went to.
   */
  register: (email: string, name: string, password: string) => Promise<User>;
  /** Commits a user held back by `register`, releasing the route guards. */
  enterApp: (user: User) => void;
  logout: () => void;
  /** Re-read the user from the server — used after email verification flips a flag. */
  refresh: () => Promise<void>;
}

const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [verificationRequired, setVerificationRequired] = useState(false);

  // Restore session from an existing token on first load.
  useEffect(() => {
    let active = true;
    async function restore() {
      if (!getToken()) {
        setLoading(false);
        return;
      }
      try {
        const res = await api.me();
        if (active) {
          setUser(res.user);
          setVerificationRequired(res.verification_required === true);
        }
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
      const res = await api.me();
      setUser(res.user);
      setVerificationRequired(res.verification_required === true);
    } catch {
      // A failure here is not worth surfacing: the caller is refreshing a flag,
      // and a 401 has already torn the session down through the api layer.
    }
  }

  async function login(email: string, password: string) {
    const res = await api.login({ email, password });
    setToken(res.token);
    setVerificationRequired(res.verification_required === true);
    setUser(res.user);
    // The server cancels a scheduled deletion when the owner signs back in; the
    // caller needs to know so it can say so rather than silently carrying on.
    return res.restored === true;
  }

  async function register(email: string, name: string, password: string) {
    const res = await api.register({ email, name, password });
    /*
      The token is stored immediately — submitting the verification code needs
      an authenticated request — but the user is held back rather than put into
      context here.

      Committing it is what makes `<PublicOnly>` redirect to the dashboard, and
      signup now asks for the emailed code on the sign-up screen itself. Setting
      the user at this point would throw the person off that screen the instant
      their account existed, which is the exact behaviour the code step was
      moved here to avoid. The caller commits once the code is entered, skipped,
      or the screen is left.
    */
    setToken(res.token);
    setVerificationRequired(res.verification_required === true);
    return res.user;
  }

  function enterApp(user: User) {
    setUser(user);
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
    <AuthContext.Provider value={{ user, loading, verificationRequired, login, register, enterApp, logout, refresh }}>
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
