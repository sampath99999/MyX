import { useState } from "react";
import {
  Check,
  Trash2,
  Loader2,
  Flag,
  CalendarClock,
  ListChecks,
  MoreHorizontal,
  RotateCcw,
} from "lucide-react";
import { api, type Task, type Label } from "@/lib/api";
import { todayISO } from "@/pages/tasks/context";
import TaskDetailDialog from "@/components/tasks/TaskDetailDialog";
import { Menu, MenuItem } from "@/components/ui/menu";
import { useToast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

const PRIORITY_LABEL = { 1: "Urgent", 2: "High", 3: "Medium", 4: "Normal" } as const;

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
  const toast = useToast();
  const done = task.status === "done";
  const prioColor = PRIORITY[task.priority as 1 | 2 | 3 | 4];
  const badge = task.due_date ? dueBadge(task.due_date) : null;

  async function toggle() {
    setBusy(true);
    try {
      if (done) {
        await api.reopenTask(task.id);
      } else {
        await api.completeTask(task.id);
        /*
          Completing is the app's most frequent write and, until now, its most
          silent one — the row simply vanished from Today. The toast both
          confirms it and carries the way back, which matters because ticking
          the wrong line is easy and un-ticking it meant hunting through a
          filter for completed tasks.
        */
        toast.toast({
          title: "Task completed",
          description: task.title,
          tone: "success",
          action: {
            label: "Undo",
            onClick: () => {
              api.reopenTask(task.id).then(onChanged).catch(() => {});
            },
          },
        });
      }
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await api.deleteTask(task.id);
      toast.success("Task deleted", task.title);
      onChanged();
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="group flex items-start gap-3 border-b border-border px-3 py-2.5 transition-colors last:border-0 hover:bg-accent/40">
      <button
        onClick={toggle}
        disabled={busy}
        className={cn(
          "mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full border transition-colors",
          done
            ? "border-foreground bg-foreground text-background"
            : "border-muted-foreground/40 hover:border-foreground",
        )}
        aria-label={done ? "Reopen task" : "Complete task"}
        title={done ? "Reopen" : "Complete"}
      >
        {busy ? (
          <Loader2 className="size-3 animate-spin" />
        ) : done ? (
          <Check className="size-3" />
        ) : null}
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
              <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs">
                {badge && (
                  <span
                    className={cn(
                      "inline-flex items-center gap-1",
                      badge.tone === "overdue" && "font-medium text-rose-400",
                      badge.tone === "today" && "font-medium text-amber-400",
                      badge.tone === "soon" && "text-muted-foreground",
                      badge.tone === "normal" && "text-muted-foreground",
                    )}
                  >
                    <CalendarClock className="size-3" />
                    {badge.text}
                  </span>
                )}
                {task.subtasks.total > 0 && (
                  <span className="tnum inline-flex items-center gap-1 text-muted-foreground">
                    <ListChecks className="size-3" />
                    {task.subtasks.done}/{task.subtasks.total}
                  </span>
                )}
                {task.labels.map((l) => (
                  <span
                    key={l.id}
                    className="inline-flex items-center gap-1 text-muted-foreground"
                  >
                    <span className="size-1.5 rounded-full" style={{ backgroundColor: l.color }} />
                    {l.name}
                  </span>
                ))}
                {context && <span className="truncate text-muted-foreground/70">{context}</span>}
              </div>
            )}
          </button>
        }
      />

      {prioColor && !done && (
        <Flag
          className={cn("mt-0.5 size-3.5 shrink-0", prioColor)}
          aria-label={PRIORITY_LABEL[task.priority as 1 | 2 | 3 | 4]}
        />
      )}

      {/*
        Delete used to be `opacity-0 group-hover:opacity-100`, which does not
        exist on a touchscreen — a task could be created and then only ever
        completed, never removed. A menu button is always there.
      */}
      <Menu
        align="end"
        trigger={
          <button
            aria-label={`Actions for ${task.title}`}
            className="-my-0.5 flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-60 transition-opacity hover:bg-accent hover:text-foreground focus-visible:opacity-100 group-hover:opacity-100"
          >
            <MoreHorizontal className="size-4" />
          </button>
        }
      >
        <MenuItem icon={done ? RotateCcw : Check} onSelect={toggle}>
          {done ? "Mark as not done" : "Mark complete"}
        </MenuItem>
        <MenuItem icon={Trash2} destructive onSelect={remove}>
          Delete task
        </MenuItem>
      </Menu>
    </div>
  );
}
