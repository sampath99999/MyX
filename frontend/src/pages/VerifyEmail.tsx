import { useState, useEffect, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Sparkles, Loader2, MailCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api, ApiError } from "@/lib/api";

const RESEND_COOLDOWN_SECONDS = 45;

/*
  Where signup lands. The account already exists and the session is live — this
  step confirms the address rather than gating entry, so "I'll do this later"
  is a real option rather than a dead end.
*/
export default function VerifyEmail() {
  const { user, refresh } = useAuth();
  const navigate = useNavigate();

  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);

  // Already done (or verified in another tab) — nothing to do here.
  useEffect(() => {
    if (user?.email_verified) navigate("/dashboard", { replace: true });
  }, [user, navigate]);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.verifyEmail({ code });
      // Pull the fresh flag so the banner and this screen agree immediately.
      await refresh();
      navigate("/dashboard", { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function onResend() {
    setBusy(true);
    setError(null);
    try {
      await api.resendVerification();
      setNotice("A new code is on its way. The previous one no longer works.");
      setCooldown(RESEND_COOLDOWN_SECONDS);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send a new code.");
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

        <MailCheck className="mt-10 h-7 w-7 text-primary" />
        <h1 className="mt-4 text-2xl font-bold tracking-tight">Confirm your email</h1>
        <p className="mt-2 leading-relaxed text-muted-foreground">
          We sent a six-digit code to{" "}
          <span className="text-foreground">{user?.email ?? "your address"}</span>. It expires in 15
          minutes.
        </p>

        <form onSubmit={onSubmit} className="mt-8 space-y-4">
          <div>
            <label htmlFor="code" className="text-sm font-medium">
              Verification code
            </label>
            <input
              id="code"
              // inputMode + one-time-code is what makes the phone keyboard
              // numeric and lets iOS offer the code straight from the mail app.
              inputMode="numeric"
              autoComplete="one-time-code"
              autoFocus
              maxLength={7}
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^\d\s-]/g, ""))}
              placeholder="000000"
              className="tnum mt-1.5 w-full rounded-lg border border-input bg-transparent px-3 py-3 text-center text-2xl font-semibold tracking-[0.5em] outline-none placeholder:text-muted-foreground/30 focus:border-ring"
            />
          </div>

          {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
          {error && <p className="text-sm text-destructive">{error}</p>}

          <button
            type="submit"
            disabled={busy || code.replace(/\D/g, "").length !== 6}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 font-semibold text-primary-foreground glow disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            Verify email
          </button>
        </form>

        <div className="mt-6 flex items-center justify-between text-sm">
          <button
            onClick={onResend}
            disabled={busy || cooldown > 0}
            className="text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            {cooldown > 0 ? `Resend in ${cooldown}s` : "Send a new code"}
          </button>
          <Link to="/dashboard" className="text-muted-foreground hover:text-foreground">
            Skip for now
          </Link>
        </div>
      </div>
    </div>
  );
}
