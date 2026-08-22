import { useState } from "react";
import { AnimatePresence } from "motion/react";
import { Plus } from "lucide-react";
import { m, useStillMotion } from "@/components/landing/motion";
import { cn } from "@/lib/utils";

/*
  The questions people actually ask before signing up for something that will
  hold their salary and their bills. Answered plainly — every hedge here reads
  as a reason not to trust the app.

  One panel open at a time: an accordion where everything can be open at once
  is a page with a random amount of content on it, and the reader loses their
  place every time they open a second one.
*/

export interface FaqItem {
  q: string;
  a: string;
}

const QUESTIONS: FaqItem[] = [
  {
    q: "Is it really free?",
    a: "Yes, and there is no upgrade page waiting for you. MyX runs on infrastructure that costs nothing at this size, so there is no bill to pass on and no reason to sell anything about you.",
  },
  {
    q: "Can anyone else see my money?",
    a: "No. Every query is scoped to your account, your password is hashed with PBKDF2 before it is stored, and there is no analytics script, advertising pixel or third-party tracker anywhere in the app. Nothing about your data leaves the app.",
  },
  {
    q: "Do I have to use all of it?",
    a: "No. Most people start with one thing — logging expenses, or a bedtime checklist — and never touch the rest. Empty modules stay quietly out of the way rather than nagging you to fill them.",
  },
  {
    q: "Does it work on my phone?",
    a: "It installs to your home screen like an app, on iPhone and Android, and keeps working on whatever you have already opened when the signal drops. There is nothing to download from a store.",
  },
  {
    q: "What if I want to leave?",
    a: "Export everything you have as a single file whenever you like, and delete the account from settings in one step. That erases every row attached to it — no email thread, no waiting period.",
  },
  {
    q: "Is my bank connected to this?",
    a: "No, and that is deliberate. Nothing is linked to a bank, so there are no credentials to leak. You add what you spend, or import a statement you downloaded yourself.",
  },
];

/**
 * `items` defaults to the landing page's own questions. The EMI calculator
 * passes its own set — the accordion behaviour and the look are the same, and
 * having two of these drift apart is exactly how a site starts feeling
 * assembled rather than designed.
 */
export default function Faq({ items = QUESTIONS }: { items?: FaqItem[] }) {
  const [open, setOpen] = useState<number | null>(0);
  const still = useStillMotion();

  return (
    <div className="divide-y divide-border overflow-hidden rounded-2xl border border-border">
      {items.map((item, i) => {
        const isOpen = open === i;
        return (
          <div key={item.q}>
            <h3>
              <button
                onClick={() => setOpen(isOpen ? null : i)}
                aria-expanded={isOpen}
                className="flex w-full items-center gap-4 px-5 py-4 text-left transition-colors hover:bg-card/60 sm:px-6 sm:py-5"
              >
                <span className="min-w-0 flex-1 text-sm font-medium sm:text-base">{item.q}</span>
                <span
                  className={cn(
                    "flex size-7 shrink-0 items-center justify-center rounded-full border border-border transition-transform duration-300",
                    isOpen && "rotate-45 border-transparent bg-foreground text-background",
                  )}
                >
                  <Plus className="size-3.5" />
                </span>
              </button>
            </h3>
            <AnimatePresence initial={false}>
              {isOpen && (
                <m.div
                  key="answer"
                  initial={still ? false : { height: 0, opacity: 0 }}
                  animate={{ height: "auto", opacity: 1 }}
                  exit={still ? undefined : { height: 0, opacity: 0 }}
                  transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
                  className="overflow-hidden"
                >
                  <p className="px-5 pb-5 pr-14 text-sm leading-relaxed text-muted-foreground sm:px-6 sm:pb-6">
                    {item.a}
                  </p>
                </m.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}
