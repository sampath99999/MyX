import { useCallback, useEffect, useState } from "react";
import {
  ShieldCheck,
  Loader2,
  AlertTriangle,
  Users,
  Activity,
  RefreshCw,
  Check,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api";

/*
  Owner-only operations view.

  Unlinked from everywhere, excluded from robots.txt and from the prerendered
  route list, and answered with 404 by the API for anyone who is not flagged as
  an admin in the database. Opening it needs a fresh emailed code on top of the
  password, because a stolen session should not be enough to read how the whole
  service is doing.

  It shows counts and failures. It cannot show anyone's transactions, notes or
  memories — an admin screen able to browse those would make the privacy page's
  promise untrue.
*/

interface ErrorGroup {
  fingerprint: string;
  message: string;
  stack: string | null;
  route: string;
  method: string;
  status: number;
  count: number;
  first_seen: number;
  last_seen: number;
  last_user_id: number | null;
  resolved_at: number | null;
}

function ago(unixSeconds: number): string {
  const seconds = Math.max(0, Math.floor(Date.now() / 1000) - unixSeconds);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}

function Stat({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className="rounded-xl border border-border/60 p-4">
      <div className="text-2xl font-bold tracking-tight tabular-nums">{value}</div>
      <div className="mt-0.5 text-sm text-muted-foreground">{label}</div>
      {hint && <div className="text-xs text-muted-foreground/70">{hint}</div>}
    </div>
  );
}

export default function Admin() {
  const [unlocked, setUnlocked] = useState<boolean | null>(null);
  const [codeSent, setCodeSent] = useState(false);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [stats, setStats] = useState<Awaited<ReturnType<typeof api.adminStats>> | null>(null);
  const [health, setHealth] = useState<Record<string, number | string | null> | null>(null);
  const [errors, setErrors] = useState<ErrorGroup[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  /*
    The API answers 404 rather than 403 to a non-admin, so a plain "not found"
    is the expected outcome for anyone who should not be here — it must not look
    like a locked door with something behind it.
  */
  const [forbidden, setForbidden] = useState(false);

  useEffect(() => {
    // Keeping the tab title generic: whatever is in the browser history should
    // not announce what this page is.
    document.title = "MyX";
  }, []);

  const checkSession = useCallback(async () => {
    try {
      const res = await api.adminSession();
      setUnlocked(res.unlocked);
    } catch (err) {
      if (err instanceof ApiError && err.status === 404) setForbidden(true);
      setUnlocked(false);
    }
  }, []);

  const loadAll = useCallback(async () => {
    setBusy(true);
    try {
      const [s, h, e] = await Promise.all([
        api.adminStats(),
        api.adminHealth(),
        api.adminErrors(),
      ]);
      setStats(s);
      setHealth(h.health);
      setErrors(e.errors as ErrorGroup[]);
    } catch (err) {
      if (err instanceof ApiError && err.status === 423) setUnlocked(false);
      else setError(err instanceof ApiError ? err.message : "Could not load.");
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    checkSession();
  }, [checkSession]);

  useEffect(() => {
    if (unlocked) loadAll();
  }, [unlocked, loadAll]);

  async function requestCode() {
    setBusy(true);
    setError(null);
    try {
      await api.adminUnlock();
      setCodeSent(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send a code.");
    } finally {
      setBusy(false);
    }
  }

  async function submitCode() {
    setBusy(true);
    setError(null);
    try {
      await api.adminUnlockVerify(code);
      setUnlocked(true);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "That did not work.");
      setCode("");
    } finally {
      setBusy(false);
    }
  }

  async function resolve(fingerprint: string) {
    await api.adminResolveError(fingerprint);
    await loadAll();
  }

  if (forbidden) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <p className="text-muted-foreground">Not found.</p>
      </div>
    );
  }

  if (unlocked === null) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (!unlocked) {
    return (
      <div className="flex min-h-dvh items-center justify-center px-6">
        <div className="w-full max-w-sm">
          <ShieldCheck className="h-7 w-7 text-primary" />
          <h1 className="mt-4 text-2xl font-bold tracking-tight">Admin</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
            {codeSent
              ? "Enter the code sent to your email. It opens these screens for 30 minutes."
              : "Your password is not enough to open this. A code will be sent to your email."}
          </p>

          {codeSent ? (
            <div className="mt-6 space-y-3">
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                autoFocus
                maxLength={7}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^\d\s-]/g, ""))}
                placeholder="000000"
                className="w-full rounded-lg border border-input bg-transparent px-3 py-3 text-center text-2xl font-semibold tracking-[0.4em] outline-none focus:border-ring"
              />
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button
                className="w-full"
                onClick={submitCode}
                disabled={busy || code.replace(/\D/g, "").length !== 6}
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Unlock"}
              </Button>
            </div>
          ) : (
            <div className="mt-6 space-y-3">
              {error && <p className="text-sm text-destructive">{error}</p>}
              <Button className="w-full" onClick={requestCode} disabled={busy}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Email me a code"}
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  const openErrors = errors.filter((e) => !e.resolved_at);

  return (
    <div className="mx-auto max-w-5xl px-6 py-10">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <ShieldCheck className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">Admin</h1>
        </div>
        <Button size="sm" variant="secondary" onClick={loadAll} disabled={busy}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Refresh
        </Button>
      </div>

      {error && <p className="mt-4 text-sm text-destructive">{error}</p>}

      {/* ---- Exceptions: the reason this page exists ---- */}
      <section className="mt-8">
        <div className="flex items-center gap-2">
          <AlertTriangle
            className={`h-4 w-4 ${openErrors.length ? "text-rose-300" : "text-muted-foreground"}`}
          />
          <h2 className="font-semibold">
            {openErrors.length ? `${openErrors.length} open error groups` : "No open errors"}
          </h2>
        </div>

        {openErrors.length > 0 && (
          <div className="mt-4 space-y-2">
            {openErrors.map((e) => (
              <Card key={e.fingerprint} className="glass p-4">
                <div className="flex items-start gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded bg-rose-500/15 px-1.5 py-0.5 font-mono text-[11px] font-semibold text-rose-300">
                        {e.status}
                      </span>
                      <span className="font-mono text-xs text-muted-foreground">
                        {e.method} {e.route}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ×{e.count} · last {ago(e.last_seen)}
                      </span>
                    </div>
                    <p className="mt-1.5 break-words text-sm">{e.message}</p>
                    {e.stack && (
                      <button
                        onClick={() =>
                          setExpanded(expanded === e.fingerprint ? null : e.fingerprint)
                        }
                        className="mt-2 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
                      >
                        Stack
                        <ChevronDown
                          className={`h-3 w-3 ${expanded === e.fingerprint ? "rotate-180" : ""}`}
                        />
                      </button>
                    )}
                    {expanded === e.fingerprint && e.stack && (
                      <pre className="mt-2 max-h-56 overflow-auto rounded-lg border border-border/60 p-3 text-[11px] leading-relaxed text-muted-foreground">
                        {e.stack}
                      </pre>
                    )}
                  </div>
                  <button
                    onClick={() => resolve(e.fingerprint)}
                    title="Acknowledge — it reopens if it happens again"
                    className="shrink-0 rounded-lg border border-border/60 p-1.5 text-muted-foreground transition-colors hover:text-emerald-300"
                  >
                    <Check className="h-4 w-4" />
                  </button>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* ---- Users ---- */}
      {stats && (
        <section className="mt-10">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Users</h2>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="Total" value={stats.users.total ?? 0} />
            <Stat
              label="Verified"
              value={stats.users.verified ?? 0}
              hint={`${(stats.users.total ?? 0) - (stats.users.verified ?? 0)} unverified`}
            />
            <Stat label="New this week" value={stats.users.new_this_week ?? 0} />
            <Stat label="Digest on" value={stats.users.digest_on ?? 0} />
          </div>

          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Object.entries(stats.content ?? {}).map(([key, value]) => (
              <Stat key={key} label={key} value={value as number} />
            ))}
          </div>
        </section>
      )}

      {/* ---- Health ---- */}
      {health && (
        <section className="mt-10">
          <div className="flex items-center gap-2">
            <Activity className="h-4 w-4 text-primary" />
            <h2 className="font-semibold">Health</h2>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {Object.entries(health).map(([key, value]) => (
              <Stat key={key} label={key.replace(/_/g, " ")} value={String(value ?? "—")} />
            ))}
          </div>
          {stats && (
            <p className="mt-3 text-xs text-muted-foreground">
              Digests: {stats.digests.sent_total ?? 0} sent in total, {stats.digests.sent_today ?? 0}{" "}
              today.
            </p>
          )}
        </section>
      )}
    </div>
  );
}
