import { Link } from "react-router-dom";
import { Sparkles } from "lucide-react";

/*
  A public product that stores someone's finances needs a plain statement of
  what it keeps and why. Deliberately short and specific — this describes what
  the code actually does, so it has to be updated when the data model does.
*/
export default function Privacy() {
  return (
    <div className="mx-auto min-h-dvh max-w-3xl px-6 py-10">
      <Link to="/" className="inline-flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary glow">
          <Sparkles className="h-[1.15rem] w-[1.15rem] text-primary-foreground" />
        </div>
        <span className="text-lg font-bold tracking-tight">MyX</span>
      </Link>

      <h1 className="mt-10 text-4xl font-extrabold tracking-tight">Privacy</h1>
      <p className="mt-3 text-sm text-muted-foreground">Last updated 18 August 2026</p>

      <div className="mt-10 space-y-8 leading-relaxed text-muted-foreground">
        <section>
          <h2 className="text-xl font-semibold text-foreground">What is stored</h2>
          <p className="mt-3">
            Your email address, your name and a hash of your password, plus whatever you enter into
            the app: transactions, budgets, bills, loans, savings goals, investments, tasks, notes,
            checklists and memories. That is the whole list. There is no analytics script, no
            advertising pixel and no third-party tracker on any page.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">How it is protected</h2>
          <p className="mt-3">
            Passwords are hashed with PBKDF2-SHA256 and never stored in a readable form, so nobody
            operating this service can see yours. Every record is scoped to your account, and every
            request is authenticated before it can read or write anything. Signing out revokes your
            session everywhere it is active.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">Who else sees it</h2>
          <p className="mt-3">
            Nobody. Your data is not sold, shared, rented or used to train anything. It is stored in
            Cloudflare D1, which means Cloudflare hosts the database as an infrastructure provider,
            and no other third party receives it.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">Deleting your data</h2>
          <p className="mt-3">
            Deleting a record deletes it. To remove your account and everything attached to it,
            email the address below and it will be erased from the database, along with every row
            that belongs to it.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-semibold text-foreground">Contact</h2>
          <p className="mt-3">
            Questions about any of this: <span className="text-foreground">sampathbandla199@gmail.com</span>
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
