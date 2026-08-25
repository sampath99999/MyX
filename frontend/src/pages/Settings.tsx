import { useState, type FormEvent } from "react";
import { Loader2, ShieldAlert, Bell, Download, Check, Palette } from "lucide-react";
import { useAuth } from "@/lib/auth";
import Switch from "@/components/ui/switch";
import { api, ApiError, clearToken, downloadExport } from "@/lib/api";
import { useTheme, THEME_OPTIONS } from "@/lib/theme";
import Connections from "@/components/Connections";

/*
  Account settings: appearance, the digest, taking your data out, and deletion.

  Deletion is guarded twice on purpose — the password (checked server-side, so a
  stolen session token cannot destroy someone's records) and typing the word
  DELETE, which stops a misclick on a phone. Since it became reversible for a
  week, the export sits directly above it: leaving should not mean losing.
*/
export default function Settings() {
  const { user, logout, refresh } = useAuth();
  const { theme, setTheme } = useTheme();
  // Undefined on sessions predating the feature; those accounts are opted in.
  const [digest, setDigest] = useState(user?.digest_enabled !== false);
  const [digestBusy, setDigestBusy] = useState(false);
  const [password, setPassword] = useState("");
  const [confirmWord, setConfirmWord] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [exported, setExported] = useState<string | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const canDelete = confirmWord.trim().toUpperCase() === "DELETE" && password.length > 0;

  async function onExport() {
    setExporting(true);
    setExportError(null);
    try {
      const { bytes } = await downloadExport();
      const size = bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
      setExported(size);
    } catch (err) {
      setExportError(err instanceof ApiError ? err.message : "Could not build the file.");
    } finally {
      setExporting(false);
    }
  }

  async function onDelete(e: FormEvent) {
    e.preventDefault();
    if (!canDelete) return;
    setBusy(true);
    setError(null);
    try {
      await api.deleteAccount({ password });
      // Every token for this account was just revoked server-side, so the one
      // in localStorage is already dead — dropping it only saves a 401.
      clearToken();
      window.location.href = "/";
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Something went wrong. Try again.");
      setBusy(false);
    }
  }

  return (
    <>
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

        <section className="rounded-2xl border border-border/60 p-6">
          <div className="flex items-center gap-2">
            <Palette className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Appearance</h2>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            System follows your device, so the app turns dark when everything else does.
          </p>
          <div
            role="radiogroup"
            aria-label="Theme"
            className="mt-5 inline-flex rounded-xl border border-border/60 p-1"
          >
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.value}
                role="radio"
                aria-checked={theme === option.value}
                onClick={() => setTheme(option.value)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  theme === option.value
                    ? "bg-primary/15 text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                {option.label}
              </button>
            ))}
          </div>
        </section>

        <section className="rounded-2xl border border-border/60 p-6">
          <div className="flex items-center gap-2">
            <Bell className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Daily digest</h2>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            One email each morning listing bills due, tasks due and budgets running out — and only
            on days something is actually due. Quiet days send nothing.
          </p>
          <div className="mt-4 flex items-center gap-3">
            <Switch
              className="min-w-0 flex-1"
              label="Send me the daily digest"
              checked={digest}
              disabled={digestBusy}
              onChange={async (next) => {
                setDigest(next);
                setDigestBusy(true);
                try {
                  await api.setPreferences({ digest_enabled: next });
                  await refresh();
                } catch {
                  // Put the switch back rather than showing a state the server
                  // does not agree with.
                  setDigest(!next);
                } finally {
                  setDigestBusy(false);
                }
              }}
            />
            {digestBusy && <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />}
          </div>
          {user?.email_verified === false && (
            <p className="mt-3 text-xs text-amber-300/80">
              Confirm your email address first — digests only go to verified addresses.
            </p>
          )}
        </section>

        <Connections />

        <section className="rounded-2xl border border-border/60 p-6">
          <div className="flex items-center gap-2">
            <Download className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-semibold">Export your data</h2>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            One JSON file with everything in your account — transactions, budgets, loans and their
            payment history, goals, investments, tasks, notes, checklists and memories. Amounts come
            out in rupees, and nothing is left behind.
          </p>
          <button
            onClick={onExport}
            disabled={exporting}
            className="mt-5 flex items-center gap-2 rounded-lg border border-border/60 px-4 py-2 text-sm font-medium transition-colors hover:bg-accent disabled:opacity-50"
          >
            {exporting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Download className="h-4 w-4" />
            )}
            Download everything
          </button>
          {exported && (
            <p className="mt-3 flex items-center gap-1.5 text-xs text-emerald-400">
              <Check className="h-3.5 w-3.5" />
              Saved — {exported}. Keep it somewhere private; it contains your notes in full.
            </p>
          )}
          {exportError && <p className="mt-3 text-xs text-destructive">{exportError}</p>}
        </section>

        <section className="rounded-2xl border border-destructive/40 p-6">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-destructive" />
            <h2 className="text-lg font-semibold">Delete account</h2>
          </div>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            This removes your account and everything in it — transactions, budgets, loans, goals,
            investments, tasks, notes, checklists and memories. You are signed out everywhere
            immediately and nothing stays reachable.
          </p>
          <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
            <span className="font-medium text-foreground">You have 7 days to change your mind.</span>{" "}
            Signing in again within a week brings the whole account back exactly as it was. After
            that it is erased for good and cannot be recovered — so download your data first if you
            want to keep any of it.
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
              Delete my account
            </button>
          </form>
        </section>
      </div>
    </>
  );
}
