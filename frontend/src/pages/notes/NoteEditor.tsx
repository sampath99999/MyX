import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { marked } from "marked";
import DOMPurify from "dompurify";
import {
  ArrowLeft,
  Pin,
  PinOff,
  Trash2,
  RotateCcw,
  Loader2,
  Pencil,
  Eye,
  Hash,
  X,
  Check,
  AlertTriangle,
} from "lucide-react";
import { Textarea } from "@/components/ui/textarea";
import LoadError from "@/components/LoadError";
import { api, ApiError, requestKeepalive, type Note } from "@/lib/api";
import { useNotesContext, timeAgo } from "./context";
import { cn } from "@/lib/utils";

marked.setOptions({ gfm: true, breaks: true });

// marked does NOT sanitize — its `sanitize` option was removed in v5 — so its
// output is attacker-controlled HTML the moment a note contains pasted markup.
// Everything rendered into the preview goes through DOMPurify first.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  // Anything that opens a new tab needs these, or the target page gets a
  // window.opener handle back into this origin.
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer nofollow");
  }
});

/** Render note markdown to HTML that is safe to inject. */
export function renderMarkdown(md: string): string {
  return DOMPurify.sanitize(marked.parse(md, { async: false }) as string, {
    // Allow: an explicit safe scheme, any string with no colon at all (which
    // therefore cannot carry a scheme, i.e. a relative link), or an anchor /
    // absolute path / query. Everything else — javascript:, data:, vbscript: —
    // is dropped. DOMPurify decodes entities before this runs, so obfuscated
    // forms like `&#106;avascript:` are matched as `javascript:`.
    ALLOWED_URI_REGEXP: /^(?:https?|mailto|tel|ftp):|^[^:]*$|^[#/?]/i,
    FORBID_TAGS: ["style", "form", "input", "button", "iframe", "object", "embed"],
    FORBID_ATTR: ["style", "srcset", "formaction"],
  });
}

const COLORS: (string | null)[] = [null, "#ef4444", "#f59e0b", "#10b981", "#3b82f6", "#8b5cf6", "#ec4899"];

export default function NoteEditor() {
  const { id } = useParams();
  const noteId = Number(id);
  const navigate = useNavigate();
  const ctx = useNotesContext();

  const [note, setNote] = useState<Note | null>(null);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [tab, setTab] = useState<"write" | "preview">("write");
  const [tagInput, setTagInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"idle" | "saving" | "saved" | "error">("idle");

  const latest = useRef({ title: "", content: "" });
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** True whenever `latest` holds edits the server has not acknowledged. */
  const dirty = useRef(false);

  // ctx is rebuilt on every parent render, so holding it in a ref keeps the save
  // callbacks stable instead of re-creating (and re-scheduling) them constantly.
  const reloadMetaRef = useRef(ctx.reloadMeta);
  reloadMetaRef.current = ctx.reloadMeta;

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const { note } = await api.getNote(noteId);
      setNote(note);
      setTitle(note.title);
      setContent(note.content);
      latest.current = { title: note.title, content: note.content };
      dirty.current = false;
    } catch (err) {
      setLoadError(err instanceof ApiError ? err.message : "Could not open this note.");
    } finally {
      setLoading(false);
    }
  }, [noteId]);

  useEffect(() => {
    load();
  }, [load]);

  /** Write pending edits now. Safe to call when nothing is dirty. */
  const flush = useCallback(async () => {
    if (!dirty.current) return;
    if (saveTimer.current) {
      clearTimeout(saveTimer.current);
      saveTimer.current = null;
    }
    const payload = { title: latest.current.title, content: latest.current.content };
    // Cleared up front so edits made *during* the request stay marked dirty.
    dirty.current = false;
    try {
      const { note } = await api.updateNote(noteId, payload);
      setNote(note);
      setSaveState("saved");
      reloadMetaRef.current();
    } catch {
      // Put the work back so the next keystroke, flush, or Retry picks it up
      // rather than dropping the edit on the floor.
      dirty.current = true;
      setSaveState("error");
    }
  }, [noteId]);

  // Debounced autosave of title/content.
  const scheduleSave = useCallback(() => {
    dirty.current = true;
    setSaveState("saving");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => {
      saveTimer.current = null;
      void flush();
    }, 700);
  }, [flush]);

  // Leaving the editor must not discard a pending save. The previous cleanup
  // called clearTimeout and stopped there, so anything typed inside the 700ms
  // debounce window was silently lost on navigate-away.
  useEffect(() => {
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
      // Unmount is an SPA navigation: the document is still alive, so a normal
      // request completes. State setters after unmount are no-ops in React 19.
      if (dirty.current) void flush();
    };
  }, [flush]);

  // Tab close / app backgrounding never unmounts, so it needs its own hook, and
  // it needs keepalive because the document is being torn down.
  useEffect(() => {
    const flushOnExit = () => {
      if (!dirty.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      dirty.current = false;
      requestKeepalive(`/api/notes/${noteId}`, {
        title: latest.current.title,
        content: latest.current.content,
      });
    };
    // pagehide is the reliable one on iOS Safari, where beforeunload often
    // never fires — and this app is meant to be used from a phone.
    window.addEventListener("pagehide", flushOnExit);
    window.addEventListener("beforeunload", flushOnExit);
    return () => {
      window.removeEventListener("pagehide", flushOnExit);
      window.removeEventListener("beforeunload", flushOnExit);
    };
  }, [noteId]);

  function onTitle(v: string) {
    setTitle(v);
    latest.current.title = v;
    scheduleSave();
  }
  function onContent(v: string) {
    setContent(v);
    latest.current.content = v;
    scheduleSave();
  }

  async function patch(body: Parameters<typeof api.updateNote>[1]) {
    try {
      const { note } = await api.updateNote(noteId, body);
      setNote(note);
      ctx.reloadMeta();
    } catch {
      setSaveState("error");
    }
  }

  function addTag(raw: string) {
    const t = raw.trim().replace(/^#/, "");
    if (!t || !note) return;
    if (note.tags.some((x) => x.toLowerCase() === t.toLowerCase())) {
      setTagInput("");
      return;
    }
    patch({ tags: [...note.tags, t] });
    setTagInput("");
  }
  function removeTag(t: string) {
    if (!note) return;
    patch({ tags: note.tags.filter((x) => x !== t) });
  }

  async function del() {
    if (!confirm("Delete this note permanently?")) return;
    await api.deleteNote(noteId);
    ctx.reloadMeta();
    navigate("/notes");
  }

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (loadError || !note) {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <LoadError message={loadError ?? "Note not found."} onRetry={load} />
        <button
          onClick={() => navigate("/notes")}
          className="mt-4 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" /> Back to Notes
        </button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl p-4 lg:p-6">
      {/* Toolbar */}
      <div className="mb-4 flex items-center justify-between gap-2">
        <button onClick={() => navigate("/notes")} className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="h-4 w-4" /> Notes
        </button>
        <div className="flex items-center gap-1.5">
          {saveState === "error" ? (
            <button
              onClick={() => void flush()}
              className="mr-1 inline-flex items-center gap-1 text-xs font-medium text-destructive hover:underline"
              title="Your changes are still here — retry saving"
            >
              <AlertTriangle className="h-3.5 w-3.5" /> Not saved · Retry
            </button>
          ) : (
            <span className="mr-1 text-xs text-muted-foreground">
              {saveState === "saving" ? "Saving…" : saveState === "saved" ? "Saved" : `Edited ${timeAgo(note.updated_at)}`}
            </span>
          )}

          {/* Write / Preview toggle */}
          <div className="flex rounded-lg border border-border/60 p-0.5">
            <button onClick={() => setTab("write")} className={cn("rounded-md px-2 py-1", tab === "write" ? "bg-primary/15 text-foreground" : "text-muted-foreground")} title="Write">
              <Pencil className="h-4 w-4" />
            </button>
            <button onClick={() => setTab("preview")} className={cn("rounded-md px-2 py-1", tab === "preview" ? "bg-primary/15 text-foreground" : "text-muted-foreground")} title="Preview">
              <Eye className="h-4 w-4" />
            </button>
          </div>

          <button onClick={() => patch({ pinned: !note.pinned })} className={cn("rounded-md p-1.5 hover:bg-accent", note.pinned ? "text-primary" : "text-muted-foreground")} title={note.pinned ? "Unpin" : "Pin"}>
            {note.pinned ? <Pin className="h-4 w-4" /> : <PinOff className="h-4 w-4" />}
          </button>

          {note.archived ? (
            <>
              <button onClick={() => patch({ archived: false })} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground" title="Restore">
                <RotateCcw className="h-4 w-4" />
              </button>
              <button onClick={del} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive" title="Delete forever">
                <Trash2 className="h-4 w-4" />
              </button>
            </>
          ) : (
            <button onClick={() => patch({ archived: true }).then(() => navigate("/notes"))} className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive" title="Move to Trash">
              <Trash2 className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Meta row: folder + color */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select
          value={note.folder_id ?? ""}
          onChange={(e) => patch({ folder_id: e.target.value ? Number(e.target.value) : null })}
          className="h-8 rounded-lg border border-border bg-input/40 px-2 text-sm text-muted-foreground outline-none focus:border-primary/50"
        >
          <option value="">No notebook</option>
          {ctx.folders.map((f) => (
            <option key={f.id} value={f.id}>{f.name}</option>
          ))}
        </select>
        <div className="flex items-center gap-1">
          {COLORS.map((c, i) => (
            <button
              key={i}
              onClick={() => patch({ color: c })}
              className={cn("flex h-5 w-5 items-center justify-center rounded-full border", (note.color ?? null) === c && "ring-2 ring-offset-1 ring-offset-background ring-primary")}
              style={{ backgroundColor: c ?? "transparent", borderColor: c ?? "var(--border)" }}
              title={c ?? "No color"}
            >
              {c === null && <X className="h-3 w-3 text-muted-foreground" />}
            </button>
          ))}
        </div>
      </div>

      {/* Title */}
      <input
        value={title}
        onChange={(e) => onTitle(e.target.value)}
        placeholder="Title"
        className="w-full bg-transparent text-2xl font-bold tracking-tight outline-none placeholder:text-muted-foreground/40"
      />

      {/* Tags */}
      <div className="mt-3 flex flex-wrap items-center gap-1.5">
        {note.tags.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
            <Hash className="h-3 w-3" />
            {t}
            <button onClick={() => removeTag(t)} className="hover:text-foreground"><X className="h-3 w-3" /></button>
          </span>
        ))}
        <div className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5">
          <Hash className="h-3 w-3 text-muted-foreground" />
          <input
            value={tagInput}
            onChange={(e) => setTagInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === ",") {
                e.preventDefault();
                addTag(tagInput);
              }
            }}
            onBlur={() => tagInput && addTag(tagInput)}
            placeholder="add tag"
            className="w-20 bg-transparent text-xs outline-none placeholder:text-muted-foreground/50"
          />
        </div>
      </div>

      {/* Body */}
      <div className="mt-4">
        {tab === "write" ? (
          <Textarea
            value={content}
            onChange={(e) => onContent(e.target.value)}
            placeholder="Start writing…  (Markdown supported: # heading, **bold**, - list, > quote, `code`)"
            className="min-h-[55vh] border-none bg-transparent px-0 text-base leading-relaxed shadow-none focus-visible:ring-0"
          />
        ) : content.trim() ? (
          <div className="md min-h-[55vh]" dangerouslySetInnerHTML={{ __html: renderMarkdown(content) }} />
        ) : (
          <p className="py-10 text-center text-sm text-muted-foreground">Nothing to preview yet.</p>
        )}
      </div>

      {saveState === "saved" && (
        <div className="pointer-events-none fixed bottom-6 right-6 flex items-center gap-1.5 rounded-full bg-card/90 px-3 py-1.5 text-xs text-muted-foreground shadow-lg backdrop-blur">
          <Check className="h-3.5 w-3.5 text-emerald-400" /> Saved
        </div>
      )}
    </div>
  );
}
