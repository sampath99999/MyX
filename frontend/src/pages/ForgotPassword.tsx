import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Sparkles, Loader2, MailCheck } from "lucide-react";
import { api, ApiError } from "@/lib/api";

/*
  The success state is shown for any well-formed address, matching the server,
  which answers identically whether or not the account exists. Saying "no account
  with that email" here would hand an attacker a free membership oracle and undo
  the care taken in the endpoint.
*/
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.forgotPassword({ email: email.trim() });
      setSent(true);
    } catch (err) {
      // Only transport or rate-limit failures reach here.
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

        {sent ? (
          <div className="mt-10">
            <MailCheck className="h-7 w-7 text-primary" />
            <h1 className="mt-4 text-2xl font-bold tracking-tight">Check your email</h1>
            <p className="mt-3 leading-relaxed text-muted-foreground">
              If <span className="text-foreground">{email}</span> has an account, a reset link is on
              its way. It expires in 30 minutes and can only be used once.
            </p>
            <Link
              to="/login"
              className="mt-8 inline-block rounded-xl border border-border/60 px-5 py-2.5 font-medium transition-colors hover:bg-accent"
            >
              Back to sign in
            </Link>
          </div>
        ) : (
          <>
            <h1 className="mt-10 text-2xl font-bold tracking-tight">Forgot your password?</h1>
            <p className="mt-2 text-sm text-muted-foreground">
              Enter your email and we'll send you a link to choose a new one.
            </p>

            <form onSubmit={onSubmit} className="mt-8 space-y-4">
              <div>
                <label htmlFor="email" className="text-sm font-medium">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
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
                Send reset link
              </button>
            </form>

            <p className="mt-6 text-sm text-muted-foreground">
              Remembered it?{" "}
              <Link to="/login" className="text-foreground hover:underline">
                Sign in
              </Link>
            </p>
          </>
        )}
      </div>
    </div>
  );
}
