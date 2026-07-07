import { useCallback, useEffect, useState } from "react";
import { Sun, Loader2 } from "lucide-react";
import QuickAddTask from "@/components/tasks/QuickAddTask";
import TaskItem from "@/components/tasks/TaskItem";
import { api, type Task } from "@/lib/api";
import { useTasksContext } from "./context";

export default function Today() {
  const ctx = useTasksContext();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const targetSpace = ctx.currentSpace?.id ?? ctx.spaces[0]?.id;

  const load = useCallback(async () => {
    const { tasks } = await api.listTasks({
      space_id: ctx.spaceId ?? undefined,
      view: "today",
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

  const heading = new Date(ctx.today + "T00:00:00").toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    <div className="mx-auto max-w-2xl p-6 lg:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-500/15 text-amber-400">
          <Sun className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Today</h1>
          <p className="text-xs text-muted-foreground">
            {heading}
            {ctx.currentSpace ? ` · ${ctx.currentSpace.icon} ${ctx.currentSpace.name}` : " · All spaces"}
          </p>
        </div>
      </div>

      <QuickAddTask
        spaceId={targetSpace}
        defaultDue={ctx.today}
        labels={ctx.labels}
        onCreated={reload}
        onLabelsChanged={ctx.reloadAll}
      />

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-5 w-5 animate-spin text-primary" />
        </div>
      ) : tasks.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-16 text-center">
          <div className="text-3xl">🎉</div>
          <p className="text-sm text-muted-foreground">
            Nothing due today. Enjoy — or add something above.
          </p>
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
