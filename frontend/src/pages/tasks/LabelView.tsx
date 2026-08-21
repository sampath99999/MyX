import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Tag, Trash2 } from "lucide-react";
import TaskItem from "@/components/tasks/TaskItem";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageShell, PageHeader, EmptyState } from "@/components/ui/page";
import { SkeletonRows } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { api, type Task } from "@/lib/api";
import { useTasksContext } from "./context";

export default function LabelView() {
  const { id } = useParams();
  const navigate = useNavigate();
  const labelId = Number(id);
  const ctx = useTasksContext();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const { confirm, confirmDialog } = useConfirm();
  const toast = useToast();

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
    /*
      This used to be window.confirm(), which cannot say how many tasks are
      about to lose the label — the only fact that makes the decision.
    */
    const ok = await confirm({
      title: `Delete the "${label?.name ?? "label"}" label?`,
      description: `It is removed from ${tasks.length} open task${tasks.length === 1 ? "" : "s"}. The tasks themselves are untouched.`,
      confirmLabel: "Delete label",
    });
    if (!ok) return;
    await api.deleteLabel(labelId);
    toast.success(`"${label?.name ?? "Label"}" deleted`);
    ctx.reloadAll();
    navigate("/tasks");
  }

  return (
    <PageShell width="narrow" className="space-y-5">
      {confirmDialog}
      <PageHeader
        eyebrow="Label"
        title={
          <span className="flex items-center gap-2.5">
            <span
              className="size-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: label?.color ?? "currentColor" }}
            />
            {label?.name ?? "Label"}
          </span>
        }
        description={`${tasks.length} open task${tasks.length === 1 ? "" : "s"}`}
        actions={
          <Button variant="outline" onClick={removeLabel}>
            <Trash2 />
            Delete label
          </Button>
        }
      />

      {loading ? (
        <SkeletonRows count={4} />
      ) : tasks.length === 0 ? (
        <EmptyState
          icon={Tag}
          title="Nothing carries this label"
          description="Add it to a task from the task's detail view, or type #label in the quick-add box."
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
