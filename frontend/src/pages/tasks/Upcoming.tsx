import { useCallback, useEffect, useState } from "react";
import { CalendarRange } from "lucide-react";
import TaskItem from "@/components/tasks/TaskItem";
import { Card } from "@/components/ui/card";
import { PageShell, PageHeader, Section, EmptyState } from "@/components/ui/page";
import { SkeletonRows } from "@/components/ui/skeleton";
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
    <PageShell width="narrow" className="space-y-5">
      <PageHeader
        title="Upcoming"
        description={
          ctx.currentSpace
            ? `Scheduled ahead in ${ctx.currentSpace.icon} ${ctx.currentSpace.name}`
            : "Everything scheduled ahead, across every space"
        }
      />

      {loading ? (
        <SkeletonRows count={5} />
      ) : groups.length === 0 ? (
        <EmptyState
          icon={CalendarRange}
          title="Nothing scheduled ahead"
          description="Tasks with a future due date show up here, grouped by day. Anything without a date sits in the Inbox."
        />
      ) : (
        <div className="space-y-5">
          {groups.map((g) => (
            <Section
              key={g.date}
              title={g.label}
              description={`${g.tasks.length} task${g.tasks.length === 1 ? "" : "s"}`}
            >
              <Card className="overflow-hidden">
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
              </Card>
            </Section>
          ))}
        </div>
      )}
    </PageShell>
  );
}
