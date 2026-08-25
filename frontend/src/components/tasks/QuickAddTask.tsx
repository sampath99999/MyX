import { useState, useEffect, useRef } from "react";
import { Plus, Flag, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { api, type Label } from "@/lib/api";
import { todayISO } from "@/pages/tasks/context";
import { parseQuickAdd } from "@/lib/taskParse";
import { cn } from "@/lib/utils";

function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return d.toLocaleDateString("en-CA");
}

const PRIOS = [
  { value: 1, color: "text-rose-400", label: "P1" },
  { value: 2, color: "text-amber-400", label: "P2" },
  { value: 3, color: "text-sky-400", label: "P3" },
];

export default function QuickAddTask({
  spaceId,
  projectId = null,
  sectionId = null,
  defaultDue = null,
  labels = [],
  onCreated,
  onLabelsChanged,
  placeholder = "Add a task…  (try: tomorrow !p1 #home)",
  autoFocus = false,
}: {
  spaceId?: number;
  projectId?: number | null;
  sectionId?: number | null;
  defaultDue?: string | null;
  labels?: Label[];
  onCreated: () => void;
  onLabelsChanged?: () => void;
  placeholder?: string;
  /** Focus the field on mount — see lib/addIntent.ts. */
  autoFocus?: boolean;
}) {
  const today = todayISO();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<string | null>(defaultDue);
  const [priority, setPriority] = useState(4);
  const [focused, setFocused] = useState(false);

  /*
    Focus on request, not on mount.

    React's autoFocus attribute only fires when the input first mounts, and the
    flag that asks for focus arrives a tick later — the Add menu navigates here
    and the page reads the intent in an effect, by which time the field has
    already mounted unfocused. So the focus is imperative and keyed on the prop.

    A task is typed rather than filled in, so this field *is* the form; opening a
    dialog around it would be ceremony with nothing in it.
  */
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);
  const [busy, setBusy] = useState(false);

  const preview = parseQuickAdd(title, today);
  const canAdd = preview.title.length > 0 && spaceId != null;

  async function resolveLabels(names: string[]): Promise<number[]> {
    const ids: number[] = [];
    let created = false;
    for (const name of names) {
      const existing = labels.find((l) => l.name.toLowerCase() === name.toLowerCase());
      if (existing) ids.push(existing.id);
      else {
        const { label } = await api.createLabel(name);
        ids.push(label.id);
        created = true;
      }
    }
    if (created) onLabelsChanged?.();
    return ids;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canAdd) return;
    setBusy(true);
    try {
      const parsed = parseQuickAdd(title, today);
      const label_ids = parsed.labels.length ? await resolveLabels(parsed.labels) : [];
      await api.createTask({
        title: parsed.title,
        space_id: spaceId!,
        project_id: projectId,
        section_id: sectionId ?? undefined,
        due_date: parsed.due_date ?? due,
        priority: parsed.priority ?? priority,
        label_ids,
      });
      setTitle("");
      setPriority(4);
      setDue(defaultDue);
      onCreated();
    } finally {
      setBusy(false);
    }
  }

  const dueChips: { label: string; value: string | null }[] = [
    { label: "Today", value: today },
    { label: "Tomorrow", value: addDays(today, 1) },
    { label: "No date", value: null },
  ];

  return (
    <form
      onSubmit={submit}
      className={cn(
        "rounded-xl border bg-card transition-colors",
        focused ? "border-ring" : "border-border",
      )}
    >
      <div className="flex items-center gap-2 p-2">
        <Plus className="ml-1 size-4 shrink-0 text-muted-foreground" />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder={placeholder}
          ref={inputRef}
          /* 32px is a small thing to aim at, and this is the field the whole
             row exists for. */
          className="h-10 min-w-0 flex-1 bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground/60"
        />
        {canAdd && (
          <Button type="submit" size="sm" loading={busy}>
            Add
          </Button>
        )}
      </div>

      {(focused || title) && (
        <div className="flex flex-wrap items-center gap-1.5 border-t border-border px-3 py-2">
          {dueChips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => setDue(chip.value)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                (preview.due_date ?? due) === chip.value
                  ? "border-transparent bg-foreground text-background"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              {chip.label}
            </button>
          ))}
          <input
            type="date"
            value={due ?? ""}
            onChange={(e) => setDue(e.target.value || null)}
            className="rounded-full border border-border bg-transparent px-2 py-1 text-xs text-muted-foreground outline-none focus:border-ring"
          />
          <span className="mx-1 h-4 w-px bg-border" />
          {PRIOS.map((p) => (
            <button
              key={p.value}
              type="button"
              onClick={() => setPriority(priority === p.value ? 4 : p.value)}
              className={cn(
                "inline-flex items-center gap-1 rounded-full border px-2 py-1 text-xs font-medium transition-colors",
                (preview.priority ?? priority) === p.value
                  ? "border-transparent bg-secondary text-foreground"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              <Flag className={cn("size-3", p.color)} />
              {p.label}
            </button>
          ))}
          {priority !== 4 && (
            <button type="button" onClick={() => setPriority(4)} className="text-muted-foreground/60 hover:text-foreground" title="Clear priority">
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}
    </form>
  );
}
