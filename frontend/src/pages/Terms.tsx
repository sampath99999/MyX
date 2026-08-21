import { Link } from "react-router-dom";
import LegalPage, { type LegalSection } from "@/components/legal/LegalPage";

/*
  Terms, written plainly rather than defensively.

  Updated alongside the privacy page for the same reason: the product moved and
  the document did not. Export is available today rather than only if the
  service shuts down, deletion is self-serve with a seven-day window, and there
  are now thirteen public calculators — which makes "these are not financial
  advice" a statement that has to be made where people will actually read it,
  not buried in a warranty clause.
*/

const emphasis = "text-foreground";

const SECTIONS: LegalSection[] = [
  {
    id: "what-this-is",
    heading: "What MyX is",
    body: [
      <p key="1">
        MyX is a personal life manager — money, tasks, notes, checklists and memories in one place —
        offered free of charge, with a set of public financial calculators that need no account at
        all.
      </p>,
      <p key="2">
        It is a personal project rather than a company. There is no support desk, no service level
        agreement, and no team on call. One person builds and runs it, and these terms are written
        to say what you can actually expect rather than to defend against you.
      </p>,
      <p key="3">
        Using MyX means accepting what is on this page and on the{" "}
        <Link
          to="/privacy"
          className="underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
        >
          privacy page
        </Link>
        .
      </p>,
    ],
  },
  {
    id: "your-account",
    heading: "Your account",
    body: [
      <p key="1">
        One account is for one person. You are responsible for keeping your password to yourself and
        for what happens under your account, so pick something you do not use elsewhere.
      </p>,
      <p key="2">
        Do not use MyX to store anything illegal, do not attempt to reach another user's data, and
        do not try to degrade the service for other people. Accounts doing any of those may be
        removed without notice.
      </p>,
      <p key="3">
        You must be at least 13 to create an account.
      </p>,
    ],
  },
  {
    id: "not-advice",
    heading: "The money features are not financial advice",
    body: [
      <p key="1">
        This is the most important paragraph on the page.{" "}
        <span className={emphasis}>
          Nothing in MyX is financial, investment, tax or legal advice.
        </span>{" "}
        The app does arithmetic on numbers you enter, and the{" "}
        <Link
          to="/calculators"
          className="underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
        >
          calculators
        </Link>{" "}
        do arithmetic on numbers you type into them.
      </p>,
      <p key="2">
        Every calculator states the convention it follows and links the source that sets the rule,
        because conventions differ and rates change. Even so, a projection is an estimate built on
        assumptions you supplied — a return you guessed, an inflation rate you picked, a tenure you
        chose. Real returns vary, real rates reset, and real banks round differently.
      </p>,
      <p key="3">
        MyX is not an accounting record and it is not a substitute for your bank's own statements.
        Before acting on anything material, check it against the institution that holds the money,
        and talk to someone qualified.
      </p>,
    ],
  },
  {
    id: "your-data",
    heading: "Your data is yours",
    body: [
      <p key="1">
        You keep every right to what you put in. Nothing you store is claimed, licensed, published,
        or used to train anything.
      </p>,
      <p key="2">
        Settings has an export button that hands you everything attached to your account as a single
        file, at any time. It also has a delete button that ends every session immediately and
        erases the account after a seven-day window in which signing back in cancels it. The{" "}
        <Link
          to="/privacy"
          className="underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
        >
          privacy page
        </Link>{" "}
        sets out exactly what is stored and who else can see it.
      </p>,
    ],
  },
  {
    id: "availability",
    heading: "Availability, and no warranty",
    body: [
      <p key="1">
        MyX is provided as-is and as-available, without any guarantee of uptime, accuracy, or
        fitness for a particular purpose. It runs on free infrastructure. It may be slow, it may be
        briefly unavailable, and features may change or be withdrawn.
      </p>,
      <p key="2">
        <span className={emphasis}>Keep your own copies of anything you cannot afford to lose.</span>{" "}
        The export button exists for exactly this, and using it occasionally is a reasonable habit
        for any free service, including this one.
      </p>,
      <p key="3">
        To the extent the law allows, no liability is accepted for any loss arising from using MyX —
        including lost data, a decision made on a figure it produced, or the service being
        unavailable when you needed it.
      </p>,
    ],
  },
  {
    id: "ending",
    heading: "Ending it",
    body: [
      <p key="1">
        You can delete your account whenever you like, from Settings, without asking anyone.
      </p>,
      <p key="2">
        Accounts that abuse the service may be removed. If MyX is ever shut down, reasonable notice
        will be given here and by email so there is time to export what you have stored.
      </p>,
    ],
  },
  {
    id: "changes",
    heading: "Changes to these terms",
    body: [
      <p key="1">
        These terms may change as the product does. The date at the top moves when they do, and a
        change that materially affects you — anything about your data, your rights to it, or what
        the service costs — will be announced by email rather than quietly edited in.
      </p>,
    ],
  },
  {
    id: "law",
    heading: "Governing law",
    body: [
      <p key="1">
        MyX is operated from India, and these terms are governed by Indian law. Nothing here removes
        any right you have under the consumer protection law of the country you live in.
      </p>,
    ],
  },
];

export default function Terms() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Terms of use"
      intro="What you can expect from MyX, and what it expects from you. Short, plain, and written by the person who runs it."
      updated="20 August 2026"
      summary={[
        "Free to use, with no card and no premium tier.",
        "What you put in stays yours — export it or delete it whenever you like.",
        "Nothing in MyX is financial advice, including the calculators.",
        "It runs on free infrastructure and comes with no uptime guarantee.",
        "One account per person, and you must be at least 13.",
      ]}
      sections={SECTIONS}
    />
  );
}
