import { useState } from "react";
import { Plus, Loader2, Flag, X } from "lucide-react";
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
}: {
  spaceId?: number;
  projectId?: number | null;
  sectionId?: number | null;
  defaultDue?: string | null;
  labels?: Label[];
  onCreated: () => void;
  onLabelsChanged?: () => void;
  placeholder?: string;
}) {
  const today = todayISO();
  const [title, setTitle] = useState("");
  const [due, setDue] = useState<string | null>(defaultDue);
  const [priority, setPriority] = useState(4);
  const [focused, setFocused] = useState(false);
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
    <form onSubmit={submit} className="rounded-xl border border-border/60 bg-card/60 p-2">
      <div className="flex items-center gap-2">
        <Plus className="ml-1 h-4 w-4 text-muted-foreground" />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder={placeholder}
          className="flex-1 bg-transparent px-1 py-1.5 text-sm outline-none placeholder:text-muted-foreground/60"
        />
        {canAdd && (
          <Button type="submit" size="sm" disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Add"}
          </Button>
        )}
      </div>

      {(focused || title) && (
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-border/40 px-1 pt-2">
          {dueChips.map((chip) => (
            <button
              key={chip.label}
              type="button"
              onClick={() => setDue(chip.value)}
              className={cn(
                "rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
                (preview.due_date ?? due) === chip.value
                  ? "border-primary/40 bg-primary/15 text-foreground"
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
            className="rounded-full border border-border bg-transparent px-2 py-1 text-xs text-muted-foreground outline-none focus:border-primary/50"
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
                  ? "border-primary/40 bg-primary/15 text-foreground"
                  : "border-border text-muted-foreground hover:bg-accent",
              )}
            >
              <Flag className={cn("h-3 w-3", p.color)} />
              {p.label}
            </button>
          ))}
          {priority !== 4 && (
            <button type="button" onClick={() => setPriority(4)} className="text-muted-foreground/60 hover:text-foreground" title="Clear priority">
              <X className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </form>
  );
}
