import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  Search,
  Loader2,
  ArrowRight,
  Wallet,
  CheckCircle2,
  StickyNote,
  Brain,
  ListChecks,
  Landmark,
  Target,
  TrendingUp,
  Repeat,
  FolderKanban,
  CornerDownLeft,
} from "lucide-react";
import { api, formatMoney, type SearchHit } from "@/lib/api";

/*
  Search across everything, on ⌘K.

  Each module could already filter its own list and none of them could see each
  other, so finding something meant knowing which screen it lived on first. This
  is the one place that does not need to know.

  It also doubles as navigation: with the field empty it lists the modules, so
  the shortcut is useful before you have typed anything.
*/

const KINDS: Record<
  SearchHit["kind"],
  { label: string; icon: typeof Wallet; to: (hit: SearchHit) => string }
> = {
  // Opens the row itself, not just the list it lives in — finding a transaction
  // and then having to hunt for it again would defeat the search.
  transaction: { label: "Transaction", icon: Wallet, to: (h) => `/money/transactions/${h.id}` },
  task: { label: "Task", icon: CheckCircle2, to: () => "/tasks" },
  note: { label: "Note", icon: StickyNote, to: (h) => `/notes/${h.id}` },
  memory: { label: "Memory", icon: Brain, to: () => "/memories" },
  checklist: { label: "Checklist", icon: ListChecks, to: (h) => `/checklists/${h.id}` },
  loan: { label: "Loan", icon: Landmark, to: () => "/money/loans" },
  goal: { label: "Goal", icon: Target, to: () => "/money/goals" },
  investment: { label: "Investment", icon: TrendingUp, to: () => "/money/investments" },
  recurring: { label: "Bill", icon: Repeat, to: () => "/money/recurring" },
  project: { label: "Project", icon: FolderKanban, to: (h) => `/tasks/project/${h.id}` },
};

const JUMP_TO = [
  { label: "Dashboard", to: "/dashboard", icon: ArrowRight },
  { label: "Money", to: "/money", icon: Wallet },
  { label: "Tasks", to: "/tasks", icon: CheckCircle2 },
  { label: "Notes", to: "/notes", icon: StickyNote },
  { label: "Memories", to: "/memories", icon: Brain },
  { label: "Checklists", to: "/checklists", icon: ListChecks },
];

export default function CommandPalette({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<SearchHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);

  const showingJumps = query.trim().length < 2;
  const rows = useMemo(
    () =>
      showingJumps
        ? JUMP_TO.map((j) => ({ key: j.to, to: j.to }))
        : hits.map((h) => ({ key: `${h.kind}:${h.id}`, to: KINDS[h.kind].to(h) })),
    [showingJumps, hits],
  );

  const go = useCallback(
    (to: string) => {
      onClose();
      navigate(to);
    },
    [navigate, onClose],
  );

  // Reset on every open: reopening onto a stale result list from ten minutes ago
  // is confusing, and the request to refill it is cheap.
  useEffect(() => {
    if (!open) return;
    setQuery("");
    setHits([]);
    setActive(0);
    // The dialog has to exist before it can take focus.
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, [open]);

  /*
    Debounced, and guarded against out-of-order responses: typing "loan" fires
    for "lo" and "loan", and if the first reply arrives second the user sees
    results for a query they have already finished typing.
  */
  useEffect(() => {
    if (!open) return;
    const q = query.trim();
    if (q.length < 2) {
      setHits([]);
      setLoading(false);
      return;
    }

    let current = true;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const res = await api.search(q);
        if (current) setHits(res.results);
      } catch {
        if (current) setHits([]);
      } finally {
        if (current) setLoading(false);
      }
    }, 180);

    return () => {
      current = false;
      clearTimeout(timer);
    };
  }, [query, open]);

  useEffect(() => setActive(0), [hits, showingJumps]);

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      e.preventDefault();
      onClose();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setActive((i) => (rows.length ? (i + 1) % rows.length : 0));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActive((i) => (rows.length ? (i - 1 + rows.length) % rows.length : 0));
    } else if (e.key === "Enter" && rows[active]) {
      e.preventDefault();
      go(rows[active].to);
    }
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-[12vh] backdrop-blur-sm"
      onMouseDown={onClose}
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Search MyX"
        // Clicks inside must not reach the backdrop's close handler.
        onMouseDown={(e) => e.stopPropagation()}
        onKeyDown={onKeyDown}
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-border/60 bg-popover shadow-2xl"
      >
        <div className="flex items-center gap-3 border-b border-border/60 px-4">
          <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search transactions, tasks, notes, loans…"
            className="w-full bg-transparent py-4 text-sm outline-none placeholder:text-muted-foreground"
          />
          {loading && <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />}
        </div>

        <div className="max-h-[52vh] overflow-y-auto p-2">
          {showingJumps ? (
            <>
              <p className="px-3 py-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Jump to
              </p>
              {JUMP_TO.map((item, i) => (
                <button
                  key={item.to}
                  onClick={() => go(item.to)}
                  onMouseMove={() => setActive(i)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm ${
                    active === i ? "bg-accent text-accent-foreground" : ""
                  }`}
                >
                  <item.icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  {item.label}
                </button>
              ))}
            </>
          ) : hits.length === 0 ? (
            <p className="px-3 py-8 text-center text-sm text-muted-foreground">
              {loading ? "Searching…" : `Nothing matches “${query.trim()}”.`}
            </p>
          ) : (
            hits.map((hit, i) => {
              const meta = KINDS[hit.kind];
              const Icon = meta.icon;
              return (
                <button
                  key={`${hit.kind}:${hit.id}`}
                  onClick={() => go(meta.to(hit))}
                  onMouseMove={() => setActive(i)}
                  className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${
                    active === i ? "bg-accent text-accent-foreground" : ""
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm">{hit.title}</span>
                    {hit.subtitle && (
                      <span className="block truncate text-xs text-muted-foreground">
                        {hit.subtitle}
                      </span>
                    )}
                  </span>
                  <span className="shrink-0 text-right">
                    {hit.amount != null && (
                      <span className="block text-sm tabular-nums">{formatMoney(hit.amount)}</span>
                    )}
                    <span className="block text-[11px] text-muted-foreground">{meta.label}</span>
                  </span>
                </button>
              );
            })
          )}
        </div>

        <div className="flex items-center gap-4 border-t border-border/60 px-4 py-2 text-[11px] text-muted-foreground">
          <span className="flex items-center gap-1">
            <CornerDownLeft className="h-3 w-3" /> open
          </span>
          <span>↑↓ move</span>
          <span>esc close</span>
        </div>
      </div>
    </div>
  );
}
