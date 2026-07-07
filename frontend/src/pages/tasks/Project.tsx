import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { Hash, Loader2, Trash2, ChevronDown, List, LayoutGrid } from "lucide-react";
import QuickAddTask from "@/components/tasks/QuickAddTask";
import TaskItem from "@/components/tasks/TaskItem";
import Board from "@/components/tasks/Board";
import { api, type Task } from "@/lib/api";
import { useTasksContext } from "./context";
import { cn } from "@/lib/utils";

export default function Project() {
  const { id } = useParams();
  const projectId = Number(id);
  const ctx = useTasksContext();
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDone, setShowDone] = useState(false);

  const project = useMemo(() => ctx.projects.find((p) => p.id === projectId), [ctx.projects, projectId]);
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
    if (!confirm("Delete this project? Its tasks move to Inbox.")) return;
    await api.deleteProject(projectId);
    ctx.reloadAll();
    window.history.back();
  }

  const open = tasks.filter((t) => t.status === "open");
  const done = tasks.filter((t) => t.status === "done");
  const total = tasks.length;
  const pct = total > 0 ? Math.round((done.length / total) * 100) : 0;

  return (
    <div className={cn("p-6 lg:p-8 space-y-6", view === "list" && "mx-auto max-w-2xl")}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div
            className="flex h-10 w-10 items-center justify-center rounded-xl"
            style={{ backgroundColor: `${project?.color ?? "#8b5cf6"}22` }}
          >
            <Hash className="h-5 w-5" style={{ color: project?.color ?? "#8b5cf6" }} />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight">{project?.name ?? "Project"}</h1>
            <p className="text-xs text-muted-foreground">
              {open.length} open · {done.length} done{total > 0 ? ` · ${pct}%` : ""}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* View toggle */}
          <div className="flex rounded-lg border border-border/60 p-0.5">
            <button
              onClick={() => setView("list")}
              className={cn("rounded-md px-2 py-1", view === "list" ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground")}
              title="List view"
            >
              <List className="h-4 w-4" />
            </button>
            <button
              onClick={() => setView("board")}
              className={cn("rounded-md px-2 py-1", view === "board" ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:text-foreground")}
              title="Board view"
            >
              <LayoutGrid className="h-4 w-4" />
            </button>
          </div>
          <button
            onClick={removeProject}
            title="Delete project"
            className="rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-destructive"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

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
          {total > 0 && (
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-background/60">
              <div
                className="h-full rounded-full bg-gradient-to-r from-primary to-violet-400 transition-all duration-500"
                style={{ width: `${pct}%` }}
              />
            </div>
          )}

          <QuickAddTask
            spaceId={project?.space_id ?? ctx.currentSpace?.id ?? ctx.spaces[0]?.id}
            projectId={projectId}
            defaultDue={null}
            labels={ctx.labels}
            onCreated={reload}
            onLabelsChanged={ctx.reloadAll}
          />

          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 className="h-5 w-5 animate-spin text-primary" />
            </div>
          ) : (
            <div className="space-y-4">
              {open.length === 0 && done.length === 0 ? (
                <div className="flex flex-col items-center gap-2 py-16 text-center">
                  <div className="text-3xl">📋</div>
                  <p className="text-sm text-muted-foreground">No tasks yet. Add your first above.</p>
                </div>
              ) : (
                <div className="flex flex-col">
                  {open.map((t) => (
                    <TaskItem
                      key={t.id}
                      task={t}
                      allLabels={ctx.labels}
                      onChanged={reload}
                      onLabelsChanged={ctx.reloadAll}
                    />
                  ))}
                </div>
              )}

              {done.length > 0 && (
                <div>
                  <button
                    onClick={() => setShowDone((v) => !v)}
                    className="flex items-center gap-1.5 px-2 py-1 text-xs font-medium text-muted-foreground hover:text-foreground"
                  >
                    <ChevronDown className={cn("h-4 w-4 transition-transform", showDone && "rotate-180")} />
                    {done.length} completed
                  </button>
                  {showDone && (
                    <div className="flex flex-col opacity-70">
                      {done.map((t) => (
                        <TaskItem key={t.id} task={t} allLabels={ctx.labels} onChanged={reload} onLabelsChanged={ctx.reloadAll} />
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
