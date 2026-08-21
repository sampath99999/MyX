import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, Mail } from "lucide-react";
import { Card } from "@/components/ui/card";
import PublicHeader, { PUBLIC_HEADER_OFFSET } from "@/components/PublicHeader";
import PublicFooter from "@/components/PublicFooter";
import { cn } from "@/lib/utils";

/*
  The frame for the privacy and terms pages.

  Both were a wordmark, a wall of prose and a "back to home" link — no header,
  no theme switch, no way to reach anything else, and nothing to navigate a page
  of a dozen sections with. They are also the two pages a cautious person reads
  most carefully before handing over their bank statement, so looking like an
  afterthought is expensive in the one place it can least be afforded.

  Two things earn their place beyond the paint. The contents list down the side
  makes a long document skimmable and gives every section a linkable anchor —
  useful when someone asks "where does it say that?". And the summary at the top
  states the whole document in five lines, because the honest version of a
  privacy policy is short and the long version exists to be precise, not to hide
  anything.
*/

export interface LegalSection {
  id: string;
  heading: string;
  body: ReactNode[];
}

function ContentsList({ sections }: { sections: LegalSection[] }) {
  return (
    <ul className="space-y-1 border-l border-border">
      {sections.map((section) => (
        <li key={section.id}>
          <a
            href={`#${section.id}`}
            className="-ml-px block border-l border-transparent py-2 pl-4 text-sm text-muted-foreground transition-colors hover:border-foreground hover:text-foreground"
          >
            {section.heading}
          </a>
        </li>
      ))}
    </ul>
  );
}

export default function LegalPage({
  eyebrow,
  title,
  intro,
  updated,
  summary,
  sections,
}: {
  eyebrow: string;
  title: string;
  intro: string;
  /** Human-readable, e.g. "20 August 2026". */
  updated: string;
  /** The whole document in a handful of lines. */
  summary: string[];
  sections: LegalSection[];
}) {
  return (
    <div className="min-h-dvh">
      <PublicHeader calculators={false} />

      <section className={cn("grain relative overflow-hidden", PUBLIC_HEADER_OFFSET)}>
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div
            className="aurora drift-a left-[-8%] top-[-45%] size-[30rem]"
            style={{ background: "color-mix(in oklab, var(--brand) 70%, transparent)" }}
          />
          <div className="grid-bg absolute inset-0" />
        </div>

        <div className="relative mx-auto max-w-6xl px-5 pb-10 pt-14 sm:px-6 sm:pt-20">
          <p className="eyebrow">{eyebrow}</p>
          <h1 className="mt-4 text-3xl font-semibold leading-[1.1] tracking-[-0.03em] sm:text-5xl">
            {title}
          </h1>
          <p className="mt-5 max-w-2xl text-base leading-relaxed text-muted-foreground">{intro}</p>
          <p className="mt-4 text-xs text-muted-foreground">Last updated {updated}</p>
        </div>

        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-24 bg-gradient-to-b from-transparent to-background"
        />
      </section>

      <main className="mx-auto max-w-6xl px-5 pb-24 sm:px-6">
        <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_16rem] lg:gap-16">
          <div className="min-w-0">
            <Card className="p-5 sm:p-6">
              <h2 className="text-sm font-semibold">The short version</h2>
              <ul className="mt-4 space-y-2.5">
                {summary.map((line) => (
                  <li key={line} className="flex gap-2.5 text-sm leading-relaxed">
                    <Check className="mt-0.5 size-4 shrink-0 text-emerald-400" />
                    <span className="text-muted-foreground">{line}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 border-t border-border pt-4 text-xs leading-relaxed text-muted-foreground">
                The sections below are the precise version. Where the two differ, the sections win.
              </p>
            </Card>

            {/*
              On a phone the sidebar below is `hidden`, and this takes its
              place. It used to be the same element ordered first, which put a
              426px list of ten links between the reader and the first word of
              the document — a table of contents is a shortcut, and it stopped
              being one the moment it had to be scrolled past.
            */}
            <details className="mt-6 rounded-xl border border-border lg:hidden">
              <summary className="cursor-pointer list-none px-5 py-3.5 text-sm font-medium">
                On this page
              </summary>
              <div className="px-5 pb-4">
                <ContentsList sections={sections} />
              </div>
            </details>

            <div className="mt-12 space-y-12">
              {sections.map((section) => (
                <section
                  key={section.id}
                  id={section.id}
                  /* Clears the fixed header when an anchor is jumped to. */
                  className="scroll-mt-24"
                >
                  <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">
                    {section.heading}
                  </h2>
                  <div className="mt-4 space-y-4 leading-relaxed text-muted-foreground">
                    {section.body.map((paragraph, i) => (
                      <div key={i}>{paragraph}</div>
                    ))}
                  </div>
                </section>
              ))}
            </div>

            <Card className="mt-14 flex flex-col gap-3 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
              <div className="flex items-start gap-3">
                <Mail className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
                <div>
                  <p className="text-sm font-medium">Questions about any of this?</p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    One person reads this address, and it is the same person who wrote the code.
                  </p>
                </div>
              </div>
              <a
                href="mailto:sampathbandla199@gmail.com"
                className="shrink-0 text-sm font-medium underline decoration-foreground/30 underline-offset-4 transition-colors hover:decoration-foreground"
              >
                sampathbandla199@gmail.com
              </a>
            </Card>
          </div>

          {/*
            Sticky contents. Ordinary anchors rather than a scroll-spy: this is
            a document, and a highlight that lags the scroll on a long page is
            more distracting than no highlight at all.
          */}
          <aside className="hidden lg:sticky lg:top-24 lg:block lg:self-start">
            <nav aria-label="On this page">
              <p className="eyebrow mb-3">On this page</p>
              <ContentsList sections={sections} />
              <Link
                to={title.toLowerCase().includes("privacy") ? "/terms" : "/privacy"}
                className="mt-5 inline-block border-l border-transparent pl-4 text-sm underline decoration-foreground/25 underline-offset-4 transition-colors hover:decoration-foreground"
              >
                {title.toLowerCase().includes("privacy") ? "Terms of use" : "Privacy"}
              </Link>
            </nav>
          </aside>
        </div>
      </main>

      <PublicFooter />
    </div>
  );
}
