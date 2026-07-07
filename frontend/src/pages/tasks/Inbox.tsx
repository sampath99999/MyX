import { useCallback, useEffect, useState } from "react";
import { Inbox as InboxIcon, Loader2 } from "lucide-react";
import QuickAddTask from "@/components/tasks/QuickAddTask";
import TaskItem from "@/components/tasks/TaskItem";
import { api, type Task } from "@/lib/api";
import { useTasksContext } from "./context";

export default function Inbox() {
  const ctx = useTasksContext();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);

  const targetSpace = ctx.currentSpace?.id ?? ctx.spaces[0]?.id;

  const load = useCallback(async () => {
    const { tasks } = await api.listTasks({ space_id: ctx.spaceId ?? undefined, view: "inbox" });
    setTasks(tasks);
    setLoading(false);
  }, [ctx.spaceId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const reload = () => {
    load();
    ctx.reloadAll();
  };

  const contextFor = (t: Task) => {
    if (ctx.spaceId == null) {
      const s = ctx.spaces.find((x) => x.id === t.space_id);
      return s ? `${s.icon} ${s.name}` : undefined;
    }
    return undefined;
  };

  return (
    <div className="mx-auto max-w-2xl p-6 lg:p-8 space-y-6">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-sky-500/15 text-sky-400">
          <InboxIcon className="h-5 w-5" />
        </div>
        <div>
          <h1 className="text-xl font-bold tracking-tight">Inbox</h1>
          <p className="text-xs text-muted-foreground">
            Unsorted tasks{" "}
            {ctx.currentSpace ? `· ${ctx.currentSpace.icon} ${ctx.currentSpace.name}` : "· All spaces"}
          </p>
        </div>
      </div>

      <QuickAddTask
        spaceId={targetSpace}
        projectId={null}
        defaultDue={null}
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
          <div className="text-3xl">📥</div>
          <p className="text-sm text-muted-foreground">
            Inbox zero. Capture quick thoughts here, sort them into projects later.
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
