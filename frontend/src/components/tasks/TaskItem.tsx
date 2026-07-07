import { useState } from "react";
import { Check, Trash2, Loader2, Flag, CalendarClock } from "lucide-react";
import { api, type Task } from "@/lib/api";
import { todayISO } from "@/pages/tasks/context";
import { cn } from "@/lib/utils";

const PRIORITY = {
  1: { color: "text-rose-400", label: "P1" },
  2: { color: "text-amber-400", label: "P2" },
  3: { color: "text-sky-400", label: "P3" },
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
  onChanged,
}: {
  task: Task;
  context?: string; // e.g. project or space name shown as a chip
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const done = task.status === "done";
  const prio = PRIORITY[task.priority as 1 | 2 | 3 | 4];

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

  const badge = task.due_date ? dueBadge(task.due_date) : null;

  return (
    <div className="group flex items-center gap-3 rounded-lg px-2 py-2.5 transition-colors hover:bg-accent/40">
      {/* Checkbox */}
      <button
        onClick={toggle}
        disabled={busy}
        className={cn(
          "flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-colors",
          done
            ? "border-primary bg-primary text-primary-foreground"
            : "border-muted-foreground/40 hover:border-primary",
        )}
        title={done ? "Reopen" : "Complete"}
      >
        {busy ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : done ? (
          <Check className="h-3 w-3" />
        ) : null}
      </button>

      {/* Title + meta */}
      <div className="min-w-0 flex-1">
        <div className={cn("truncate text-sm", done && "text-muted-foreground line-through")}>
          {task.title}
        </div>
        {(badge || context) && (
          <div className="mt-0.5 flex items-center gap-2 text-xs">
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
            {context && <span className="text-muted-foreground/70">{context}</span>}
          </div>
        )}
      </div>

      {/* Priority flag */}
      {prio && !done && <Flag className={cn("h-3.5 w-3.5 shrink-0", prio.color)} />}

      {/* Delete */}
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
