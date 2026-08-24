import { useEffect, useState, type ReactNode } from "react";
import { Flag, Plus, Trash2, Check, Tag, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { Meter } from "@/components/ui/stat";
import { api, type Task, type Label, type Subtask } from "@/lib/api";
import { cn } from "@/lib/utils";

const PRIOS = [
  { value: 1, color: "text-rose-400", label: "P1" },
  { value: 2, color: "text-amber-400", label: "P2" },
  { value: 3, color: "text-sky-400", label: "P3" },
  { value: 4, color: "text-muted-foreground", label: "None" },
];

export default function TaskDetailDialog({
  taskId,
  allLabels,
  onChanged,
  onLabelsChanged,
  trigger,
}: {
  taskId: number;
  allLabels: Label[];
  onChanged: () => void;
  onLabelsChanged?: () => void;
  trigger: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const [task, setTask] = useState<Task | null>(null);
  const [labels, setLabels] = useState<Label[]>([]);
  const [subtasks, setSubtasks] = useState<Subtask[]>([]);
  const [loading, setLoading] = useState(true);

  const [title, setTitle] = useState("");
  const [notes, setNotes] = useState("");
  const [newSub, setNewSub] = useState("");
  const [newLabel, setNewLabel] = useState("");
  const [showLabelPicker, setShowLabelPicker] = useState(false);

  async function load() {
    setLoading(true);
    const res = await api.getTask(taskId);
    setTask(res.task);
    setLabels(res.labels);
    setSubtasks(res.subtasks);
    setTitle(res.task.title);
    setNotes(res.task.notes ?? "");
    setLoading(false);
  }

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function patch(
    body: Partial<{ title: string; notes: string | null; priority: number; due_date: string | null }>,
  ) {
    const { task } = await api.updateTask(taskId, body);
    setTask(task);
    onChanged();
  }

  async function toggleLabel(label: Label) {
    const has = labels.some((l) => l.id === label.id);
    const next = has ? labels.filter((l) => l.id !== label.id) : [...labels, label];
    setLabels(next);
    await api.setTaskLabels(
      taskId,
      next.map((l) => l.id),
    );
    onChanged();
  }

  async function createAndAddLabel() {
    const name = newLabel.trim().replace(/^#/, "");
    if (!name) return;
    const { label } = await api.createLabel(name);
    setNewLabel("");
    onLabelsChanged?.();
    if (!labels.some((l) => l.id === label.id)) await toggleLabel(label);
  }

  async function addSub() {
    const t = newSub.trim();
    if (!t) return;
    const { subtask } = await api.addSubtask(taskId, t);
    setSubtasks((s) => [...s, subtask]);
    setNewSub("");
    onChanged();
  }

  async function toggleSub(s: Subtask) {
    const { subtask } = await api.updateSubtask(taskId, s.id, { done: !s.done });
    setSubtasks((list) => list.map((x) => (x.id === s.id ? subtask : x)));
    onChanged();
  }

  async function removeSub(s: Subtask) {
    await api.deleteSubtask(taskId, s.id);
    setSubtasks((list) => list.filter((x) => x.id !== s.id));
    onChanged();
  }

  const doneCount = subtasks.filter((s) => s.done).length;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      {/*
        Wide, and split.

        This was a 512px column with the description last — under the subtasks,
        in a default-height textarea. So the field people actually write in was
        the smallest thing in the dialog and the furthest down it, and a task
        with any real detail could not be read without scrolling, let alone
        written.

        The shape is the one every issue tracker converges on, because it works:
        what the task *is* down the middle, what it is *tagged with* down the
        side. Below `lg` the side column drops underneath, so a phone still gets
        one readable column rather than two cramped ones.

        `p-0` because the padding now belongs to the header, the body and the
        side column separately — on a wide screen those scroll independently,
        so a long description does not push the priority buttons off-screen.
      */}
      <DialogContent className="flex max-h-[92dvh] flex-col gap-0 overflow-hidden p-0 sm:max-w-4xl sm:p-0">
        <DialogHeader className="shrink-0 border-b border-border px-5 py-4 pr-14">
          <DialogTitle className="sr-only">Task details</DialogTitle>
          {loading || !task ? (
            <Skeleton className="h-7 w-56" />
          ) : (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title !== task.title && patch({ title: title.trim() })}
              className="w-full bg-transparent text-lg font-semibold leading-snug outline-none sm:text-xl"
              placeholder="Task title"
            />
          )}
        </DialogHeader>

        {loading || !task ? (
          <div className="space-y-4 p-5">
            <Skeleton className="h-3 w-20" />
            <Skeleton className="h-40 w-full rounded-lg" />
            <Skeleton className="h-3 w-16" />
            <Skeleton className="h-8 w-full" />
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto lg:grid-cols-[minmax(0,1fr)_18rem] lg:overflow-hidden">
            {/* ---------------- What the task is ---------------- */}
            <div className="min-w-0 space-y-6 p-5 lg:overflow-y-auto">
              <div>
                <label
                  htmlFor={`notes-${taskId}`}
                  className="mb-2 block text-xs font-medium text-muted-foreground"
                >
                  Description
                </label>
                <Textarea
                  id={`notes-${taskId}`}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  onBlur={() =>
                    notes !== (task.notes ?? "") && patch({ notes: notes.trim() || null })
                  }
                  placeholder="What does done look like? Links, context, anything the future you will want."
                  /* The whole point of the rebuild: room to actually write. */
                  className="min-h-[11rem] resize-y leading-relaxed lg:min-h-[16rem]"
                />
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Saved when you click away.
                </p>
              </div>

              <div>
                <div className="mb-2 flex items-center justify-between text-xs font-medium text-muted-foreground">
                  <span>Subtasks</span>
                  {subtasks.length > 0 && (
                    <span className="tnum">
                      {doneCount}/{subtasks.length}
                    </span>
                  )}
                </div>
                {subtasks.length > 0 && (
                  <Meter
                    className="mb-3"
                    value={doneCount / subtasks.length}
                    tone={doneCount === subtasks.length ? "positive" : "default"}
                  />
                )}
                <div className="flex flex-col gap-0.5">
                  {subtasks.map((s) => (
                    <div
                      key={s.id}
                      className="group flex items-center gap-2.5 rounded-md px-1.5 py-1.5 transition-colors hover:bg-accent/40"
                    >
                      <button
                        onClick={() => toggleSub(s)}
                        aria-label={s.done ? `Reopen "${s.title}"` : `Complete "${s.title}"`}
                        className={cn(
                          "tap flex size-[18px] shrink-0 items-center justify-center rounded-full border transition-colors",
                          s.done
                            ? "border-brand bg-brand text-white"
                            : "border-muted-foreground/40 hover:border-brand",
                        )}
                      >
                        {s.done && <Check className="size-3" strokeWidth={3} />}
                      </button>
                      <span
                        className={cn(
                          "min-w-0 flex-1 text-sm",
                          s.done && "text-muted-foreground line-through",
                        )}
                      >
                        {s.title}
                      </span>
                      <button
                        onClick={() => removeSub(s)}
                        aria-label={`Delete "${s.title}"`}
                        className="tap shrink-0 text-muted-foreground/40 transition-opacity hover:text-rose-400 sm:opacity-0 sm:group-hover:opacity-100"
                      >
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  ))}
                </div>
                <div className="mt-1 flex items-center gap-2.5 px-1.5">
                  <Plus className="size-4 shrink-0 text-muted-foreground" />
                  <input
                    value={newSub}
                    onChange={(e) => setNewSub(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSub())}
                    placeholder="Add a subtask…"
                    className="h-9 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground/60"
                  />
                </div>
              </div>
            </div>

            {/* ---------------- What it is tagged with ---------------- */}
            <div className="min-w-0 space-y-5 border-t border-border bg-card/40 p-5 lg:overflow-y-auto lg:border-l lg:border-t-0">
              <div>
                <p className="mb-2 text-xs font-medium text-muted-foreground">Priority</p>
                <div className="flex flex-wrap gap-1.5">
                  {PRIOS.map((p) => (
                    <button
                      key={p.value}
                      onClick={() => patch({ priority: p.value })}
                      className={cn(
                        "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-colors",
                        task.priority === p.value
                          ? "border-transparent bg-foreground text-background"
                          : "border-border text-muted-foreground hover:bg-accent",
                      )}
                    >
                      {p.value < 4 && (
                        <Flag
                          className={cn(
                            "size-3",
                            task.priority === p.value ? "text-background" : p.color,
                          )}
                        />
                      )}
                      {p.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label
                  htmlFor={`due-${taskId}`}
                  className="mb-2 block text-xs font-medium text-muted-foreground"
                >
                  Due date
                </label>
                <input
                  id={`due-${taskId}`}
                  type="date"
                  value={task.due_date ?? ""}
                  onChange={(e) => patch({ due_date: e.target.value || null })}
                  className="h-9 w-full rounded-md border border-input bg-transparent px-2.5 text-sm outline-none transition-[border-color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/25"
                />
              </div>

              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                  <Tag className="size-3.5" />
                  Labels
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {labels.map((l) => (
                    <span
                      key={l.id}
                      className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs"
                      style={{ borderColor: `${l.color}66`, color: l.color }}
                    >
                      {l.name}
                      <button
                        onClick={() => toggleLabel(l)}
                        aria-label={`Remove ${l.name}`}
                        className="tap transition-opacity hover:opacity-70"
                      >
                        <X className="size-3" />
                      </button>
                    </span>
                  ))}
                  <button
                    onClick={() => setShowLabelPicker((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                  >
                    <Plus className="size-3" />
                    Add
                  </button>
                </div>

                {showLabelPicker && (
                  <div className="mt-2.5 rounded-lg border border-border p-2">
                    <div className="flex flex-wrap gap-1.5">
                      {allLabels.map((l) => {
                        const active = labels.some((x) => x.id === l.id);
                        return (
                          <button
                            key={l.id}
                            onClick={() => toggleLabel(l)}
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs transition-colors",
                              active
                                ? "border-brand/40 bg-brand/10"
                                : "border-border text-muted-foreground hover:bg-accent",
                            )}
                          >
                            {active && <Check className="size-3 text-brand" />}
                            <Tag className="size-3" style={{ color: l.color }} />
                            {l.name}
                          </button>
                        );
                      })}
                    </div>
                    <div className="mt-2 flex gap-2">
                      <Input
                        value={newLabel}
                        onChange={(e) => setNewLabel(e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" && (e.preventDefault(), createAndAddLabel())
                        }
                        placeholder="New label…"
                        className="h-9 text-xs"
                      />
                      <button
                        onClick={createAndAddLabel}
                        className="h-9 shrink-0 rounded-md border border-border px-2.5 text-xs transition-colors hover:bg-accent"
                      >
                        Add
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
