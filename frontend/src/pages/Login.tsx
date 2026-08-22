import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Check, Eye, EyeOff, Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import AuthScreen, { AuthError } from "@/components/auth/AuthScreen";
import VerifyCodeForm from "@/components/auth/VerifyCodeForm";
import { m, useStillMotion } from "@/components/landing/motion";
import { useAuth } from "@/lib/auth";
import { ApiError, type User } from "@/lib/api";

/*
  Sign in, sign up, and — since this rewrite — the emailed code as well.

  The code step used to be a separate screen the browser was pushed to the
  moment the account existed. That put a navigation, a different layout and a
  fresh page load between "create account" and the one thing left to do, and it
  arrived after the moment of commitment had passed. It is now the third panel
  of this screen: same column, same header, same width, with the form swapped
  out beneath a heading that changes. Signing up is one act.

  Whether the step can be skipped is the server's call, not this file's:
  REQUIRE_VERIFIED_EMAIL decides whether an unverified account may read its own
  data, and the flag rides along on the register response. When it is off, the
  code is a nudge and there is a way past it; when it is on, the only way in is
  through, and offering a skip would be handing someone a dashboard that answers
  403 to every panel.
*/

const EASE = [0.22, 1, 0.36, 1] as const;

type Step = "credentials" | "verify";

export default function Login() {
  const { login, register, enterApp, verificationRequired } = useAuth();
  const navigate = useNavigate();
  const still = useStillMotion();

  // The landing page's "Create your account" links here with ?mode=register, so
  // the visitor lands on the sign-up form rather than having to find the toggle.
  const [searchParams] = useSearchParams();
  // Set by ResetPassword after a successful reset, so the user knows it worked.
  const justReset = searchParams.get("reset") === "1";
  const [mode, setMode] = useState<"login" | "register">(
    searchParams.get("mode") === "register" ? "register" : "login",
  );
  const [step, setStep] = useState<Step>("credentials");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  /*
    The account that exists but has not been signed into yet. `register` hands
    it over without putting it in context, so this screen survives long enough
    to ask for the code; committing it is what opens the app.
  */
  const pending = useRef<User | null>(null);

  const registering = mode === "register";

  function finish(user: User) {
    pending.current = null;
    enterApp(user);
    navigate("/dashboard", { replace: true });
  }

  /*
    Leaving this screen mid-verification — a header link, the back button — must
    not strand a live token beside a signed-out interface. Whatever is still
    pending is committed on the way out, so the session and the interface agree;
    where that lands the person is then the route guards' business, and they
    already know whether the address has to be confirmed first.

    Read through a ref, with no dependencies. Written the obvious way —
    `useEffect(..., [enterApp])` — this fired on the *first* render after
    signing up rather than on unmount: `enterApp` is a fresh closure on every
    AuthProvider render, registering the account re-renders the provider, and
    an effect whose dependency changed runs its cleanup before re-subscribing.
    So the account was committed a moment after it was created, the guards took
    over, and the code step this screen exists to show never appeared.
  */
  const commit = useRef(enterApp);
  commit.current = enterApp;
  useEffect(
    () => () => {
      if (pending.current) commit.current(pending.current);
    },
    [],
  );

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      if (!registering) {
        /*
          Signing in is what cancels a scheduled deletion, so this is the only
          moment the user can be told it happened. Carried in the URL rather
          than in state because the navigation replaces this component.
        */
        const restored = await login(email, password);
        navigate(restored ? "/dashboard?restored=1" : "/dashboard", { replace: true });
        return;
      }

      // The account is live and a code is in the inbox; the session is not
      // committed yet, so the screen stays put and asks for it.
      pending.current = await register(email, name, password);
      setPassword("");
      setStep("verify");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
    } finally {
      setLoading(false);
    }
  }

  /** Fields arrive one after another, top to bottom. */
  const field = (i: number) =>
    still
      ? {}
      : {
          initial: { opacity: 0, y: 10 },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.45, delay: 0.15 + i * 0.06, ease: EASE },
        };

  /* ---------- Step three: the emailed code ---------- */
  if (step === "verify") {
    return (
      <AuthScreen
        eyebrow="Last step"
        title="Check your inbox."
        description={
          <>
            <span className="inline-flex items-center gap-1.5 text-foreground">
              <Mail className="size-3.5 shrink-0" />
              {email}
            </span>
            <br />
            Six digits, sent a moment ago. The code expires in 15 minutes.
          </>
        }
        footer={
          verificationRequired
            ? "Your account is created. Confirming the address is what opens it."
            : "Your account is already created — this only confirms the address."
        }
      >
        <VerifyCodeForm
          autoFocus
          onVerified={() => {
            // The flag the guards read has just changed on the server, so the
            // user committed here has to carry it.
            if (pending.current) finish({ ...pending.current, email_verified: true });
            else navigate("/dashboard", { replace: true });
          }}
          /*
            Offered only when the server actually allows it. Under
            REQUIRE_VERIFIED_EMAIL a skip button would be a lie: it would hand
            someone a dashboard that answers 403 to everything.
          */
          skip={
            verificationRequired
              ? undefined
              : {
                  label: "I'll do this later",
                  onSkip: () => {
                    if (pending.current) finish(pending.current);
                    else navigate("/dashboard", { replace: true });
                  },
                }
          }
        />
      </AuthScreen>
    );
  }

  /* ---------- Steps one and two: credentials ---------- */
  return (
    <AuthScreen
      eyebrow={registering ? "Get started" : "Welcome back"}
      title={registering ? "Your whole life, in one place." : "Pick up where you left off."}
      description={
        registering
          ? "One account for your money, tasks, notes and everything else. Free, and ready in about a minute."
          : "Money, tasks, notes and the rest — exactly as you left them."
      }
      footer={
        <>
          <p>
            {registering ? "Already have an account?" : "New here?"}{" "}
            <button
              type="button"
              onClick={() => {
                setMode(registering ? "login" : "register");
                setError(null);
              }}
              className="tap font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground"
            >
              {registering ? "Sign in" : "Create an account"}
            </button>
          </p>

          {registering && (
            <>
              <ul className="mt-6 flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
                {["Free forever", "No card, ever", "Delete it all in one tap"].map((r) => (
                  <li
                    key={r}
                    className="inline-flex items-center gap-1.5 text-xs text-muted-foreground"
                  >
                    <Check className="size-3 text-emerald-400" />
                    {r}
                  </li>
                ))}
              </ul>
              <p className="mt-5 text-xs leading-relaxed text-muted-foreground/80">
                By creating an account you agree to the{" "}
                <Link to="/terms" className="underline underline-offset-2 hover:text-foreground">
                  terms
                </Link>{" "}
                and{" "}
                <Link to="/privacy" className="underline underline-offset-2 hover:text-foreground">
                  privacy policy
                </Link>
                .
              </p>
            </>
          )}
        </>
      }
    >
      <form onSubmit={onSubmit} className="space-y-4">
        {registering && (
          <m.div {...field(0)} className="space-y-1.5">
            <Label htmlFor="name">Name</Label>
            <Input
              id="name"
              placeholder="Aarav Mehta"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoComplete="name"
              autoFocus
              className="h-11"
            />
          </m.div>
        )}

        <m.div {...field(registering ? 1 : 0)} className="space-y-1.5">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            type="email"
            placeholder="you@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            autoFocus={!registering}
            className="h-11"
          />
        </m.div>

        <m.div {...field(registering ? 2 : 1)} className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Password</Label>
            {!registering && (
              <Link
                to="/forgot"
                className="text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Forgot password?
              </Link>
            )}
          </div>
          {/*
            A reveal toggle, because the alternative on a phone is typing a
            16-character password blind and being told it was wrong.
          */}
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={registering ? "new-password" : "current-password"}
              className="h-11 pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              aria-label={showPassword ? "Hide password" : "Show password"}
              className="tap absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
          {registering && <p className="text-xs text-muted-foreground">At least 8 characters.</p>}
        </m.div>

        {justReset && !error && (
          <div className="flex items-start gap-2.5 rounded-lg border border-emerald-400/30 bg-emerald-400/[0.07] px-3.5 py-2.5 text-sm">
            <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" />
            Password updated. Sign in with your new one.
          </div>
        )}

        {error && <AuthError>{error}</AuthError>}

        <m.div {...field(registering ? 3 : 2)}>
          <Button type="submit" size="xl" className="w-full" loading={loading}>
            {!loading && (
              <>
                {registering ? "Create account" : "Sign in"}
                <ArrowRight />
              </>
            )}
          </Button>
        </m.div>
      </form>
    </AuthScreen>
  );
}
