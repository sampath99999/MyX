import { useEffect, useState } from "react";
import {
  Check,
  Copy,
  KeyRound,
  Loader2,
  Plug,
  ShieldCheck,
  Trash2,
  TriangleAlert,
} from "lucide-react";
import { api, ApiError, MCP_URL, type ApiKey, type ApiKeyScope } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";

/*
  Connecting an AI assistant to the account.

  MyX speaks MCP at /api/mcp, so anything that speaks it back — OpenClaw, Claude,
  an editor — can read and write the account with a key minted here. This screen
  is the whole setup: make a key, copy one command, done.

  The one thing it has to get right is the moment after creation. The server
  stores a hash, so the plaintext exists exactly once, in that response. If the
  user closes the panel without copying it, the key is unusable and their only
  option is to make another — so the reveal is loud, has its own copy button, and
  does not disappear on its own.
*/

/** Unix seconds → something a person reads. */
function when(seconds: number | null): string {
  if (!seconds) return "never";
  const date = new Date(seconds * 1000);
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;
  return date.toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

function expiry(seconds: number | null): string | null {
  if (!seconds) return null;
  const days = Math.ceil((seconds * 1000 - Date.now()) / 86_400_000);
  if (days <= 0) return "expired";
  return `expires in ${days} day${days === 1 ? "" : "s"}`;
}

/** Copy button that says it worked, because a clipboard write is invisible. */
function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 2000);
        } catch {
          // Clipboard access can be refused (insecure origin, permissions). The
          // text is on screen and selectable either way, so this is not fatal.
        }
      }}
      className="flex shrink-0 items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs font-medium transition-colors hover:bg-accent"
    >
      {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : label}
    </button>
  );
}

export default function Connections() {
  const { success, error: errorToast } = useToast();

  const [keys, setKeys] = useState<ApiKey[] | null>(null);
  const [max, setMax] = useState(10);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [scope, setScope] = useState<ApiKeyScope>("write");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  /** The plaintext key, held only until the user dismisses it. */
  const [fresh, setFresh] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<ApiKey | null>(null);

  /*
    Which shell to write the command for. Guessed from the platform because the
    guess is right most of the time, and switchable because it is only a guess —
    plenty of Windows users are in PowerShell or WSL, where the POSIX form is
    the correct one.
  */
  const [shell, setShell] = useState<"posix" | "cmd">(() =>
    typeof navigator !== "undefined" && /Windows/i.test(navigator.userAgent) ? "cmd" : "posix",
  );

  useEffect(() => {
    let cancelled = false;
    api
      .listApiKeys()
      .then((res) => {
        if (cancelled) return;
        setKeys(res.keys);
        setMax(res.max);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof ApiError ? err.message : "Could not load your keys.");
          setKeys([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || creating) return;
    setCreating(true);
    setCreateError(null);
    try {
      const res = await api.createApiKey({ name: name.trim(), scope });
      setKeys((prev) => [res.key, ...(prev ?? [])]);
      setFresh(res.token);
      setName("");
    } catch (err) {
      setCreateError(err instanceof ApiError ? err.message : "Could not create the key.");
    } finally {
      setCreating(false);
    }
  }

  async function onRevoke(key: ApiKey) {
    try {
      await api.revokeApiKey(key.id);
      setKeys((prev) => (prev ?? []).filter((k) => k.id !== key.id));
      success("Key revoked", `"${key.name}" stopped working immediately.`);
    } catch (err) {
      errorToast("Could not revoke", err instanceof ApiError ? err.message : "Try again.");
    } finally {
      setRevoking(null);
    }
  }

  const atCap = (keys?.length ?? 0) >= max;

  /* The command someone actually pastes. Uses the fresh key when there is one on
     screen, and an obvious placeholder otherwise — never a real key from the
     list, because we do not have those any more.

     Two forms, because one line cannot serve both shells. cmd.exe does not treat
     ' as a quote character at all, so the POSIX form arrives at OpenClaw with
     the quotes still attached and is rejected as "not a JSON object" — which is
     a baffling error to get when you pasted exactly what you were given.
     PowerShell handles the POSIX form fine, so this is a two-way split rather
     than a three-way one. */
  const config = JSON.stringify({
    url: MCP_URL,
    transport: "streamable-http",
    headers: { Authorization: `Bearer ${fresh ?? "YOUR_KEY_HERE"}` },
  });
  const setupCommand =
    shell === "cmd"
      ? `openclaw mcp set myx "${config.replaceAll('"', '\\"')}"`
      : `openclaw mcp set myx '${config}'`;

  return (
    <section className="rounded-2xl border border-border/60 p-6">
      <div className="flex items-center gap-2">
        <Plug className="h-5 w-5 text-primary" />
        <h2 className="text-lg font-semibold">Connections</h2>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        Let an AI assistant use MyX for you — "what's due today", "log ₹400 on groceries", "make a
        note of this". MyX speaks{" "}
        <span className="font-medium text-foreground">MCP</span>, so OpenClaw, Claude and anything
        else that speaks it can connect with a key from here.
      </p>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
        A key reaches your data, and only your data. It cannot change your password, sign you out,
        delete your account, or create more keys — those stay behind your actual sign-in.
      </p>

      {/* ---- the freshly minted key ---- */}
      {fresh && (
        <div className="mt-6 rounded-xl border border-amber-500/40 bg-amber-500/5 p-4">
          <div className="flex items-center gap-2">
            <TriangleAlert className="h-4 w-4 text-amber-400" />
            <h3 className="text-sm font-semibold">Copy this now — it is not shown again</h3>
          </div>
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            MyX stores only a fingerprint of this key, so it cannot be looked up later. If you lose
            it, revoke it and make another.
          </p>
          <div className="mt-3 flex items-center gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-lg border border-border/60 bg-background px-3 py-2 font-mono text-xs">
              {fresh}
            </code>
            <CopyButton value={fresh} />
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs font-medium">Connect OpenClaw with one command:</p>
            <div className="flex items-center gap-1 rounded-lg border border-border/60 p-0.5">
              {(
                [
                  { value: "posix" as const, label: "macOS / Linux / PowerShell" },
                  { value: "cmd" as const, label: "Windows CMD" },
                ]
              ).map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setShell(option.value)}
                  className={`rounded-md px-2 py-1 text-[11px] font-medium transition-colors ${
                    shell === option.value
                      ? "bg-accent text-foreground"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {option.label}
                </button>
              ))}
            </div>
          </div>
          <div className="mt-2 flex items-start gap-2">
            <code className="min-w-0 flex-1 overflow-x-auto whitespace-pre rounded-lg border border-border/60 bg-background px-3 py-2 font-mono text-[11px] leading-relaxed">
              {setupCommand}
            </code>
            <CopyButton value={setupCommand} label="Copy" />
          </div>

          <Button variant="outline" className="mt-4" onClick={() => setFresh(null)}>
            I have copied it
          </Button>
        </div>
      )}

      {/* ---- create ---- */}
      <form onSubmit={onCreate} className="mt-6 space-y-4">
        <div>
          <label htmlFor="key-name" className="text-sm font-medium">
            Name this key
          </label>
          <input
            id="key-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="OpenClaw on my laptop"
            maxLength={60}
            disabled={atCap}
            className="mt-1.5 w-full rounded-lg border border-input bg-transparent px-3 py-2.5 outline-none focus:border-ring disabled:opacity-50"
          />
          <p className="mt-1.5 text-xs text-muted-foreground">
            Name it after where it lives, so you know which one to revoke later.
          </p>
        </div>

        <fieldset disabled={atCap} className="disabled:opacity-50">
          <legend className="text-sm font-medium">What it may do</legend>
          <div className="mt-2 grid gap-2 sm:grid-cols-2">
            {(
              [
                {
                  value: "write" as const,
                  title: "Read and write",
                  detail: "Add transactions, tasks and notes as well as read them.",
                },
                {
                  value: "read" as const,
                  title: "Read only",
                  detail: "Can see everything, can change nothing.",
                },
              ]
            ).map((option) => (
              <label
                key={option.value}
                className={`cursor-pointer rounded-xl border p-3 transition-colors ${
                  scope === option.value
                    ? "border-primary bg-primary/5"
                    : "border-border/60 hover:bg-accent"
                }`}
              >
                <div className="flex items-center gap-2">
                  <input
                    type="radio"
                    name="scope"
                    value={option.value}
                    checked={scope === option.value}
                    onChange={() => setScope(option.value)}
                    className="accent-primary"
                  />
                  <span className="text-sm font-medium">{option.title}</span>
                </div>
                <p className="mt-1 pl-6 text-xs text-muted-foreground">{option.detail}</p>
              </label>
            ))}
          </div>
        </fieldset>

        {createError && <p className="text-xs text-destructive">{createError}</p>}
        {atCap && (
          <p className="text-xs text-muted-foreground">
            You have all {max} keys. Revoke one to create another.
          </p>
        )}

        <Button type="submit" disabled={!name.trim() || creating || atCap}>
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
          Create key
        </Button>
      </form>

      {/* ---- the list ---- */}
      <div className="mt-6 border-t border-border/60 pt-6">
        <h3 className="text-sm font-medium">Your keys</h3>

        {keys === null && (
          <p className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading…
          </p>
        )}
        {loadError && <p className="mt-3 text-xs text-destructive">{loadError}</p>}

        {keys?.length === 0 && !loadError && (
          <p className="mt-3 text-xs text-muted-foreground">
            No keys yet. Nothing outside MyX can reach your data.
          </p>
        )}

        <ul className="mt-3 space-y-2">
          {(keys ?? []).map((key) => (
            <li
              key={key.id}
              className="flex flex-wrap items-center gap-3 rounded-xl border border-border/60 p-3"
            >
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-medium">{key.name}</span>
                  {key.scope === "read" && (
                    <span className="flex items-center gap-1 rounded-full border border-border/60 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                      <ShieldCheck className="h-3 w-3" />
                      read only
                    </span>
                  )}
                </div>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">{key.prefix}…</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Created {when(key.created_at)} · last used {when(key.last_used_at)}
                  {expiry(key.expires_at) ? ` · ${expiry(key.expires_at)}` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setRevoking(key)}
                aria-label={`Revoke ${key.name}`}
                className="flex items-center gap-1.5 rounded-lg border border-border/60 px-2.5 py-1.5 text-xs font-medium text-destructive transition-colors hover:bg-destructive/10"
              >
                <Trash2 className="h-3.5 w-3.5" />
                Revoke
              </button>
            </li>
          ))}
        </ul>
      </div>

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => !open && setRevoking(null)}
        title={`Revoke "${revoking?.name}"?`}
        description="Whatever is using this key stops working immediately. Your data is untouched, and you can make a new key any time."
        confirmLabel="Revoke"
        onConfirm={async () => {
          if (revoking) await onRevoke(revoking);
        }}
      />
    </section>
  );
}
