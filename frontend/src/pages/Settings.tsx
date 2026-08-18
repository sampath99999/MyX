import { useState, type FormEvent } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { useAuth } from "@/lib/auth";
import { api, ApiError, clearToken } from "@/lib/api";

/*
  Account settings. Currently one thing — deletion — which the privacy page
  promised and which previously required emailing a human.

  Guarded twice on purpose: the password (checked server-side, so a stolen
  session token cannot destroy someone's records) and typing the word DELETE,
  which stops a misclick on a phone.
*/
export default function Settings() {
  const { user, logout } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmWord, setConfirmWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canDelete = confirmWord.trim().toUpperCase() === "DELETE" && password.length > 0;

  async function onDelete(e: FormEvent) {
    e.preventDefault();
    if (!canDelete) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount({ password });
      // The account is gone, so there is no session left to revoke server-side.
      clearToken();
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <>
      <PageHeader title="Settings" subtitle="Your account" />

      <div className="mx-auto max-w-2xl space-y-8 px-6 py-8">
        <section className="rounded-2xl border border-border/60 p-6">
          <h2 className="text-lg font-semibold">Account</h2>
          <dl className="mt-4 space-y-3 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Name</dt>
              <dd>{user?.name}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Email</dt>
              <dd className="truncate">{user?.email}</dd>
            </div>
          </dl>
          <button
            onClick={logout}
            className="mt-6 rounded-lg border border-border/60 px-4 py-2 text-sm font-medium transition-colors hover:bg-accent"
          >
            Sign out everywhere
          </button>
          <p className="mt-2 text-xs text-muted-foreground">
            Signing out revokes every token issued for this account, on all devices.
          </p>
        </section>

        <section className="rounded-2xl border border-destructive/40 p-6">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            <h2 className="text-lg font-semibold">Delete account</h2>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            This erases your account and everything in it — transactions, budgets, loans, goals,
            investments, tasks, notes, checklists and memories. It cannot be undone and there is no
            backup to restore from.
          </p>

          <form onSubmit={onDelete} className="mt-6 space-y-4">
            <div>
              <label htmlFor="del-password" className="text-sm font-medium">
                Your password
              </label>
              <input
                id="del-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="mt-1.5 w-full rounded-lg border border-input bg-transparent px-3 py-2.5 outline-none focus:border-ring"
              />
            </div>
            <div>
              <label htmlFor="del-confirm" className="text-sm font-medium">
                Type DELETE to confirm
              </label>
              <input
                id="del-confirm"
                value={confirmWord}
                onChange={(e) => setConfirmWord(e.target.value)}
                placeholder="DELETE"
                className="mt-1.5 w-full rounded-lg border border-input bg-transparent px-3 py-2.5 outline-none focus:border-ring"
              />
            </div>

            {error && <p className="text-sm text-destructive">{error}</p>}

            <button
              type="submit"
              disabled={!canDelete || busy}
              className="flex items-center justify-center gap-2 rounded-xl bg-destructive px-5 py-3 font-semibold text-destructive-foreground disabled:opacity-40"
            >
              {busy && <Loader2 className="h-4 w-4 animate-spin" />}
              Permanently delete my account
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
