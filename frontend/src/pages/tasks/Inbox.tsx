import { useCallback, useEffect, useState } from "react";
import { Inbox as InboxIcon } from "lucide-react";
import QuickAddTask from "@/components/tasks/QuickAddTask";
import TaskItem from "@/components/tasks/TaskItem";
import { Card } from "@/components/ui/card";
import { PageShell, PageHeader, EmptyState } from "@/components/ui/page";
import { SkeletonRows } from "@/components/ui/skeleton";
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
    <PageShell width="narrow" className="space-y-5">
      <PageHeader
        title="Inbox"
        description={
          ctx.currentSpace
            ? `Unsorted in ${ctx.currentSpace.icon} ${ctx.currentSpace.name}`
            : "Anything captured without a project or a date"
        }
      />

      <QuickAddTask
        spaceId={targetSpace}
        projectId={null}
        defaultDue={null}
        labels={ctx.labels}
        onCreated={reload}
        onLabelsChanged={ctx.reloadAll}
      />

      {loading ? (
        <SkeletonRows count={4} />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={InboxIcon}
          title="Inbox zero"
          description="This is the place to dump a thought without deciding where it belongs. Sort it into a project — or give it a date — later."
        />
      ) : (
        <Card className="overflow-hidden">
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
        </Card>
      )}
    </PageShell>
  );
}
