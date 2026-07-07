import { useCallback, useEffect, useState } from "react";
import { Plus, Loader2, Check, Flag, ListChecks, CalendarClock, X } from "lucide-react";
import { api, type Task, type Section, type Label } from "@/lib/api";
import TaskDetailDialog from "@/components/tasks/TaskDetailDialog";
import { todayISO } from "@/pages/tasks/context";
import { cn } from "@/lib/utils";

const PRIO = { 1: "text-rose-400", 2: "text-amber-400", 3: "text-sky-400", 4: null } as const;

function TaskCard({
  task,
  allLabels,
  onChanged,
  onLabelsChanged,
  onDragStart,
}: {
  task: Task;
  allLabels: Label[];
  onChanged: () => void;
  onLabelsChanged: () => void;
  onDragStart: (e: React.DragEvent) => void;
}) {
  const [busy, setBusy] = useState(false);
  const prio = PRIO[task.priority as 1 | 2 | 3 | 4];
  const today = todayISO();
  const overdue = task.due_date && task.due_date < today;

  async function complete(e: React.MouseEvent) {
    e.stopPropagation();
    setBusy(true);
    try {
      await api.completeTask(task.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      draggable
      onDragStart={onDragStart}
      className="group cursor-grab rounded-lg border border-border/60 bg-card p-3 shadow-sm transition-colors hover:border-border active:cursor-grabbing"
    >
      <div className="flex items-start gap-2">
        <button
          onClick={complete}
          disabled={busy}
          className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-muted-foreground/40 hover:border-primary"
          title="Complete"
        >
          {busy ? <Loader2 className="h-2.5 w-2.5 animate-spin" /> : <Check className="h-2.5 w-2.5 opacity-0 group-hover:opacity-40" />}
        </button>
        <TaskDetailDialog
          taskId={task.id}
          allLabels={allLabels}
          onChanged={onChanged}
          onLabelsChanged={onLabelsChanged}
          trigger={<button className="flex-1 text-left text-sm">{task.title}</button>}
        />
        {prio && <Flag className={cn("h-3.5 w-3.5 shrink-0", prio)} />}
      </div>

      {(task.due_date || task.labels.length > 0 || task.subtasks.total > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-6 text-xs">
          {task.due_date && (
            <span className={cn("inline-flex items-center gap-1", overdue ? "text-rose-400" : "text-muted-foreground")}>
              <CalendarClock className="h-3 w-3" />
              {new Date(task.due_date + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
            </span>
          )}
          {task.subtasks.total > 0 && (
            <span className="inline-flex items-center gap-1 text-muted-foreground">
              <ListChecks className="h-3 w-3" />
              {task.subtasks.done}/{task.subtasks.total}
            </span>
          )}
          {task.labels.map((l) => (
            <span key={l.id} className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} title={l.name} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function Board({
  projectId,
  spaceId,
  allLabels,
  onChanged,
  onLabelsChanged,
}: {
  projectId: number;
  spaceId?: number;
  allLabels: Label[];
  onChanged: () => void;
  onLabelsChanged: () => void;
}) {
  const [sections, setSections] = useState<Section[]>([]);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [dragId, setDragId] = useState<number | null>(null);
  const [overCol, setOverCol] = useState<number | null>(null);
  const [adding, setAdding] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newSection, setNewSection] = useState("");
  const [showNewSection, setShowNewSection] = useState(false);

  const load = useCallback(async () => {
    const [secRes, taskRes] = await Promise.all([
      api.listSections(projectId),
      api.listTasks({ project_id: projectId }),
    ]);
    setSections(secRes.sections);
    setTasks(taskRes.tasks.filter((t) => t.status === "open"));
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    load();
  }, [load]);

  const reload = () => {
    load();
    onChanged();
  };

  function tasksFor(section: Section, index: number): Task[] {
    return tasks.filter(
      (t) => t.section_id === section.id || (index === 0 && !sections.some((s) => s.id === t.section_id)),
    );
  }

  async function drop(section: Section) {
    setOverCol(null);
    const id = dragId;
    setDragId(null);
    if (id == null) return;
    const count = tasks.filter((t) => t.section_id === section.id).length;
    // optimistic
    setTasks((list) => list.map((t) => (t.id === id ? { ...t, section_id: section.id } : t)));
    await api.moveTask(id, section.id, count);
  }

  async function addCard(section: Section) {
    const title = newTitle.trim();
    if (!title || spaceId == null) return;
    await api.createTask({ title, space_id: spaceId, project_id: projectId, section_id: section.id });
    setNewTitle("");
    setAdding(null);
    reload();
  }

  async function addSection() {
    const name = newSection.trim();
    if (!name) return;
    await api.createSection(projectId, name);
    setNewSection("");
    setShowNewSection(false);
    load();
  }

  if (loading)
    return (
      <div className="flex justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );

  return (
    <div className="flex gap-4 overflow-x-auto pb-4">
      {sections.map((section, i) => {
        const colTasks = tasksFor(section, i);
        return (
          <div
            key={section.id}
            onDragOver={(e) => {
              e.preventDefault();
              setOverCol(section.id);
            }}
            onDragLeave={() => setOverCol((c) => (c === section.id ? null : c))}
            onDrop={() => drop(section)}
            className={cn(
              "flex w-72 shrink-0 flex-col rounded-xl border p-2 transition-colors",
              overCol === section.id ? "border-primary/50 bg-primary/5" : "border-border/50 bg-background/30",
            )}
          >
            <div className="flex items-center justify-between px-2 py-1.5">
              <span className="text-sm font-semibold">
                {section.name}
                <span className="ml-2 text-xs font-normal text-muted-foreground">{colTasks.length}</span>
              </span>
              <button onClick={() => setAdding(section.id)} className="text-muted-foreground hover:text-foreground" title="Add card">
                <Plus className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-col gap-2 px-1 pb-1">
              {colTasks.map((t) => (
                <TaskCard
                  key={t.id}
                  task={t}
                  allLabels={allLabels}
                  onChanged={reload}
                  onLabelsChanged={onLabelsChanged}
                  onDragStart={() => setDragId(t.id)}
                />
              ))}

              {adding === section.id ? (
                <div className="rounded-lg border border-border/60 bg-card p-2">
                  <input
                    autoFocus
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") addCard(section);
                      if (e.key === "Escape") setAdding(null);
                    }}
                    placeholder="Card title…"
                    className="w-full bg-transparent text-sm outline-none"
                  />
                  <div className="mt-2 flex gap-1.5">
                    <button onClick={() => addCard(section)} className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">
                      Add
                    </button>
                    <button onClick={() => setAdding(null)} className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  onClick={() => setAdding(section.id)}
                  className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <Plus className="h-3.5 w-3.5" /> Add card
                </button>
              )}
            </div>
          </div>
        );
      })}

      {/* Add section */}
      <div className="w-64 shrink-0">
        {showNewSection ? (
          <div className="rounded-xl border border-border/60 p-2">
            <input
              autoFocus
              value={newSection}
              onChange={(e) => setNewSection(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") addSection();
                if (e.key === "Escape") setShowNewSection(false);
              }}
              placeholder="Column name…"
              className="w-full bg-transparent px-1 text-sm outline-none"
            />
            <div className="mt-2 flex gap-1.5 px-1">
              <button onClick={addSection} className="rounded-md bg-primary px-2 py-1 text-xs font-medium text-primary-foreground">
                Add
              </button>
              <button onClick={() => setShowNewSection(false)} className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:bg-accent">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowNewSection(true)}
            className="flex w-full items-center gap-1.5 rounded-xl border border-dashed border-border/60 px-3 py-2.5 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Plus className="h-4 w-4" /> Add column
          </button>
        )}
      </div>
    </div>
  );
}
