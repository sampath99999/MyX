import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Sun } from "lucide-react";
import QuickAddTask from "@/components/tasks/QuickAddTask";
import TaskItem from "@/components/tasks/TaskItem";
import { Card } from "@/components/ui/card";
import { PageShell, PageHeader, Section, EmptyState } from "@/components/ui/page";
import { SkeletonRows } from "@/components/ui/skeleton";
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

  /*
    Overdue is split out rather than sorted to the top.

    "Today" used to mean "due on or before today", which put a task that slipped
    three weeks ago in the same list as one due this afternoon — the same
    typography, the same position, nothing saying one of them had already
    failed. Two headings costs nothing and makes the backlog impossible to miss.
  */
  const { overdue, today } = useMemo(
    () => ({
      overdue: tasks.filter((t) => t.due_date != null && t.due_date < ctx.today),
      today: tasks.filter((t) => t.due_date == null || t.due_date >= ctx.today),
    }),
    [tasks, ctx.today],
  );

  const heading = new Date(ctx.today + "T00:00:00").toLocaleDateString("en-IN", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  const list = (items: Task[]) => (
    <Card className="overflow-hidden">
      {items.map((t) => (
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
  );

  return (
    <PageShell width="narrow" className="space-y-5">
      <PageHeader
        eyebrow={heading}
        title="Today"
        description={
          ctx.currentSpace
            ? `${ctx.currentSpace.icon} ${ctx.currentSpace.name}`
            : "Across every space"
        }
      />

      <QuickAddTask
        spaceId={targetSpace}
        defaultDue={ctx.today}
        labels={ctx.labels}
        onCreated={reload}
        onLabelsChanged={ctx.reloadAll}
      />

      {loading ? (
        <SkeletonRows count={4} />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={Sun}
          title="Nothing due today"
          description="Add something above, or go and enjoy the gap. Anything scheduled further out is under Upcoming."
        />
      ) : (
        <div className="space-y-5">
          {overdue.length > 0 && (
            <Section
              title={<span className="text-rose-400">Overdue</span>}
              description={`${overdue.length} task${overdue.length === 1 ? "" : "s"} slipped past their date`}
            >
              {list(overdue)}
            </Section>
          )}
          {today.length > 0 && (
            <Section title={overdue.length > 0 ? "Due today" : undefined}>{list(today)}</Section>
          )}
          {overdue.length === 0 && (
            <p className="flex items-center justify-center gap-2 pt-1 text-xs text-muted-foreground">
              <CheckCircle2 className="size-3.5 text-emerald-400" />
              Nothing overdue
            </p>
          )}
        </div>
      )}
    </PageShell>
  );
}
