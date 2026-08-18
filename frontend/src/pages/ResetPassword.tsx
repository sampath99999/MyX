import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Sparkles, Loader2 } from "lucide-react";
import { api, ApiError } from "@/lib/api";

const MIN_PASSWORD_LENGTH = 8;

/*
  Landing point for the emailed link (/reset?token=...).

  A successful reset deliberately does not sign the user in — the server issues
  no token here, because a reset is a strong hint the account was in trouble and
  whoever finishes the flow should have to prove they know the new password.
*/
export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError("Those two passwords do not match.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.resetPassword({ token, password });
      navigate("/login?reset=1", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-6">
      <div className="w-full max-w-sm animate-in-up">
        <Link to="/" className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary glow">
            <Sparkles className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-xl font-bold tracking-tight">MyX</span>
        </Link>

        <h1 className="mt-10 text-2xl font-bold tracking-tight">Choose a new password</h1>

        {token ? (
          <>
            <p className="mt-2 text-sm text-muted-foreground">
              At least {MIN_PASSWORD_LENGTH} characters. This also signs you out everywhere else.
            </p>

            <form onSubmit={onSubmit} className="mt-8 space-y-4">
              <div>
                <label htmlFor="password" className="text-sm font-medium">
                  New password
                </label>
                <input
                  id="password"
                  type="password"
                  required
                  minLength={MIN_PASSWORD_LENGTH}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1.5 w-full rounded-lg border border-input bg-transparent px-3 py-2.5 outline-none focus:border-ring"
                />
              </div>
              <div>
                <label htmlFor="confirm" className="text-sm font-medium">
                  Confirm password
                </label>
                <input
                  id="confirm"
                  type="password"
                  required
                  autoComplete="new-password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  placeholder="••••••••"
                  className="mt-1.5 w-full rounded-lg border border-input bg-transparent px-3 py-2.5 outline-none focus:border-ring"
                />
              </div>

              {error && <p className="text-sm text-destructive">{error}</p>}

              <button
                type="submit"
                disabled={busy}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground glow disabled:opacity-60"
              >
                {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                Save new password
              </button>
            </form>
          </>
        ) : (
          <>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              This link is missing its token. Reset links expire after 30 minutes and work once —
              request a fresh one.
            </p>
            <Link
              to="/forgot"
              className="mt-8 inline-block rounded-xl bg-primary px-5 py-2.5 font-semibold text-primary-foreground glow"
            >
              Send a new link
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
