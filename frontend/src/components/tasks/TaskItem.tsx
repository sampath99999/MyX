import { useState } from "react";
import { Check, Trash2, Loader2, Flag, CalendarClock, ListChecks } from "lucide-react";
import { api, type Task, type Label } from "@/lib/api";
import { todayISO } from "@/pages/tasks/context";
import TaskDetailDialog from "@/components/tasks/TaskDetailDialog";
import { cn } from "@/lib/utils";

const PRIORITY = {
  1: "text-rose-400",
  2: "text-amber-400",
  3: "text-sky-400",
  4: null,
} as const;

function dueBadge(due: string): { text: string; tone: "overdue" | "today" | "soon" | "normal" } {
  const today = todayISO();
  if (due < today) {
    const days = Math.round((new Date(today).getTime() - new Date(due).getTime()) / 86400000);
    return { text: days === 1 ? "Yesterday" : `${days}d overdue`, tone: "overdue" };
  }
  if (due === today) return { text: "Today", tone: "today" };
  const diff = Math.round((new Date(due).getTime() - new Date(today).getTime()) / 86400000);
  if (diff === 1) return { text: "Tomorrow", tone: "soon" };
  return {
    text: new Date(due + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }),
    tone: "normal",
  };
}

export default function TaskItem({
  task,
  context,
  allLabels = [],
  onChanged,
  onLabelsChanged,
}: {
  task: Task;
  context?: string;
  allLabels?: Label[];
  onChanged: () => void;
  onLabelsChanged?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const done = task.status === "done";
  const prioColor = PRIORITY[task.priority as 1 | 2 | 3 | 4];
  const badge = task.due_date ? dueBadge(task.due_date) : null;

  async function toggle() {
    setBusy(true);
    try {
      done ? await api.reopenTask(task.id) : await api.completeTask(task.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.deleteTask(task.id);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/40">
      <button
        onClick={toggle}
        disabled={busy}
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
          done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40 hover:border-primary",
        )}
        title={done ? "Reopen" : "Complete"}
      >
        {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : done ? <Check className="h-3 w-3" /> : null}
      </button>

      {/* Title opens detail */}
      <TaskDetailDialog
        taskId={task.id}
        allLabels={allLabels}
        onChanged={onChanged}
        onLabelsChanged={onLabelsChanged}
        trigger={
          <button className="min-w-0 flex-1 text-left">
            <div className={cn("truncate text-sm", done && "text-muted-foreground line-through")}>
              {task.title}
            </div>
            {(badge || context || task.labels.length > 0 || task.subtasks.total > 0) && (
              <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs">
                {badge && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1",
                      badge.tone === "overdue" && "text-rose-400",
                      badge.tone === "today" && "text-amber-400",
                      badge.tone === "soon" && "text-sky-400",
                      badge.tone === "normal" && "text-muted-foreground",
                    )}
                  >
                    <CalendarClock className="h-3 w-3" />
                    {badge.text}
                  </span>
                )}
                {task.subtasks.total > 0 && (
                  <span className="inline-flex items-center gap-1 text-muted-foreground">
                    <ListChecks className="h-3 w-3" />
                    {task.subtasks.done}/{task.subtasks.total}
                  </span>
                )}
                {task.labels.map((l) => (
                  <span key={l.id} className="inline-flex items-center gap-1" style={{ color: l.color }}>
                    <span className="h-2 w-2 rounded-full" style={{ backgroundColor: l.color }} />
                    {l.name}
                  </span>
                ))}
                {context && <span className="text-muted-foreground/70">{context}</span>}
              </div>
            )}
          </button>
        }
      />

      {prioColor && !done && <Flag className={cn("h-3.5 w-3.5 shrink-0", prioColor)} />}

      <button
        onClick={remove}
        disabled={busy}
        title="Delete"
        className="shrink-0 text-muted-foreground/40 opacity-0 transition-opacity hover:text-destructive group-hover:opacity-100"
      >
        <Trash2 className="h-4 w-4" />
      </button>
    </div>
  );
}
