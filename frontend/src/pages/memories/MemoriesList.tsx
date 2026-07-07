import { useCallback, useState } from "react";
import { Plus, Search, Loader2, Brain, Trash2, Hash } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card } from "@/components/ui/card";
import NewMemoryDialog from "@/components/NewMemoryDialog";
import LoadError from "@/components/LoadError";
import { api, type Memory } from "@/lib/api";
import { useAuthenticatedLoad } from "@/lib/useAuthenticatedLoad";

function formatDate(d: string) {
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function MemoriesList() {
  const [memories, setMemories] = useState<Memory[]>([]);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const [{ memories }, { tags }] = await Promise.all([
      api.listMemories({ tag: tag ?? undefined, q: q.trim() || undefined }),
      api.listMemoryTags(),
    ]);
    setMemories(memories);
    setTags(tags);
  }, [tag, q]);

  const { loading, error, reload } = useAuthenticatedLoad(load);

  async function onDelete(id: number) {
    if (!confirm("Delete this memory?")) return;
    setDeletingId(id);
    try {
      await api.deleteMemory(id);
      await reload();
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <div className="p-6 lg:p-8 space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Brain className="h-5 w-5 text-primary" />
          <h1 className="text-xl font-bold tracking-tight">Memories</h1>
          <span className="text-sm text-muted-foreground">{memories.length}</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground/60" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search memories…"
              className="h-9 w-44 pl-9 sm:w-56"
            />
          </div>
          <NewMemoryDialog
            onSaved={reload}
            trigger={
              <Button size="sm">
                <Plus className="h-4 w-4" />
                New memory
              </Button>
            }
          />
        </div>
      </div>

      {tags.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setTag(null)}
            className={`rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
              tag === null ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground hover:text-foreground"
            }`}
          >
            All
          </button>
          {tags.map((t) => (
            <button
              key={t}
              onClick={() => setTag(t === tag ? null : t)}
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium transition-colors ${
                tag === t ? "bg-primary/15 text-primary" : "bg-muted text-muted-foreground hover:text-foreground"
              }`}
            >
              <Hash className="h-3 w-3" />
              {t}
            </button>
          ))}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : error ? (
        <LoadError message={error} onRetry={reload} />
      ) : memories.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-20 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Brain className="h-7 w-7 text-primary" />
          </div>
          <p className="text-sm text-muted-foreground max-w-xs">
            {q || tag ? "No memories match your search." : "No memories yet. Save your first one."}
          </p>
          {!q && !tag && (
            <NewMemoryDialog
              onSaved={reload}
              trigger={
                <Button size="sm" variant="secondary">
                  <Plus className="h-4 w-4" /> New memory
                </Button>
              }
            />
          )}
        </div>
      ) : (
        <div className="columns-1 gap-4 sm:columns-2 xl:columns-3">
          {memories.map((m) => (
            <Card key={m.id} className="glass group relative mb-4 block w-full break-inside-avoid p-4">
              <button
                onClick={() => onDelete(m.id)}
                disabled={deletingId === m.id}
                title="Delete memory"
                className="absolute right-3 top-3 text-muted-foreground/40 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100 disabled:opacity-100"
              >
                {deletingId === m.id ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </button>

              <NewMemoryDialog
                memory={m}
                onSaved={reload}
                trigger={
                  <button className="block w-full text-left">
                    <div className="flex items-start gap-2 pr-6">
                      <span className="text-lg leading-none">{m.emoji || "✨"}</span>
                      <h3 className="font-semibold leading-snug">{m.title}</h3>
                    </div>
                    {m.note && <p className="mt-1.5 line-clamp-5 text-sm text-muted-foreground">{m.note}</p>}
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      {m.tags.slice(0, 4).map((t) => (
                        <span
                          key={t}
                          className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                        >
                          #{t}
                        </span>
                      ))}
                    </div>
                    <div className="mt-2 border-t border-border/40 pt-2 text-[11px] text-muted-foreground/70">
                      {m.occurred_on ? formatDate(m.occurred_on) : "No date"}
                    </div>
                  </button>
                }
              />
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
