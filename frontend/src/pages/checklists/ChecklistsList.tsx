import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Plus, ListChecks, Trash2, Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import NewChecklistDialog from "@/components/checklists/NewChecklistDialog";
import LoadError from "@/components/LoadError";
import { api, type Checklist } from "@/lib/api";
import { useAuthenticatedLoad } from "@/lib/useAuthenticatedLoad";
import { useAddIntent } from "@/lib/addIntent";
import { cn } from "@/lib/utils";

export default function ChecklistsList() {
  const navigate = useNavigate();
  const [checklists, setChecklists] = useState<Checklist[]>([]);
  const [busyId, setBusyId] = useState<number | null>(null);
  /* Set when the Add menu navigated here asking for the form. */
  const [addOpen, setAddOpen] = useState(false);
  useAddIntent(() => setAddOpen(true));

  const load = useCallback(async () => {
    const { checklists } = await api.listChecklists();
    setChecklists(checklists);
  }, []);

  const { loading, error, reload } = useAuthenticatedLoad(load);

  async function onReset(e: React.MouseEvent, id: number) {
    e.stopPropagation();
    setBusyId(id);
    try {
      await api.resetChecklist(id);
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  async function onDelete(e: React.MouseEvent, id: number) {
    e.stopPropagation();
    if (!confirm("Delete this checklist?")) return;
    setBusyId(id);
    try {
      await api.deleteChecklist(id);
      await reload();
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="p-6 lg:p-8 space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Checklists</h2>
          <p className="text-sm text-muted-foreground">
            Reusable routines you tick off and reset — Before bed, Morning routine, Travel packing.
          </p>
        </div>
        <NewChecklistDialog
          onCreated={(c) => navigate(`/checklists/${c.id}`)}
          open={addOpen || undefined}
          onOpenChange={setAddOpen}
          trigger={
            <Button size="sm">
              <Plus className="h-4 w-4" />
              New checklist
            </Button>
          }
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : error ? (
        <LoadError message={error} onRetry={reload} />
      ) : checklists.length === 0 ? (
        <Card className="glass flex flex-col items-center gap-3 py-16 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <ListChecks className="h-7 w-7 text-primary" />
          </div>
          <div>
            <p className="font-medium">No checklists yet</p>
            <p className="mt-1 text-sm text-muted-foreground max-w-xs">
              Create a routine you repeat often — it resets each time you tick everything off.
            </p>
          </div>
          <NewChecklistDialog
            onCreated={(c) => navigate(`/checklists/${c.id}`)}
            trigger={
              <Button size="sm" variant="secondary">
                <Plus className="h-4 w-4" />
                Create a checklist
              </Button>
            }
          />
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {checklists.map((cl, i) => {
            const percent = cl.total > 0 ? Math.round((cl.done / cl.total) * 100) : 0;
            const complete = cl.total > 0 && cl.done === cl.total;
            return (
              <Card
                key={cl.id}
                onClick={() => navigate(`/checklists/${cl.id}`)}
                className="glass group relative cursor-pointer p-5 animate-in-up"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="absolute right-4 top-4 flex gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    onClick={(e) => onReset(e, cl.id)}
                    disabled={busyId === cl.id}
                    title="Reset"
                    className="text-muted-foreground/60 hover:text-foreground disabled:opacity-50"
                  >
                    {busyId === cl.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <RotateCcw className="h-4 w-4" />
                    )}
                  </button>
                  <button
                    onClick={(e) => onDelete(e, cl.id)}
                    disabled={busyId === cl.id}
                    title="Delete"
                    className="text-muted-foreground/60 hover:text-destructive disabled:opacity-50"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>

                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-background/50 text-xl">
                    {cl.emoji || "✅"}
                  </div>
                  <div className="min-w-0">
                    <div className="truncate font-semibold">{cl.name}</div>
                    <div className="text-xs text-muted-foreground">
                      {cl.total === 0 ? "No items yet" : `${cl.done}/${cl.total} done`}
                    </div>
                  </div>
                </div>

                <div className="mt-5">
                  <div className="h-2.5 w-full overflow-hidden rounded-full bg-background/60">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all duration-500",
                        complete
                          ? "bg-gradient-to-r from-emerald-500 to-emerald-400"
                          : "bg-gradient-to-r from-primary to-violet-400",
                      )}
                      style={{ width: `${percent}%` }}
                    />
                  </div>
                  <div className="mt-1.5 text-xs text-muted-foreground">
                    {complete ? "All done — reset for the next run" : `${percent}% complete`}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
