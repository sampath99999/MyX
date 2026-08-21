import { useEffect, useRef, useState, type FormEvent } from "react";
import { MailCheck, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import OtpInput from "@/components/auth/OtpInput";
import { AuthError, AuthNotice } from "@/components/auth/AuthScreen";
import { api, ApiError } from "@/lib/api";

const RESEND_COOLDOWN_SECONDS = 45;
const CODE_LENGTH = 6;

/*
  Entering the emailed code.

  Lives in its own component because the same six boxes are now needed in two
  places: immediately after signing up, where it is one step of a flow, and at
  /verify-email, where someone has come back to finish the job. The rules around
  it — one submit per code, a cooldown on resends, the field clearing after a
  wrong guess — are identical in both, and were worth having in one place rather
  than two that agree today.

  It submits itself on the sixth digit. The server caps attempts, so an
  auto-submit spends a real budget: `attempted` holds the last code sent so a
  re-render cannot spend a second one on the same six digits.
*/
export default function VerifyCodeForm({
  onVerified,
  skip,
  autoFocus,
}: {
  /** Called after the server confirms. The caller decides where to go next. */
  onVerified: () => void | Promise<void>;
  /** Verification is a nudge, not a gate — most callers offer a way past it. */
  skip?: { label: string; onSkip: () => void };
  autoFocus?: boolean;
}) {
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(0);
  /** Bumped whenever the boxes are emptied, to send the caret back to the first. */
  const [refocus, setRefocus] = useState(0);
  const attempted = useRef<string | null>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  async function submit(value: string) {
    if (busy || attempted.current === value) return;
    attempted.current = value;
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await api.verifyEmail({ code: value });
      await onVerified();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
      // Clearing beats leaving six wrong digits to be edited one at a time.
      setCode("");
      setRefocus((n) => n + 1);
    } finally {
      setBusy(false);
    }
  }

  // The sixth digit submits. Typing it and then hunting for a button is a step
  // that exists only because the form has one.
  useEffect(() => {
    if (code.length === CODE_LENGTH) void submit(code);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  async function onResend() {
    setBusy(true);
    setError(null);
    try {
      await api.resendVerification();
      setNotice("A new code is on its way. The previous one no longer works.");
      setCooldown(RESEND_COOLDOWN_SECONDS);
      setCode("");
      setRefocus((n) => n + 1);
      attempted.current = null;
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send a new code.");
    } finally {
      setBusy(false);
    }
  }

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    void submit(code);
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <OtpInput
        value={code}
        onChange={(next) => {
          setCode(next);
          if (error) setError(null);
        }}
        disabled={busy}
        invalid={Boolean(error)}
        autoFocus={autoFocus}
        focusSignal={refocus}
      />

      {notice && <AuthNotice icon={MailCheck}>{notice}</AuthNotice>}
      {error && <AuthError>{error}</AuthError>}

      <Button
        type="submit"
        size="xl"
        className="w-full"
        loading={busy}
        disabled={code.length !== CODE_LENGTH}
      >
        {!busy && (
          <>
            <ShieldCheck />
            Confirm email
          </>
        )}
      </Button>

      <div className="flex items-center justify-between gap-3 border-t border-border pt-4 text-sm">
        <button
          type="button"
          onClick={onResend}
          disabled={busy || cooldown > 0}
          className="tnum tap text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Send a new code"}
        </button>
        {skip && (
          <button
            type="button"
            onClick={skip.onSkip}
            className="tap text-muted-foreground transition-colors hover:text-foreground"
          >
            {skip.label}
          </button>
        )}
      </div>
    </form>
  );
}
