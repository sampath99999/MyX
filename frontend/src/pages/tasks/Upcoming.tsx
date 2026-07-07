import { useCallback, useEffect, useState } from "react";
import { CalendarRange, Loader2 } from "lucide-react";
import TaskItem from "@/components/tasks/TaskItem";
import { api, type Task } from "@/lib/api";
import { useTasksContext } from "./context";

function groupLabel(due: string, today: string): string {
  const diff = Math.round((new Date(due).getTime() - new Date(today).getTime()) / 86400000);
  if (diff === 1) return "Tomorrow";
  const d = new Date(due + "T00:00:00");
  if (diff <= 7) return d.toLocaleDateString("en-IN", { weekday: "long" });
  return d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" });
}

export default function Upcoming() {
  const ctx = useTasksContext();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const { tasks } = await api.listTasks({
      space_id: ctx.spaceId ?? undefined,
      view: "upcoming",
      today: ctx.today,
    });
    setTasks(tasks);
    setLoading(false);
  }, [ctx.spaceId, ctx.today]);

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
    if (ctx.spaceId == null) {
      const s = ctx.spaces.find((x) => x.id === t.space_id);
      return s ? `${s.icon} ${s.name}` : undefined;
    }
    return undefined;
  };

  // Group by due date.
  const groups: { date: string; label: string; tasks: Task[] }[] = [];
  for (const t of tasks) {
    if (!t.due_date) continue;
    let g = groups.find((x) => x.date === t.due_date);
    if (!g) {
      g = { date: t.due_date, label: groupLabel(t.due_date, ctx.today), tasks: [] };
      groups.push(g);
    }
    g.tasks.push(t);
  }

  return (
    <div className="mx-auto max-w-2xl p-6 lg:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-500/15 text-violet-400">
          <CalendarRange className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Upcoming</h1>
          <p className="text-xs text-muted-foreground">
            Scheduled ahead
            {ctx.currentSpace ? ` · ${ctx.currentSpace.icon} ${ctx.currentSpace.name}` : " · All spaces"}
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : groups.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <div className="text-3xl">🗓️</div>
          <p className="text-sm text-muted-foreground">Nothing scheduled ahead. You're all clear.</p>
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <div key={g.date}>
              <div className="mb-1 px-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {g.label}
              </div>
              <div className="flex flex-col">
                {g.tasks.map((t) => (
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
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
