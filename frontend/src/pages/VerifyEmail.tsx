import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Mail } from "lucide-react";
import AuthScreen from "@/components/auth/AuthScreen";
import VerifyCodeForm from "@/components/auth/VerifyCodeForm";
import { useAuth } from "@/lib/auth";

/*
  The way back to verification for someone who skipped it.

  This used to be where signing up landed. It is not any more — the code is
  asked for on the sign-up screen itself, while the person is still in the act
  of signing up. What is left here is the second chance, and there are two ways
  to arrive at it: the account menu, banner and settings link here when
  verification is optional, and the route guard sends people here on their way
  to anything else when it is not.

  No aside. Everyone who reaches this screen already has a session and has seen
  the product, so a panel advertising it would be selling to a customer.
*/
export default function VerifyEmail() {
  const { user, refresh, verificationRequired, logout } = useAuth();
  const navigate = useNavigate();

  // Already done (or verified in another tab) — nothing to do here.
  useEffect(() => {
    if (user?.email_verified) navigate("/dashboard", { replace: true });
  }, [user, navigate]);

  return (
    <AuthScreen
      aside={false}
      eyebrow="One minute"
      title="Confirm your email."
      description={
        <>
          <span className="inline-flex items-center gap-1.5 text-foreground">
            <Mail className="size-3.5 shrink-0" />
            {user?.email ?? "your address"}
          </span>
          <br />
          {verificationRequired
            ? "Enter the six-digit code to open your account. Nothing has been lost — everything is waiting behind this one step."
            : "Enter the six-digit code, or send yourself a fresh one. Confirming is what lets you recover the account if you ever lose the password."}
        </>
      }
      /*
        This used to read "Wrong address? Change it in settings", which was not
        true: settings shows the address and offers no way to edit it, and under
        the gate that route bounces straight back here anyway. Pointing someone
        at a door that does not open is worse than admitting there isn't one.
      */
      footer={
        <>
          Wrong address? The address on an account cannot be changed yet — write to{" "}
          <a
            href="mailto:sampathbandla199@gmail.com"
            className="tap font-medium text-foreground underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground"
          >
            sampathbandla199@gmail.com
          </a>{" "}
          and it will be sorted out.
        </>
      }
    >
      <VerifyCodeForm
        autoFocus
        onVerified={async () => {
          // Pull the fresh flag so the banner and this screen agree immediately.
          await refresh();
          navigate("/dashboard", { replace: true });
        }}
        /*
          Under the gate there is no "back to the app" — the app is what this
          unlocks. Signing out is the only honest second option, and leaving
          someone with no way off a screen is its own kind of trap.
        */
        skip={
          verificationRequired
            ? { label: "Sign out", onSkip: logout }
            : { label: "Back to the app", onSkip: () => navigate("/dashboard") }
        }
      />
    </AuthScreen>
  );
}
