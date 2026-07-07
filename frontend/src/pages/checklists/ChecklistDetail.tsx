import { useCallback, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Check, Loader2, Plus, RotateCcw, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import LoadError from "@/components/LoadError";
import { api, ApiError, type Checklist, type ChecklistItem } from "@/lib/api";
import { useAuthenticatedLoad } from "@/lib/useAuthenticatedLoad";
import { cn } from "@/lib/utils";

export default function ChecklistDetail() {
  const { id } = useParams();
  const checklistId = Number(id);
  const navigate = useNavigate();

  const [checklist, setChecklist] = useState<Checklist | null>(null);
  const [items, setItems] = useState<ChecklistItem[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busyItemId, setBusyItemId] = useState<number | null>(null);

  const load = useCallback(async () => {
    const { checklist, items } = await api.getChecklist(checklistId);
    setChecklist(checklist);
    setItems(items);
  }, [checklistId]);

  const { loading, error: loadError, reload } = useAuthenticatedLoad(load);

  const done = items.filter((i) => i.done).length;
  const percent = items.length > 0 ? Math.round((done / items.length) * 100) : 0;

  async function toggleItem(item: ChecklistItem) {
    setBusyItemId(item.id);
    setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, done: !i.done } : i)));
    try {
      await api.updateChecklistItem(checklistId, item.id, { done: !item.done });
    } finally {
      setBusyItemId(null);
    }
  }

  async function addItem(e: React.FormEvent) {
    e.preventDefault();
    const title = newTitle.trim();
    if (!title) return;
    setAdding(true);
    setError(null);
    try {
      const { item } = await api.addChecklistItem(checklistId, title);
      setItems((prev) => [...prev, item]);
      setNewTitle("");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Failed to add item.");
    } finally {
      setAdding(false);
    }
  }

  async function deleteItem(itemId: number) {
    setBusyItemId(itemId);
    try {
      await api.deleteChecklistItem(checklistId, itemId);
      setItems((prev) => prev.filter((i) => i.id !== itemId));
    } finally {
      setBusyItemId(null);
    }
  }

  async function reset() {
    await api.resetChecklist(checklistId);
    setItems((prev) => prev.map((i) => ({ ...i, done: false })));
  }

  async function del() {
    if (!confirm("Delete this checklist and all its items?")) return;
    await api.deleteChecklist(checklistId);
    navigate("/checklists");
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-32">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (loadError || !checklist) {
    return (
      <div className="p-6 lg:p-8">
        <LoadError message={loadError ?? "Checklist not found."} onRetry={reload} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl p-6 lg:p-8 space-y-6">
      <button
        onClick={() => navigate("/checklists")}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" /> Checklists
      </button>

      <Card className="glass p-6 animate-in-up">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-background/50 text-2xl">
              {checklist.emoji || "✅"}
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">{checklist.name}</h1>
              <p className="text-sm text-muted-foreground">
                {items.length === 0 ? "No items yet" : `${done}/${items.length} done`}
              </p>
            </div>
          </div>
          <div className="flex gap-1.5">
            <Button variant="secondary" size="sm" onClick={reset}>
              <RotateCcw className="h-4 w-4" />
              Reset
            </Button>
            <Button variant="ghost" size="sm" onClick={del} className="text-muted-foreground hover:text-destructive">
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {items.length > 0 && (
          <div className="mt-5 h-2 w-full overflow-hidden rounded-full bg-background/60">
            <div
              className={cn(
                "h-full rounded-full transition-all duration-500",
                percent === 100
                  ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                  : "bg-gradient-to-r from-primary to-violet-400",
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
        )}
      </Card>

      <Card className="glass p-2 animate-in-up">
        {items.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            No items yet — add the first step below.
          </p>
        ) : (
          <ul className="divide-y divide-border/40">
            {items.map((item) => (
              <li key={item.id} className="group flex items-center gap-3 px-3 py-2.5">
                <button
                  onClick={() => toggleItem(item)}
                  disabled={busyItemId === item.id}
                  className={cn(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors",
                    item.done
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border hover:border-primary/60",
                  )}
                >
                  {item.done && <Check className="h-3.5 w-3.5" />}
                </button>
                <span className={cn("flex-1 text-sm", item.done && "text-muted-foreground line-through")}>
                  {item.title}
                </span>
                <button
                  onClick={() => deleteItem(item.id)}
                  disabled={busyItemId === item.id}
                  className="text-muted-foreground/40 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
                >
                  <X className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}

        <form onSubmit={addItem} className="flex items-center gap-2 border-t border-border/40 p-2 pt-3">
          <Input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="Add an item…"
            className="h-9"
          />
          <Button type="submit" size="sm" disabled={adding || !newTitle.trim()}>
            {adding ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
          </Button>
        </form>
        {error && (
          <div className="mx-2 mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive">
            {error}
          </div>
        )}
      </Card>
    </div>
  );
}
