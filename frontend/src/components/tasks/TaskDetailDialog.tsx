import { useEffect, useState, type ReactNode } from "react";
import { Loader2, Flag, Plus, Trash2, Check, Tag, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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

  async function patch(body: Partial<{ title: string; notes: string | null; priority: number; due_date: string | null }>) {
    const { task } = await api.updateTask(taskId, body);
    setTask(task);
    onChanged();
  }

  async function toggleLabel(label: Label) {
    const has = labels.some((l) => l.id === label.id);
    const next = has ? labels.filter((l) => l.id !== label.id) : [...labels, label];
    setLabels(next);
    await api.setTaskLabels(taskId, next.map((l) => l.id));
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
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="sr-only">Task details</DialogTitle>
        </DialogHeader>

        {loading || !task ? (
          <div className="flex justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-5">
            {/* Title */}
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={() => title.trim() && title !== task.title && patch({ title: title.trim() })}
              className="w-full bg-transparent text-lg font-semibold outline-none"
              placeholder="Task title"
            />

            {/* Priority + due */}
            <div className="flex flex-wrap items-center gap-2">
              {PRIOS.map((p) => (
                <button
                  key={p.value}
                  onClick={() => patch({ priority: p.value })}
                  className={cn(
                    "inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                    task.priority === p.value ? "border-primary/40 bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:bg-accent",
                  )}
                >
                  {p.value < 4 ? <Flag className={cn("h-3 w-3", p.color)} /> : null}
                  {p.label}
                </button>
              ))}
              <input
                type="date"
                value={task.due_date ?? ""}
                onChange={(e) => patch({ due_date: e.target.value || null })}
                className="rounded-full border border-border bg-transparent px-2.5 py-1 text-xs text-muted-foreground outline-none focus:border-primary/50"
              />
            </div>

            {/* Labels */}
            <div>
              <div className="mb-1.5 flex items-center gap-2 text-xs font-medium text-muted-foreground">
                <Tag className="h-3.5 w-3.5" /> Labels
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {labels.map((l) => (
                  <span
                    key={l.id}
                    className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs"
                    style={{ borderColor: `${l.color}66`, color: l.color }}
                  >
                    {l.name}
                    <button onClick={() => toggleLabel(l)} className="hover:opacity-70">
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
                <button
                  onClick={() => setShowLabelPicker((v) => !v)}
                  className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent"
                >
                  <Plus className="h-3 w-3" /> Add
                </button>
              </div>

              {showLabelPicker && (
                <div className="mt-2 rounded-lg border border-border/60 p-2">
                  <div className="flex flex-wrap gap-1.5">
                    {allLabels.map((l) => {
                      const active = labels.some((x) => x.id === l.id);
                      return (
                        <button
                          key={l.id}
                          onClick={() => toggleLabel(l)}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs transition-colors",
                            active ? "bg-primary/15 border-primary/40" : "border-border text-muted-foreground hover:bg-accent",
                          )}
                        >
                          {active && <Check className="h-3 w-3 text-primary" />}
                          <Tag className="h-3 w-3" style={{ color: l.color }} />
                          {l.name}
                        </button>
                      );
                    })}
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Input
                      value={newLabel}
                      onChange={(e) => setNewLabel(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), createAndAddLabel())}
                      placeholder="New label…"
                      className="h-8 text-xs"
                    />
                    <button onClick={createAndAddLabel} className="rounded-md border border-border px-2 text-xs hover:bg-accent">
                      Add
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Subtasks */}
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">
                Subtasks {subtasks.length > 0 && `(${doneCount}/${subtasks.length})`}
              </div>
              <div className="flex flex-col gap-0.5">
                {subtasks.map((s) => (
                  <div key={s.id} className="group flex items-center gap-2 rounded-md px-1 py-1 hover:bg-accent/40">
                    <button
                      onClick={() => toggleSub(s)}
                      className={cn(
                        "flex h-4 w-4 shrink-0 items-center justify-center rounded-full border",
                        s.done ? "border-primary bg-primary text-primary-foreground" : "border-muted-foreground/40",
                      )}
                    >
                      {s.done && <Check className="h-2.5 w-2.5" />}
                    </button>
                    <span className={cn("flex-1 text-sm", s.done && "text-muted-foreground line-through")}>{s.title}</span>
                    <button onClick={() => removeSub(s)} className="text-muted-foreground/40 opacity-0 group-hover:opacity-100 hover:text-destructive">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ))}
              </div>
              <div className="mt-1.5 flex items-center gap-2">
                <Plus className="h-4 w-4 text-muted-foreground" />
                <input
                  value={newSub}
                  onChange={(e) => setNewSub(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSub())}
                  placeholder="Add a subtask…"
                  className="flex-1 bg-transparent py-1 text-sm outline-none placeholder:text-muted-foreground/60"
                />
              </div>
            </div>

            {/* Notes */}
            <div>
              <div className="mb-1.5 text-xs font-medium text-muted-foreground">Notes</div>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                onBlur={() => notes !== (task.notes ?? "") && patch({ notes: notes.trim() || null })}
                placeholder="Add details…"
              />
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
