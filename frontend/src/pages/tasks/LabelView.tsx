import { useCallback, useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Tag, Loader2, Trash2 } from "lucide-react";
import TaskItem from "@/components/tasks/TaskItem";
import { api, type Task } from "@/lib/api";
import { useTasksContext } from "./context";

export default function LabelView() {
  const { id } = useParams();
  const labelId = Number(id);
  const ctx = useTasksContext();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const label = ctx.labels.find((l) => l.id === labelId);

  const load = useCallback(async () => {
    const { tasks } = await api.listTasks({ label_id: labelId });
    setTasks(tasks);
    setLoading(false);
  }, [labelId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const reload = () => {
    load();
    ctx.reloadAll();
  };

  const contextFor = (t: Task) => {
    const proj = ctx.projects.find((p) => p.id === t.project_id);
    if (proj) return proj.name;
    const s = ctx.spaces.find((x) => x.id === t.space_id);
    return s ? `${s.icon} ${s.name}` : undefined;
  };

  async function removeLabel() {
    if (!confirm("Delete this label? It will be removed from all tasks.")) return;
    await api.deleteLabel(labelId);
    ctx.reloadAll();
    window.history.back();
  }

  return (
    <div className="mx-auto max-w-2xl p-6 lg:p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${label?.color ?? "#8b5cf6"}22` }}
          >
            <Tag className="h-5 w-5" style={{ color: label?.color ?? "#8b5cf6" }} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{label?.name ?? "Label"}</h1>
            <p className="text-xs text-muted-foreground">{tasks.length} open task{tasks.length === 1 ? "" : "s"}</p>
          </div>
        </div>
        <button
          onClick={removeLabel}
          title="Delete label"
          className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <div className="text-3xl">🏷️</div>
          <p className="text-sm text-muted-foreground">No open tasks with this label.</p>
        </div>
      ) : (
        <div className="flex flex-col">
          {tasks.map((t) => (
            <TaskItem
              key={t.id}
              task={t}
              context={contextFor(t)}
              allLabels={ctx.labels}
              onChanged={reload}
              onLabelsChanged={ctx.reloadAll}
            />
          ))}
        </div>
      )}
    </div>
  );
}
