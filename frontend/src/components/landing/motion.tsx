import { motion as m, useReducedMotion, type Variants } from "motion/react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/*
  The landing page's motion layer.

  **On the bundle.** This was written with LazyMotion + the minimal `m` entry,
  on the theory that the ~20 kB of DOM animation features would then be fetched
  after paint instead of shipping in the entry chunk. Measured, it made no
  difference at all: `LazyMotion`, `AnimatePresence`, `useScroll` and `useInView`
  all live in framer-motion's main entry, so importing any of them makes the
  whole entry a static dependency and the dynamic `import()` of the same module
  collapses back into it. The indirection was removed rather than left in
  looking like it did something. The library is ~65 kB gzipped, in the entry
  chunk, because this page is eagerly imported for the build-time prerender.

  **Why every wrapper is opt-out.** `useReducedMotion` returns true when the OS
  asks for less movement, and each helper below then renders its children with
  no transform and no transition at all — not a faster version of the same
  animation. A page that slides six sections in is unpleasant for someone who
  set that switch precisely to stop things sliding.
*/

/** The house easing: fast out of the gate, long settle. */
const EASE = [0.22, 1, 0.36, 1] as const;

/**
 * Wraps the page. A plain pass-through today — it exists so the page has one
 * named boundary for its motion layer, and so swapping the implementation
 * (back to LazyMotion, or off the library entirely) is a one-file change.
 */
export function MotionProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}

export const fadeUp: Variants = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.6, ease: EASE } },
};

/**
 * A section that animates in the first time it is scrolled to.
 *
 * `once` matters: re-animating on the way back up turns a scroll-up into a
 * flickering mess, and nobody wants to watch the same reveal twice.
 */
export function Reveal({
  children,
  className,
  delay = 0,
  y = 18,
  as: _as,
}: {
  children: ReactNode;
  className?: string;
  delay?: number;
  y?: number;
  as?: never;
}) {
  const still = useReducedMotion();
  if (still) return <div className={className}>{children}</div>;
  return (
    <m.div
      className={className}
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, ease: EASE, delay }}
    >
      {children}
    </m.div>
  );
}

/**
 * A container whose children arrive one after another.
 *
 * Children must be `<Stagger.Item>`; the delay comes from the parent rather
 * than from a hand-written `delay: i * 0.06` on each one, so inserting a card
 * in the middle does not require renumbering the rest.
 */
export function Stagger({
  children,
  className,
  gap = 0.07,
}: {
  children: ReactNode;
  className?: string;
  gap?: number;
}) {
  const still = useReducedMotion();
  if (still) return <div className={className}>{children}</div>;
  return (
    <m.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-60px" }}
      variants={{ show: { transition: { staggerChildren: gap } } }}
    >
      {children}
    </m.div>
  );
}

Stagger.Item = function StaggerItem({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  const still = useReducedMotion();
  if (still) return <div className={className}>{children}</div>;
  return (
    <m.div className={className} variants={fadeUp}>
      {children}
    </m.div>
  );
};

/**
 * A headline that arrives a word at a time.
 *
 * The words are real text in the DOM either way — this splits on spaces and
 * animates spans, so the prerendered HTML a crawler reads is the same sentence
 * whether or not the animation ever runs.
 */
export function WordReveal({
  text,
  className,
  wordClassName,
  delay = 0,
}: {
  text: string;
  className?: string;
  /** Applied to every word — used to gradient-fill the second line. */
  wordClassName?: string;
  delay?: number;
}) {
  const still = useReducedMotion();
  const words = text.split(" ");

  if (still) return <span className={cn(className, wordClassName)}>{text}</span>;

  return (
    <m.span
      className={cn("inline", className)}
      initial="hidden"
      animate="show"
      variants={{ show: { transition: { staggerChildren: 0.045, delayChildren: delay } } }}
      aria-label={text}
    >
      {words.map((word, i) => (
        <span key={`${word}-${i}`}>
          {/*
            The wrapper clips, the inner span slides up out of it — a mask
            reveal, which reads as typesetting rather than as a fade. The
            padding/negative-margin pair gives descenders (g, y, p) room inside
            the clip without moving the baseline.
          */}
          <span className="inline-block overflow-hidden pb-[0.14em] -mb-[0.14em] align-bottom">
            <m.span
              className={cn("inline-block", wordClassName)}
              variants={{
                hidden: { y: "110%" },
                show: { y: 0, transition: { duration: 0.8, ease: EASE } },
              }}
            >
              {word}
            </m.span>
          </span>
          {/* Outside the clip, a space at the edge of an inline-block collapses. */}
          {i < words.length - 1 ? " " : null}
        </span>
      ))}
    </m.span>
  );
}

export { m, useReducedMotion };
