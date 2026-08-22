import type { ReactNode } from "react";
import PublicHeader, { PUBLIC_HEADER_OFFSET } from "@/components/PublicHeader";
import AuthAside from "@/components/auth/AuthAside";
import { m, WordReveal, useStillMotion } from "@/components/landing/motion";
import { cn } from "@/lib/utils";

/*
  The frame around every auth screen: sign in, sign up, the code step, forgot
  password, reset password.

  There were two frames before this. Sign-in had a bespoke two-column layout —
  transparent header, the landing page's weather, the product cycling beside the
  form — and the other three had a small centred card on a plain background.
  Getting a password reset therefore meant being dropped onto what looked like a
  different, cheaper site, which is a bad thing to hand someone at the moment
  they are least confident.

  One frame now. Below `lg` there is no aside at all and this is a form on a
  quiet background, which is the right answer on a phone regardless.
*/

const EASE = [0.22, 1, 0.36, 1] as const;

export default function AuthScreen({
  eyebrow,
  title,
  description,
  children,
  footer,
  aside = true,
}: {
  eyebrow: string;
  /** Plain text — it is revealed a word at a time, so it cannot be markup. */
  title: string;
  description?: ReactNode;
  children: ReactNode;
  /** Small print under the form: the mode toggle, a way back to sign-in. */
  footer?: ReactNode;
  /** Off for screens that are already inside a session. */
  aside?: boolean;
}) {
  const still = useStillMotion();

  /** Opt-out fade, used for the three pieces of text above the form. */
  const fade = (delay: number, y = 0) =>
    still
      ? {}
      : {
          initial: { opacity: 0, y },
          animate: { opacity: 1, y: 0 },
          transition: { duration: 0.45, delay, ease: EASE },
        };

  return (
    <div className="min-h-dvh">
      <PublicHeader calculators={false} />

      <div className={cn("grid min-h-dvh", aside && "lg:grid-cols-2", PUBLIC_HEADER_OFFSET)}>
        <main className="grain relative flex items-center justify-center overflow-hidden px-5 py-12 sm:px-8">
          {/*
            Below lg there is no aside, so the form column carries the aurora
            itself — otherwise a phone gets a plain grey page while the desktop
            gets the atmosphere.
          */}
          <div
            aria-hidden
            className={cn("pointer-events-none absolute inset-0", aside && "lg:hidden")}
          >
            <div
              className="aurora drift-a left-1/2 top-[-25%] size-[32rem] -translate-x-1/2"
              style={{ background: "color-mix(in oklab, var(--brand) 75%, transparent)" }}
            />
            <div className="grid-bg absolute inset-0" />
          </div>

          <div className="relative w-full max-w-sm">
            <m.p {...fade(0, 8)} className="eyebrow">
              {eyebrow}
            </m.p>

            <h1 className="mt-3 text-3xl font-semibold leading-[1.1] tracking-[-0.03em] sm:text-[2.5rem]">
              <WordReveal text={title} />
            </h1>

            {description && (
              <m.div
                {...fade(0.35)}
                className="mt-4 text-sm leading-relaxed text-muted-foreground"
              >
                {description}
              </m.div>
            )}

            <div className="mt-8">{children}</div>

            {footer && (
              <m.div {...fade(0.55)} className="mt-6 text-center text-sm text-muted-foreground">
                {footer}
              </m.div>
            )}
          </div>
        </main>

        {aside && (
          <aside className="relative hidden border-l border-border bg-card/20 lg:block">
            <AuthAside />
          </aside>
        )}
      </div>
    </div>
  );
}

/**
 * The one error presentation, so four screens cannot drift into four.
 */
export function AuthError({ children }: { children: ReactNode }) {
  return (
    <div
      role="alert"
      className="rounded-lg border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive"
    >
      {children}
    </div>
  );
}

/** Its counterpart: something worked, or is on its way. */
export function AuthNotice({ icon: Icon, children }: { icon: React.ElementType; children: ReactNode }) {
  return (
    <div className="flex items-start gap-2.5 rounded-lg border border-border bg-secondary/40 px-3.5 py-2.5 text-sm leading-relaxed text-muted-foreground">
      <Icon className="mt-0.5 size-4 shrink-0 text-emerald-400" />
      <span className="min-w-0">{children}</span>
    </div>
  );
}
