import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";

export default function Terms() {
  return (
    <div className="mx-auto min-h-dvh max-w-3xl px-6 py-10">
      <Link to="/" className="inline-flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary glow">
          <Sparkles className="h-[1.15rem] w-[1.15rem] text-primary-foreground" />
        </div>
        <span className="text-lg font-bold tracking-tight">MyX</span>
      </Link>

      <h1 className="mt-10 text-4xl font-extrabold tracking-tight">Terms of use</h1>
      <p className="mt-3 text-sm text-muted-foreground">Last updated 18 August 2026</p>

      <div className="mt-10 space-y-8 leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-xl font-semibold text-foreground">What this is</h2>
          <p className="mt-3">
            MyX is a personal life manager offered free of charge. It is a personal project rather
            than a company, run on a hobby budget, and these terms are written plainly rather than
            defensively.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">Your account</h2>
          <p className="mt-3">
            You are responsible for keeping your password to yourself, and for what happens under
            your account. One person per account. Do not use MyX to store anything illegal, and do
            not attempt to reach another user's data or to degrade the service for others.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">Your data is yours</h2>
          <p className="mt-3">
            You keep every right to what you put in. Deleting your account removes it and everything
            attached to it. See the <Link to="/privacy" className="text-foreground underline">privacy page</Link>{" "}
            for what is stored and how.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">No warranty</h2>
          <p className="mt-3">
            MyX is provided as-is, without any guarantee of availability, accuracy or fitness for a
            particular purpose. The money features do arithmetic on numbers you enter — they are not
            financial advice, not an accounting record, and not a substitute for your bank's own
            statements. Keep your own copies of anything you cannot afford to lose.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">Ending it</h2>
          <p className="mt-3">
            You can delete your account at any time from the app. Accounts that abuse the service may
            be removed. If MyX is ever shut down, reasonable notice will be given so you can export
            what you have stored.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">Contact</h2>
          <p className="mt-3">
            <span className="text-foreground">sampathbandla199@gmail.com</span>
          </p>
        </section>
      </div>

      <div className="mt-12 border-t border-border/50 pt-8 text-sm">
        <Link to="/" className="text-muted-foreground hover:text-foreground">
          ← Back to home
        </Link>
      </div>
    </div>
  );
}
