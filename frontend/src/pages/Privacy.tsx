import { Link } from "react-router-dom";
import LegalPage, { type LegalSection } from "@/components/legal/LegalPage";

/*
  A public product that stores someone's finances needs a plain statement of
  what it keeps and why. This describes what the code actually does, so it has
  to be updated when the data model is.

  Three statements here were wrong before this rewrite, and each one was the
  kind a careful reader would have caught:

    - It said account deletion happened by emailing me. It has been self-serve
      in Settings since the account-lifecycle migration.
    - It said deletion erased everything immediately. Deletion is reversible for
      seven days; a daily job does the erasing after that.
    - It said "no other third party receives it", while Resend has been handling
      verification codes, password resets and the daily digest all along.

  A privacy page that contradicts the product is worse than a short one. All
  three are corrected below, and the operational data the old page never
  mentioned — rate-limit counters keyed by IP, server error records — is now
  listed too.
*/

const emphasis = "text-foreground";

const SECTIONS: LegalSection[] = [
  {
    id: "what-is-stored",
    heading: "What MyX stores",
    body: [
      <p key="1">
        <span className={emphasis}>Your account:</span> the email address you signed up with, the
        name you chose, and a hash of your password. The password itself is never stored, and the
        hash is not reversible.
      </p>,
      <p key="2">
        <span className={emphasis}>What you put in the app:</span> transactions, budgets, bills and
        subscriptions, loans and their payment history, savings goals, investments, tasks, projects
        and labels, notes, checklists, and memories. Whatever you type into MyX is kept until you
        delete it.
      </p>,
      <p key="3">
        <span className={emphasis}>A small amount of operational data:</span> counters that record
        how many sign-in attempts have come from an IP address or against an email address in the
        last few minutes, which is what stops someone guessing passwords; and, when the server
        fails, a record of what broke — the route, the error and which account hit it last. The
        counters are short-lived and swept automatically. Neither is used for anything else.
      </p>,
    ],
  },
  {
    id: "what-is-not-stored",
    heading: "What MyX does not store",
    body: [
      <p key="1">
        There is no analytics script, no advertising pixel, and no third-party tracker on any page
        of this site. Nothing follows you around the internet, and there is no cookie that exists to
        identify you.
      </p>,
      <p key="2">
        MyX is not connected to any bank. There are no banking credentials, no card numbers, and no
        account numbers, because nothing here ever asks for them — you enter what you spent, or you
        import a statement you downloaded yourself.
      </p>,
      <p key="3">
        The{" "}
        <Link
          to="/calculators"
          className="underline decoration-foreground/30 underline-offset-4 hover:decoration-foreground"
        >
          calculators
        </Link>{" "}
        run entirely in your browser. Nothing you type into them is sent to a server, stored, or
        logged — including the EMI calculator, which needs no account at all.
      </p>,
    ],
  },
  {
    id: "who-else",
    heading: "Who else can see it",
    body: [
      <p key="1">
        Your data is never sold, rented, shared, or used to train anything. Two companies are
        involved in running the service, and this is the whole list:
      </p>,
      <ul key="2" className="space-y-3 pl-5">
        <li className="list-disc">
          <span className={emphasis}>Cloudflare</span> hosts the application and the database. They
          are the infrastructure the service runs on, in the same sense that a landlord owns the
          building.
        </li>
        <li className="list-disc">
          <span className={emphasis}>Resend</span> delivers the emails MyX sends — your verification
          code, a password reset link if you ask for one, and the daily digest if you leave it on.
          They receive your email address and the contents of those messages, and nothing else.
        </li>
      </ul>,
      <p key="3">
        No other third party receives your data. Nobody operating MyX can read your password, and
        nobody reads your transactions or notes.
      </p>,
    ],
  },
  {
    id: "email",
    heading: "Email you will receive",
    body: [
      <p key="1">
        Three kinds, and no others. A six-digit code when you sign up, to confirm the address is
        yours. A reset link, only when you ask for one. And a daily digest of what is due — that one
        is on by default and can be switched off in Settings at any time.
      </p>,
      <p key="2">
        There is no marketing list, no newsletter, and no product announcements. You will not be
        emailed because it has been a while.
      </p>,
    ],
  },
  {
    id: "protection",
    heading: "How it is protected",
    body: [
      <p key="1">
        Passwords are hashed with PBKDF2-SHA256 at 100,000 iterations before they are stored, so a
        copy of the database does not reveal anyone's password.
      </p>,
      <p key="2">
        Every query is scoped to your account at the database level, not filtered afterwards — there
        is no request that can return another user's row. Sessions last 24 hours and slide forward
        while you are active, and signing out revokes every token issued to your account, on every
        device, immediately. Changing your password does the same.
      </p>,
      <p key="3">
        Sign-in and sign-up are rate-limited before any password checking happens, which blocks both
        password guessing and the slower attack of making the server burn processing time.
      </p>,
    ],
  },
  {
    id: "your-device",
    heading: "What is kept on your device",
    body: [
      <p key="1">
        Your session token is stored in your browser's local storage so you stay signed in, and it
        is removed when you sign out. If you install MyX to your home screen, the app's own files
        are cached so it opens offline — your data is not part of that cache, and no response from
        the server is stored on the device.
      </p>,
    ],
  },
  {
    id: "export",
    heading: "Getting your data out",
    body: [
      <p key="1">
        Settings has an export button. It produces a single JSON file containing everything attached
        to your account — every transaction, note, task, checklist and memory — with no waiting
        period and no request to make. It is yours; you should be able to leave with it.
      </p>,
    ],
  },
  {
    id: "deleting",
    heading: "Deleting your account",
    body: [
      <p key="1">
        Delete your account from Settings. It asks for your password, because a mistaken tap should
        not be able to do this.
      </p>,
      <p key="2">
        The moment you confirm, every session ends everywhere and the account stops working. Any
        outstanding verification code or password reset link is destroyed at the same time.
      </p>,
      <p key="3">
        <span className={emphasis}>The account is then recoverable for seven days.</span> Signing
        back in during that window cancels the deletion and everything is exactly where you left it.
        This exists because the previous behaviour erased everything instantly, and one mistaken tap
        on a phone was unrecoverable.
      </p>,
      <p key="4">
        After seven days a daily job erases the account and every row attached to it. At that point
        it is gone, and there is no backup to restore it from.
      </p>,
    ],
  },
  {
    id: "children",
    heading: "Children",
    body: [
      <p key="1">
        MyX is not directed at children, and accounts are not knowingly created for anyone under 13.
        If you believe a child has created an account, email the address below and it will be
        removed.
      </p>,
    ],
  },
  {
    id: "changes",
    heading: "Changes to this page",
    body: [
      <p key="1">
        If what MyX stores changes, this page changes with it and the date at the top moves. There
        is no mailing list to notify, so the honest commitment is this: nothing new will be
        collected quietly, and nothing listed above will start being shared.
      </p>,
    ],
  },
];

export default function Privacy() {
  return (
    <LegalPage
      eyebrow="Legal"
      title="Privacy"
      intro="What MyX stores, who can see it, and how to take it back or delete it. Written to describe what the code actually does rather than to cover anyone."
      updated="20 August 2026"
      summary={[
        "No analytics, no ad pixels, no third-party trackers — anywhere on the site.",
        "Your data is never sold, shared, or used to train anything.",
        "Nothing is connected to your bank, and no card or account numbers are ever asked for.",
        "Export everything as one file, whenever you like, with no waiting period.",
        "Delete your account from Settings. It is recoverable for seven days, then erased for good.",
      ]}
      sections={SECTIONS}
    />
  );
}
