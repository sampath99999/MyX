import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Check, Eye, EyeOff, KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AuthScreen, { AuthError } from "@/components/auth/AuthScreen";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";

const MIN_PASSWORD_LENGTH = 8;

/*
  Landing point for the emailed link (/reset?token=...).

  A successful reset deliberately does not sign the user in — the server issues
  no token here, because a reset is a strong hint the account was in trouble and
  whoever finishes the flow should have to prove they know the new password.
*/

/*
  A deliberately crude strength read: length first, then whether the character
  set is varied. It is not an entropy estimate and it is not a policy — the only
  rule enforced is the eight-character minimum the server also checks. It exists
  because "at least 8 characters" alone quietly encourages exactly 8, and a bar
  that keeps moving is a better argument for a longer one than a sentence is.
*/
function strengthOf(password: string) {
  if (!password) return { score: 0, label: "" };
  let score = 0;
  if (password.length >= MIN_PASSWORD_LENGTH) score += 1;
  if (password.length >= 12) score += 1;
  if (password.length >= 16) score += 1;
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^\w\s]/].filter((re) => re.test(password)).length;
  if (classes >= 3 && password.length >= MIN_PASSWORD_LENGTH) score += 1;
  return {
    score: Math.min(score, 4),
    label: ["Too short", "Weak", "Fair", "Good", "Strong"][Math.min(score, 4)],
  };
}

export default function ResetPassword() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get("token") ?? "";

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Checked as you type rather than only on submit — being told your two
  // passwords disagree after pressing the button is the slowest way to find out.
  const mismatch = confirm.length > 0 && password !== confirm;
  const matched = confirm.length > 0 && password === confirm;
  const strength = strengthOf(password);

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

  if (!token) {
    return (
      <AuthScreen
        eyebrow="Account recovery"
        title="This link is incomplete."
        description="Reset links expire after 30 minutes and work only once. Request a fresh one and it will arrive in a moment."
        footer={
          <Link
            to="/login"
            className="tap transition-colors hover:text-foreground"
          >
            Back to sign in
          </Link>
        }
      >
        <Button className="w-full" size="xl" asChild>
          <Link to="/forgot">Send a new link</Link>
        </Button>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      eyebrow="Account recovery"
      title="Choose a new password."
      description={`At least ${MIN_PASSWORD_LENGTH} characters. Saving it signs you out everywhere else, so anyone who had your old password is out.`}
      footer={
        <Link to="/login" className="tap transition-colors hover:text-foreground">
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="password">New password</Label>
          <div className="relative">
            <Input
              id="password"
              type={show ? "text" : "password"}
              required
              autoFocus
              minLength={MIN_PASSWORD_LENGTH}
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              className="h-11 pr-11"
            />
            <button
              type="button"
              onClick={() => setShow((v) => !v)}
              aria-label={show ? "Hide password" : "Show password"}
              className="tap absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
            >
              {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>

          {password.length > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <div className="flex flex-1 gap-1" aria-hidden>
                {[1, 2, 3, 4].map((step) => (
                  <span
                    key={step}
                    className={cn(
                      "h-1 flex-1 rounded-full transition-colors",
                      strength.score >= step
                        ? strength.score <= 1
                          ? "bg-destructive/70"
                          : strength.score === 2
                            ? "bg-amber-400/80"
                            : "bg-emerald-400"
                        : "bg-foreground/10",
                    )}
                  />
                ))}
              </div>
              <span className="w-14 text-right text-xs text-muted-foreground">
                {strength.label}
              </span>
            </div>
          )}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="confirm">Confirm password</Label>
          <div className="relative">
            <Input
              id="confirm"
              type={show ? "text" : "password"}
              required
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder="••••••••"
              aria-invalid={mismatch || undefined}
              className="h-11 pr-11"
            />
            {matched && (
              <Check className="absolute right-3.5 top-1/2 size-4 -translate-y-1/2 text-emerald-400" />
            )}
          </div>
          {mismatch && <p className="text-xs text-destructive">These do not match yet.</p>}
        </div>

        {error && <AuthError>{error}</AuthError>}

        <Button
          type="submit"
          size="xl"
          className="w-full"
          loading={busy}
          disabled={mismatch || password.length < MIN_PASSWORD_LENGTH}
        >
          {!busy && (
            <>
              <KeyRound />
              Save new password
            </>
          )}
        </Button>
      </form>
    </AuthScreen>
  );
}
