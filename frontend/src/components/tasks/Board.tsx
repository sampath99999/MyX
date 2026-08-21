import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Plus,
  Check,
  Flag,
  ListChecks,
  CalendarClock,
  X,
  GripVertical,
  MoreHorizontal,
  Pencil,
  Trash2,
  Loader2,
} from "lucide-react";
import { api, type Task, type Section, type Label } from "@/lib/api";
import TaskDetailDialog from "@/components/tasks/TaskDetailDialog";
import { Menu, MenuItem, MenuSeparator } from "@/components/ui/menu";
import { Skeleton } from "@/components/ui/skeleton";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { todayISO } from "@/pages/tasks/context";
import { useBoardDrag } from "@/components/tasks/useBoardDrag";
import { cn } from "@/lib/utils";

/*
  The project board.

  Two things were wrong with the old one beyond how it looked.

  Cards could only be dropped *into* a column, never *at a place in it*. The
  drop handler appended to the end every time, so a board could be sorted into
  columns and never into an order — which is half of what a board is for.

  And none of it worked on a phone. It used HTML5 `draggable`, and touchscreens
  do not fire drag events, so on the device this app was optimised for the board
  was a picture. See useBoardDrag.ts for what replaced it.

  The layout is rebuilt on the app's own vocabulary rather than the ad-hoc
  primary/50 borders it had: columns are surfaces with sticky headers, cards
  carry the same chips the task list uses, and the column a card would land in
  is shown by a line at the exact insertion point rather than by tinting the
  whole column.
*/

const PRIORITY_COLOR = {
  1: "text-rose-400",
  2: "text-amber-400",
  3: "text-sky-400",
  4: null,
} as const;

/** Ids in `list`, with `id` removed from wherever it was and inserted at `at`. */
function insertAt(list: number[], id: number, at: number): number[] {
  const without = list.filter((n) => n !== id);
  const clamped = Math.max(0, Math.min(at, without.length));
  return [...without.slice(0, clamped), id, ...without.slice(clamped)];
}

function TaskCard({
  task,
  allLabels,
  dragging,
  onChanged,
  onLabelsChanged,
  onGrab,
}: {
  task: Task;
  allLabels: Label[];
  dragging: boolean;
  onChanged: () => void;
  onLabelsChanged: () => void;
  onGrab: (e: React.PointerEvent) => void;
}) {
  const [busy, setBusy] = useState(false);
  const priority = PRIORITY_COLOR[task.priority as 1 | 2 | 3 | 4];
  const overdue = task.due_date && task.due_date < todayISO();

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
      data-task-id={task.id}
      className={cn(
        "group relative rounded-lg border border-border bg-card p-2.5 shadow-sm transition-[opacity,box-shadow]",
        // The original stays in place while it is dragged, faded, so the column
        // does not reflow under the pointer and change where you are aiming.
        dragging && "opacity-30",
      )}
    >
      <div className="flex items-start gap-2">
        <button
          onClick={complete}
          disabled={busy}
          aria-label={`Complete "${task.title}"`}
          /* `tap` keeps the ring at 18px while the hit area reaches 30 — see
             index.css. A tick this size is right visually and wrong to aim at. */
          className="tap mt-px flex size-[18px] shrink-0 items-center justify-center rounded-full border border-muted-foreground/40 transition-colors hover:border-brand hover:bg-brand/10"
        >
          {busy ? (
            <Loader2 className="size-3 animate-spin" />
          ) : (
            <Check className="size-3 opacity-0 transition-opacity group-hover:opacity-50" />
          )}
        </button>

        <TaskDetailDialog
          taskId={task.id}
          allLabels={allLabels}
          onChanged={onChanged}
          onLabelsChanged={onLabelsChanged}
          trigger={
            <button className="min-w-0 flex-1 py-1 text-left text-[0.8125rem] leading-snug">
              {task.title}
            </button>
          }
        />

        {priority && <Flag className={cn("mt-px size-3.5 shrink-0", priority)} />}

        {/*
          The grab handle. `touch-action: none` is what makes this work on a
          phone — it tells the browser we are handling the gesture, so the
          column does not scroll away underneath the card. It is only on the
          handle, so scrolling the column with a finger still works everywhere
          else on the card.
        */}
        <button
          onPointerDown={onGrab}
          aria-label={`Move "${task.title}"`}
          style={{ touchAction: "none" }}
          /* Bigger under a thumb: this is the control the whole board rests on,
             and 24px is not something you reliably catch on a phone. */
          className="-mr-1 -mt-1 flex size-8 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-accent hover:text-foreground active:cursor-grabbing sm:-mt-0.5 sm:size-6"
        >
          <GripVertical className="size-3.5" />
        </button>
      </div>

      {(task.due_date || task.labels.length > 0 || task.subtasks.total > 0) && (
        <div className="mt-2 flex flex-wrap items-center gap-2 pl-[26px] text-[11px]">
          {task.due_date && (
            <span
              className={cn(
                "inline-flex items-center gap-1",
                overdue ? "text-rose-400" : "text-muted-foreground",
              )}
            >
              <CalendarClock className="size-3" />
              {new Date(`${task.due_date}T00:00:00`).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
              })}
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
              className="size-2 rounded-full"
              style={{ backgroundColor: l.color }}
              title={l.name}
            />
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
  const [byId, setById] = useState<Map<number, Task>>(new Map());
  /** columnId → task ids, top to bottom. The board's layout truth. */
  const [order, setOrder] = useState<Map<number, number[]>>(new Map());
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState<number | null>(null);
  const [newTitle, setNewTitle] = useState("");
  const [newSection, setNewSection] = useState("");
  const [showNewSection, setShowNewSection] = useState(false);
  const [renaming, setRenaming] = useState<number | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const { confirm, confirmDialog } = useConfirm();
  const toast = useToast();

  const columnEls = useRef(new Map<number, HTMLElement>());

  const load = useCallback(async () => {
    const [secRes, taskRes] = await Promise.all([
      api.listSections(projectId),
      api.listTasks({ project_id: projectId }),
    ]);
    const secs = secRes.sections;
    const open = taskRes.tasks.filter((t) => t.status === "open");

    /*
      Tasks with no section — created from the list view, or left behind when a
      column was deleted — belong to the first column. Without this they exist
      in the project and appear on no board at all.
    */
    const known = new Set(secs.map((s) => s.id));
    const next = new Map<number, number[]>();
    secs.forEach((s) => next.set(s.id, []));
    for (const t of open) {
      const target = t.section_id != null && known.has(t.section_id) ? t.section_id : secs[0]?.id;
      if (target != null) next.get(target)!.push(t.id);
    }

    setSections(secs);
    setById(new Map(open.map((t) => [t.id, t])));
    setOrder(next);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    setLoading(true);
    load();
  }, [load]);

  const reload = () => {
    load();
    onChanged();
  };

  /* ---------------- Moving things ---------------- */

  const moveCard = useCallback(
    (taskId: number, from: number, to: number, index: number) => {
      let after: Map<number, number[]> | null = null;
      setOrder((prev) => {
        const next = new Map(prev);
        if (from !== to) next.set(from, (prev.get(from) ?? []).filter((n) => n !== taskId));
        next.set(to, insertAt(prev.get(to) ?? [], taskId, index));
        after = next;
        return next;
      });

      // Fire after the optimistic render. The destination always needs writing;
      // the source only when the card actually left it, because removing a card
      // renumbers everything below it there too.
      queueMicrotask(async () => {
        if (!after) return;
        try {
          await api.reorderTasks(to, after.get(to) ?? []);
          if (from !== to) await api.reorderTasks(from, after.get(from) ?? []);
          onChanged();
        } catch {
          toast.error("Could not move that card", "Putting the board back.");
          load();
        }
      });
    },
    [load, onChanged, toast],
  );

  const moveColumn = useCallback(
    (sectionId: number, index: number) => {
      let ids: number[] = [];
      setSections((prev) => {
        const without = prev.filter((s) => s.id !== sectionId);
        const moved = prev.find((s) => s.id === sectionId);
        if (!moved) return prev;
        const clamped = Math.max(0, Math.min(index, without.length));
        const next = [...without.slice(0, clamped), moved, ...without.slice(clamped)];
        ids = next.map((s) => s.id);
        return next;
      });

      queueMicrotask(async () => {
        if (!ids.length) return;
        try {
          await api.reorderSections(projectId, ids);
        } catch {
          toast.error("Could not move that column", "Putting the board back.");
          load();
        }
      });
    },
    [projectId, load, toast],
  );

  const geometry = useCallback(
    () => ({
      columns: sections
        .map((s) => ({ id: s.id, el: columnEls.current.get(s.id)! }))
        .filter((c) => c.el),
      cardsIn: (columnId: number) =>
        Array.from(
          columnEls.current.get(columnId)?.querySelectorAll<HTMLElement>("[data-task-id]") ?? [],
        ),
    }),
    [sections],
  );

  const { drag, start } = useBoardDrag({
    geometry,
    onDropCard: moveCard,
    onDropColumn: moveColumn,
  });

  /* ---------------- Writes ---------------- */

  async function addCard(sectionId: number) {
    const title = newTitle.trim();
    if (!title || spaceId == null) return;
    setNewTitle("");
    setAdding(null);
    await api.createTask({ title, space_id: spaceId, project_id: projectId, section_id: sectionId });
    reload();
  }

  async function addSection() {
    const name = newSection.trim();
    if (!name) return;
    setNewSection("");
    setShowNewSection(false);
    await api.createSection(projectId, name);
    load();
  }

  async function saveRename(sectionId: number) {
    const name = renameValue.trim();
    setRenaming(null);
    if (!name) return;
    setSections((prev) => prev.map((s) => (s.id === sectionId ? { ...s, name } : s)));
    await api.renameSection(projectId, sectionId, name);
  }

  async function removeSection(section: Section) {
    const count = (order.get(section.id) ?? []).length;
    const ok = await confirm({
      title: `Delete "${section.name}"?`,
      description: count
        ? `Its ${count} card${count === 1 ? "" : "s"} move to the first column rather than being deleted.`
        : "The column is empty, so nothing else changes.",
      confirmLabel: "Delete column",
    });
    if (!ok) return;
    await api.deleteSection(projectId, section.id);
    load();
  }

  const columns = useMemo(
    () =>
      sections.map((section) => ({
        section,
        items: (order.get(section.id) ?? [])
          .map((id) => byId.get(id))
          .filter((t): t is Task => Boolean(t)),
      })),
    [sections, order, byId],
  );

  if (loading) {
    return (
      <div className="flex gap-4 overflow-hidden pb-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="w-[19rem] shrink-0 rounded-xl border border-border bg-card/40 p-3">
            <Skeleton className="h-4 w-24" />
            <div className="mt-4 space-y-2">
              {Array.from({ length: 3 - i }).map((_, j) => (
                <Skeleton key={j} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          </div>
        ))}
      </div>
    );
  }

  const draggedTask = drag?.kind === "card" ? byId.get(drag.id) : null;
  const draggedSection = drag?.kind === "column" ? sections.find((s) => s.id === drag.id) : null;

  return (
    <>
      {confirmDialog}

      <div className="flex items-start gap-4 overflow-x-auto pb-4">
        {columns.map(({ section, items }) => {
          /*
            The drop index counts the columns *without* the one being dragged —
            a column cannot be a landmark for its own move — so the indicator
            has to be placed against that same list. Comparing it against the
            unfiltered index puts the line in the wrong gap whenever the dragged
            column started to the left of this one.
          */
          const draggingColumn = drag?.kind === "column";
          const slot = draggingColumn
            ? columns.filter((c) => c.section.id !== drag.id).findIndex((c) => c.section.id === section.id)
            : -1;

          return (
            <div key={section.id} className="flex shrink-0 items-start">
              {/* Where a dragged column would land. */}
              {draggingColumn && slot >= 0 && drag.target.index === slot && (
                <div className="mr-4 h-24 w-1 shrink-0 rounded-full bg-brand" />
              )}

              <div
                data-column-id={section.id}
                ref={(el) => {
                  if (el) columnEls.current.set(section.id, el);
                  else columnEls.current.delete(section.id);
                }}
                className={cn(
                  "flex w-[19rem] shrink-0 flex-col rounded-xl border border-border bg-card/40 transition-opacity",
                  drag?.kind === "column" && drag.id === section.id && "opacity-40",
                )}
              >
                {/* ---- Column header ---- */}
                <div className="flex items-center gap-1.5 border-b border-border px-3 py-2.5">
                  <button
                    onPointerDown={(e) => start(e, { kind: "column", id: section.id })}
                    aria-label={`Move column "${section.name}"`}
                    style={{ touchAction: "none" }}
                    className="-ml-1 flex size-8 shrink-0 cursor-grab items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-accent hover:text-foreground active:cursor-grabbing sm:size-6"
                  >
                    <GripVertical className="size-3.5" />
                  </button>

                  {renaming === section.id ? (
                    <input
                      autoFocus
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onBlur={() => saveRename(section.id)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") saveRename(section.id);
                        if (e.key === "Escape") setRenaming(null);
                      }}
                      className="min-w-0 flex-1 rounded border border-ring bg-background px-1.5 py-0.5 text-sm font-semibold outline-none"
                    />
                  ) : (
                    <button
                      onClick={() => {
                        setRenameValue(section.name);
                        setRenaming(section.id);
                      }}
                      className="min-w-0 flex-1 truncate text-left text-sm font-semibold"
                      title="Rename column"
                    >
                      {section.name}
                    </button>
                  )}

                  <span className="tnum shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[11px] font-medium text-muted-foreground">
                    {items.length}
                  </span>

                  <button
                    onClick={() => setAdding(section.id)}
                    aria-label={`Add a card to "${section.name}"`}
                    className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:size-7"
                  >
                    <Plus className="size-4" />
                  </button>

                  <Menu
                    align="end"
                    trigger={
                      <button
                        aria-label={`Options for "${section.name}"`}
                        className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:size-7"
                      >
                        <MoreHorizontal className="size-4" />
                      </button>
                    }
                  >
                    <MenuItem
                      icon={Pencil}
                      onSelect={() => {
                        setRenameValue(section.name);
                        setRenaming(section.id);
                      }}
                    >
                      Rename
                    </MenuItem>
                    <MenuSeparator />
                    <MenuItem icon={Trash2} destructive onSelect={() => removeSection(section)}>
                      Delete column
                    </MenuItem>
                  </Menu>
                </div>

                {/* ---- Cards ---- */}
                <div className="flex max-h-[calc(100dvh-18rem)] flex-col gap-2 overflow-y-auto p-2">
                  {items.length === 0 && drag?.target.column !== section.id && (
                    <p className="rounded-lg border border-dashed border-border px-3 py-6 text-center text-xs text-muted-foreground">
                      Nothing here yet
                    </p>
                  )}

                  {items.map((task) => {
                    /*
                      Same counting problem as the columns: the drop index skips
                      the card being dragged, because it is still rendered in
                      place (faded) so the column does not reflow under the
                      pointer mid-drag.
                    */
                    const isDragged = drag?.kind === "card" && drag.id === task.id;
                    const slot = items
                      .filter((t) => !(drag?.kind === "card" && drag.id === t.id))
                      .findIndex((t) => t.id === task.id);
                    const showLine =
                      drag?.kind === "card" &&
                      drag.target.column === section.id &&
                      slot >= 0 &&
                      drag.target.index === slot;

                    return (
                    <div key={task.id} className="relative">
                      {/*
                        The insertion line. It says exactly where the card lands,
                        which the old board could not express at all — it tinted
                        the whole column and always appended to the end.
                      */}
                      {showLine && <DropLine />}
                      <TaskCard
                        task={task}
                        allLabels={allLabels}
                        onChanged={reload}
                        onLabelsChanged={onLabelsChanged}
                        dragging={Boolean(isDragged)}
                        onGrab={(e) =>
                          start(e, { kind: "card", id: task.id, fromColumn: section.id })
                        }
                      />
                    </div>
                    );
                  })}

                  {drag?.kind === "card" &&
                    drag.target.column === section.id &&
                    drag.target.index >= items.filter((t) => t.id !== drag.id).length && (
                      <DropLine />
                    )}

                  {adding === section.id ? (
                    <div className="rounded-lg border border-border bg-card p-2.5">
                      <input
                        autoFocus
                        value={newTitle}
                        onChange={(e) => setNewTitle(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") addCard(section.id);
                          if (e.key === "Escape") setAdding(null);
                        }}
                        placeholder="What needs doing?"
                        className="w-full bg-transparent text-[0.8125rem] outline-none placeholder:text-muted-foreground/60"
                      />
                      <div className="mt-2.5 flex gap-1.5">
                        <button
                          onClick={() => addCard(section.id)}
                          className="rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background"
                        >
                          Add
                        </button>
                        <button
                          onClick={() => setAdding(null)}
                          className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={() => setAdding(section.id)}
                      className="flex items-center gap-1.5 rounded-lg px-2 py-2 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                    >
                      <Plus className="size-3.5" />
                      Add card
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {/* A column dropped past the last one. */}
        {drag?.kind === "column" && drag.target.index >= columns.filter((c) => c.section.id !== drag.id).length && (
          <div className="h-24 w-1 shrink-0 rounded-full bg-brand" />
        )}

        {/* ---- Add column ---- */}
        <div className="w-[15rem] shrink-0">
          {showNewSection ? (
            <div className="rounded-xl border border-border bg-card/40 p-2.5">
              <input
                autoFocus
                value={newSection}
                onChange={(e) => setNewSection(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") addSection();
                  if (e.key === "Escape") setShowNewSection(false);
                }}
                placeholder="Column name…"
                className="w-full bg-transparent px-1 text-sm outline-none placeholder:text-muted-foreground/60"
              />
              <div className="mt-2.5 flex gap-1.5 px-1">
                <button
                  onClick={addSection}
                  className="rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background"
                >
                  Add
                </button>
                <button
                  onClick={() => setShowNewSection(false)}
                  aria-label="Cancel"
                  className="rounded-md px-2 py-1 text-xs text-muted-foreground transition-colors hover:bg-accent"
                >
                  <X className="size-3.5" />
                </button>
              </div>
            </div>
          ) : (
            <button
              onClick={() => setShowNewSection(true)}
              className="flex w-full items-center gap-1.5 rounded-xl border border-dashed border-border px-3 py-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <Plus className="size-4" />
              Add column
            </button>
          )}
        </div>
      </div>

      {/*
        What the pointer is carrying. Rendered at the cursor rather than by
        moving the card itself, so the board underneath stays still and the drop
        target does not shift as the layout reflows around the gap.
      */}
      {drag && (draggedTask || draggedSection) && (
        <div
          className="pointer-events-none fixed z-[60] -translate-x-6 -translate-y-4 rotate-2 rounded-lg border border-brand/40 bg-card p-2.5 text-[0.8125rem] shadow-pop"
          style={{ left: drag.x, top: drag.y, width: drag.width }}
        >
          {draggedTask ? (
            <span className="line-clamp-2">{draggedTask.title}</span>
          ) : (
            <span className="font-semibold">{draggedSection?.name}</span>
          )}
        </div>
      )}
    </>
  );
}

/** The line that says "here". */
function DropLine() {
  return <div className="mb-2 h-0.5 w-full rounded-full bg-brand" />;
}
