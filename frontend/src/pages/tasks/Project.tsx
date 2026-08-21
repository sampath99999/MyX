import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Hash, Trash2, ChevronDown, List, LayoutGrid, ClipboardList } from "lucide-react";
import QuickAddTask from "@/components/tasks/QuickAddTask";
import TaskItem from "@/components/tasks/TaskItem";
import Board from "@/components/tasks/Board";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Meter } from "@/components/ui/stat";
import { Segmented } from "@/components/ui/tabs";
import { PageShell, PageHeader, EmptyState } from "@/components/ui/page";
import { SkeletonRows } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { api, type Task } from "@/lib/api";
import { useTasksContext } from "./context";
import { cn } from "@/lib/utils";

export default function Project() {
  const { id } = useParams();
  const navigate = useNavigate();
  const projectId = Number(id);
  const ctx = useTasksContext();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDone, setShowDone] = useState(false);
  const { confirm, confirmDialog } = useConfirm();
  const toast = useToast();

  const project = useMemo(
    () => ctx.projects.find((p) => p.id === projectId),
    [ctx.projects, projectId],
  );
  const view = project?.view ?? "list";

  const load = useCallback(async () => {
    const { tasks } = await api.listTasks({ project_id: projectId });
    setTasks(tasks);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const reload = () => {
    load();
    ctx.reloadAll();
  };

  async function setView(v: "list" | "board") {
    await api.updateProject(projectId, { view: v });
    ctx.reloadAll();
  }

  async function removeProject() {
    const ok = await confirm({
      title: `Delete "${project?.name ?? "this project"}"?`,
      description:
        tasks.length > 0
          ? `Its ${tasks.length} task${tasks.length === 1 ? "" : "s"} move to the Inbox rather than being deleted.`
          : "The project is empty, so nothing else changes.",
      confirmLabel: "Delete project",
    });
    if (!ok) return;
    await api.deleteProject(projectId);
    toast.success(`"${project?.name ?? "Project"}" deleted`, "Any tasks it held are in the Inbox.");
    ctx.reloadAll();
    navigate("/tasks");
  }

  const open = tasks.filter((t) => t.status === "open");
  const done = tasks.filter((t) => t.status === "done");
  const total = tasks.length;
  const pct = total > 0 ? Math.round((done.length / total) * 100) : 0;

  return (
    <PageShell width={view === "list" ? "narrow" : "wide"} className="space-y-5">
      {confirmDialog}
      <PageHeader
        eyebrow={
          <span className="flex items-center gap-1.5">
            <Hash className="size-3" style={{ color: project?.color ?? "currentColor" }} />
            Project
          </span>
        }
        title={project?.name ?? "Project"}
        description={
          total > 0
            ? `${open.length} open · ${done.length} done · ${pct}% complete`
            : "Nothing in here yet"
        }
        actions={
          <>
            <Segmented
              value={view}
              onChange={(v) => setView(v)}
              options={[
                { value: "list", label: "List", icon: List },
                { value: "board", label: "Board", icon: LayoutGrid },
              ]}
            />
            <Button variant="outline" size="icon" onClick={removeProject} aria-label="Delete project">
              <Trash2 />
            </Button>
          </>
        }
      />

      {total > 0 && <Meter value={pct / 100} tone={pct === 100 ? "positive" : "default"} />}

      {view === "board" ? (
        <Board
          projectId={projectId}
          spaceId={project?.space_id ?? ctx.currentSpace?.id ?? ctx.spaces[0]?.id}
          allLabels={ctx.labels}
          onChanged={reload}
          onLabelsChanged={ctx.reloadAll}
        />
      ) : (
        <>
          <QuickAddTask
            spaceId={project?.space_id ?? ctx.currentSpace?.id ?? ctx.spaces[0]?.id}
            projectId={projectId}
            defaultDue={null}
            labels={ctx.labels}
            onCreated={reload}
            onLabelsChanged={ctx.reloadAll}
          />

          {loading ? (
            <SkeletonRows count={4} />
          ) : (
            <div className="space-y-4">
              {open.length === 0 && done.length === 0 ? (
                <EmptyState
                  icon={ClipboardList}
                  title="No tasks yet"
                  description="Add the first one above. Try the shorthand — “review the deck tomorrow !p1 #work” sets the date, priority and label in one line."
                />
              ) : open.length === 0 ? (
                <EmptyState
                  compact
                  icon={ClipboardList}
                  title="Everything here is done"
                  description="Nothing open in this project. Completed tasks are below."
                />
              ) : (
                <Card className="overflow-hidden">
                  {open.map((t) => (
                    <TaskItem
                      key={t.id}
                      task={t}
                      allLabels={ctx.labels}
                      onChanged={reload}
                      onLabelsChanged={ctx.reloadAll}
                    />
                  ))}
                </Card>
              )}

              {done.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowDone((v) => !v)}
                    className="flex items-center gap-1.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
                  >
                    <ChevronDown
                      className={cn("size-4 transition-transform", showDone && "rotate-180")}
                    />
                    {done.length} completed
                  </button>
                  {showDone && (
                    <Card className="mt-1.5 overflow-hidden opacity-70">
                      {done.map((t) => (
                        <TaskItem
                          key={t.id}
                          task={t}
                          allLabels={ctx.labels}
                          onChanged={reload}
                          onLabelsChanged={ctx.reloadAll}
                        />
                      ))}
                    </Card>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </PageShell>
  );
}
