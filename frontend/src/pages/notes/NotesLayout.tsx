import { useCallback, useEffect, useState } from "react";
import { Outlet, useNavigate } from "react-router-dom";
import { LogOut, StickyNote, Pin, Trash2, Folder as FolderIcon, Plus, Loader2, Hash } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api, type Folder } from "@/lib/api";
import NewFolderDialog from "@/components/notes/NewFolderDialog";
import type { NotesContextValue, NotesView } from "./context";
import { cn } from "@/lib/utils";

export default function NotesLayout() {
  const { logout } = useAuth();
  const navigate = useNavigate();

  const [folders, setFolders] = useState<Folder[]>([]);
  const [tags, setTags] = useState<string[]>([]);
  const [folderId, setFolderId] = useState<number | null>(null);
  const [view, setView] = useState<NotesView>("all");
  const [tag, setTag] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const reloadMeta = useCallback(async () => {
    const [f, t] = await Promise.all([api.listFolders(), api.listNoteTags()]);
    setFolders(f.folders);
    setTags(t.tags);
    setReady(true);
  }, []);

  useEffect(() => {
    reloadMeta().catch(() => setReady(true));
  }, [reloadMeta]);

  function selectView(v: NotesView) {
    setView(v);
    setFolderId(null);
    setTag(null);
    navigate("/notes");
  }
  function selectFolder(id: number) {
    setView("all");
    setFolderId(id);
    setTag(null);
    navigate("/notes");
  }
  function selectTag(t: string) {
    setView("all");
    setFolderId(null);
    setTag(t);
    navigate("/notes");
  }

  const ctx: NotesContextValue = { folderId, view, tag, folders, tags, reloadMeta };

  const isAll = view === "all" && folderId == null && tag == null;
  const views: { key: NotesView; label: string; icon: typeof Pin; active: boolean }[] = [
    { key: "all", label: "All Notes", icon: StickyNote, active: isAll },
    { key: "pinned", label: "Pinned", icon: Pin, active: view === "pinned" },
    { key: "trash", label: "Trash", icon: Trash2, active: view === "trash" },
  ];

  return (
    <div className="flex min-h-full">
      <aside className="hidden md:flex md:w-60 shrink-0 flex-col gap-4 border-r border-border/50 p-4 sticky top-0 self-start max-h-dvh overflow-y-auto">
        <nav className="flex flex-col gap-0.5">
          {views.map((v) => (
            <button
              key={v.key}
              onClick={() => selectView(v.key)}
              className={cn(
                "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                v.active ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              <v.icon className="h-4 w-4" />
              {v.label}
            </button>
          ))}
        </nav>

        <div>
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Notebooks</span>
            <NewFolderDialog
              onCreated={reloadMeta}
              trigger={
                <button className="text-muted-foreground hover:text-foreground" title="New notebook">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              }
            />
          </div>
          <div className="flex flex-col gap-0.5">
            {folders.length === 0 ? (
              <p className="px-2.5 py-1.5 text-xs text-muted-foreground/70">No notebooks yet.</p>
            ) : (
              folders.map((f) => (
                <button
                  key={f.id}
                  onClick={() => selectFolder(f.id)}
                  className={cn(
                    "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                    folderId === f.id ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                  )}
                >
                  <FolderIcon className="h-4 w-4" style={{ color: f.color }} />
                  <span className="flex-1 truncate text-left">{f.name}</span>
                  {f.note_count > 0 && <span className="text-[10px] font-semibold text-muted-foreground">{f.note_count}</span>}
                </button>
              ))
            )}
          </div>
        </div>

        {tags.length > 0 && (
          <div>
            <div className="mb-1.5 px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tags</div>
            <div className="flex flex-wrap gap-1.5">
              {tags.map((t) => (
                <button
                  key={t}
                  onClick={() => selectTag(t)}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-colors",
                    tag === t ? "border-primary/40 bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  <Hash className="h-3 w-3" />
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}
      </aside>

      <div className="flex-1 min-w-0">
        {/* Mobile top bar */}
        <div className="flex items-center justify-between gap-2 border-b border-border/50 glass px-4 py-3 md:hidden">
          <div className="flex items-center gap-1.5 overflow-x-auto">
            {views.map((v) => (
              <button
                key={v.key}
                onClick={() => selectView(v.key)}
                className={cn("shrink-0 rounded-lg border px-2.5 py-1.5 text-sm", v.active ? "border-primary/40 bg-primary/15" : "border-border text-muted-foreground")}
              >
                {v.label}
              </button>
            ))}
          </div>
          <button onClick={logout} className="shrink-0 text-muted-foreground" title="Sign out">
            <LogOut className="h-5 w-5" />
          </button>
        </div>

        {!ready ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <Outlet context={ctx} />
        )}
      </div>
    </div>
  );
}
