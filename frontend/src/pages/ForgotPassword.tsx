import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, MailCheck, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AuthScreen, { AuthError, AuthNotice } from "@/components/auth/AuthScreen";
import { api, ApiError } from "@/lib/api";

/*
  The success state is shown for any well-formed address, matching the server,
  which answers identically whether or not the account exists. Saying "no account
  with that email" here would hand an attacker a free membership oracle and undo
  the care taken in the endpoint. The copy is written to be true either way —
  "if it has an account" rather than "we've sent you a link".
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

  if (sent) {
    return (
      <AuthScreen
        eyebrow="Sent"
        title="Check your inbox."
        description={
          <>
            If <span className="text-foreground">{email}</span> has an account, a reset link is on
            its way. It expires in 30 minutes and works only once.
          </>
        }
        footer={
          <>
            Remembered it?{" "}
            <Link
              to="/login"
              className="tap font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground"
            >
              Sign in instead
            </Link>
          </>
        }
      >
        <div className="space-y-4">
          <AuthNotice icon={MailCheck}>
            Nothing after a few minutes? Check the spam folder, then try again — the address may not
            have an account.
          </AuthNotice>
          <div className="flex flex-col gap-2.5 sm:flex-row">
            <Button variant="outline" size="lg" className="flex-1" onClick={() => setSent(false)}>
              Use a different email
            </Button>
            <Button size="lg" className="flex-1" asChild>
              <Link to="/login">Back to sign in</Link>
            </Button>
          </div>
        </div>
      </AuthScreen>
    );
  }

  return (
    <AuthScreen
      eyebrow="Account recovery"
      title="Let's get you back in."
      description="Enter the address you signed up with and we'll send a link to choose a new password. Your data is untouched in the meantime."
      footer={
        <Link
          to="/login"
          className="tap inline-flex items-center gap-1.5 transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" />
          Back to sign in
        </Link>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            required
            autoFocus
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            className="h-11"
          />
        </div>

        {error && <AuthError>{error}</AuthError>}

        <Button type="submit" size="xl" className="w-full" loading={busy}>
          {!busy && (
            <>
              <Send />
              Send reset link
            </>
          )}
        </Button>
      </form>
    </AuthScreen>
  );
}
