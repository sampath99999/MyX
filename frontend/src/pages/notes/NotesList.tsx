import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, Search, Loader2, Pin, StickyNote, Trash2, Hash } from "lucide-react";
import { SkeletonRows } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api, type NoteListItem } from "@/lib/api";
import { useNotesContext, timeAgo } from "./context";
import { cn } from "@/lib/utils";

export default function NotesList() {
  const ctx = useNotesContext();
  const navigate = useNavigate();
  const [notes, setNotes] = useState<NoteListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const { notes } = await api.listNotes({
      folder_id: ctx.folderId ?? undefined,
      view: ctx.view === "all" ? undefined : ctx.view,
      tag: ctx.tag ?? undefined,
      q: q.trim() || undefined,
    });
    setNotes(notes);
    setLoading(false);
  }, [ctx.folderId, ctx.view, ctx.tag, q]);

  useEffect(() => {
    setLoading(true);
    const t = setTimeout(load, q ? 250 : 0); // debounce search
    return () => clearTimeout(t);
  }, [load, q]);

  const heading = useMemo(() => {
    if (ctx.view === "trash") return { icon: Trash2, label: "Trash" };
    if (ctx.view === "pinned") return { icon: Pin, label: "Pinned" };
    if (ctx.tag) return { icon: Hash, label: ctx.tag };
    if (ctx.folderId) {
      const f = ctx.folders.find((x) => x.id === ctx.folderId);
      return { icon: StickyNote, label: f?.name ?? "Notebook" };
    }
    return { icon: StickyNote, label: "All Notes" };
  }, [ctx.view, ctx.tag, ctx.folderId, ctx.folders]);

  async function newNote() {
    setCreating(true);
    try {
      const { note } = await api.createNote({
        title: "",
        content: "",
        folder_id: ctx.folderId ?? undefined,
        tags: ctx.tag ? [ctx.tag] : [],
      });
      ctx.reloadMeta();
      navigate(`/notes/${note.id}`);
    } finally {
      setCreating(false);
    }
  }

  const HeadingIcon = heading.icon;

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <HeadingIcon className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">{heading.label}</h1>
          <span className="text-sm text-muted-foreground">{notes.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
            <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search notes…" className="h-9 w-44 pl-9 sm:w-56" />
          </div>
          {ctx.view !== "trash" && (
            <Button size="sm" onClick={newNote} disabled={creating}>
              {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
              New note
            </Button>
          )}
        </div>
      </div>

      {/*
        A skeleton rather than a spinner. Every other list in the app draws the
        shape of what is coming; this one span 20px of nothing in the middle of
        an empty column, which reads as "stuck" rather than "loading".
      */}
      {loading ? (
        <SkeletonRows count={5} />
      ) : notes.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <StickyNote className="h-7 w-7 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground max-w-xs">
            {ctx.view === "trash"
              ? "Trash is empty."
              : q
                ? "No notes match your search."
                : "No notes here yet. Create your first note."}
          </p>
          {ctx.view !== "trash" && !q && (
            <Button size="sm" variant="secondary" onClick={newNote}>
              <Plus className="h-4 w-4" /> New note
            </Button>
          )}
        </div>
      ) : (
        <div className="columns-1 gap-4 sm:columns-2 xl:columns-3 2xl:columns-4">
          {notes.map((n) => (
            <button
              key={n.id}
              onClick={() => navigate(`/notes/${n.id}`)}
              className="glass mb-4 block w-full break-inside-avoid rounded-xl border border-border/60 p-4 text-left transition-all hover:-translate-y-0.5 hover:border-border"
              style={n.color ? { borderColor: `${n.color}55` } : undefined}
            >
              <div className="flex items-start justify-between gap-2">
                <h3 className="font-semibold leading-snug">
                  {n.title || <span className="text-muted-foreground">Untitled</span>}
                </h3>
                {n.pinned && <Pin className="h-3.5 w-3.5 shrink-0 text-primary" />}
              </div>
              {n.snippet && <p className="mt-1.5 line-clamp-5 text-sm text-muted-foreground">{n.snippet}</p>}
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {n.tags.slice(0, 4).map((t) => (
                  <span key={t} className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                    #{t}
                  </span>
                ))}
              </div>
              <div className={cn("mt-2 text-[11px] text-muted-foreground/70", (n.tags.length || n.snippet) && "border-t border-border/40 pt-2")}>
                {timeAgo(n.updated_at)}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
