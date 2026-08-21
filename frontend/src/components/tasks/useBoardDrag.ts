import { useCallback, useEffect, useRef, useState } from "react";

/*
  Dragging for the board, on pointer events rather than HTML5 drag-and-drop.

  The board used `draggable` with onDragStart/onDrop, which has two problems
  that no amount of styling fixes.

  It does not exist on touch. `dragstart` is never fired by a touchscreen, so on
  a phone or a tablet the board was a read-only picture of the work — and this
  app is used on a phone.

  And it can only answer "which column did you let go over", not "where in it".
  The old drop handler appended to the end of the target column every time, so
  there was no way to say a card belongs third rather than last. Reordering
  inside a column was impossible by construction.

  Pointer events give both: they are the same API for mouse, touch and stylus,
  and the pointer's position at every move is enough to compute an exact
  insertion index by comparing it against the midpoints of the cards on screen.

  Dragging starts from an explicit handle. That is what makes touch work at all:
  the handle carries `touch-action: none` so the browser hands us the gesture
  instead of scrolling the column, and everything else on the card keeps its
  normal scrolling behaviour.
*/

export interface DragOrigin {
  /** What is being dragged. */
  kind: "card" | "column";
  id: number;
  /** Cards only: the column the drag started in. */
  fromColumn?: number;
}

export interface DropTarget {
  /** Cards: the column under the pointer. Columns: unused. */
  column: number | null;
  /** Insertion index within that column, or among the columns. */
  index: number;
}

export interface DragState extends DragOrigin {
  x: number;
  y: number;
  /** Size of the thing being dragged, so the ghost matches it. */
  width: number;
  target: DropTarget;
}

/** Rects the hook hit-tests against, registered by the board as it renders. */
export interface DragGeometry {
  /** One entry per column, left to right. */
  columns: { id: number; el: HTMLElement }[];
  /** Cards in a given column, top to bottom. */
  cardsIn: (columnId: number) => HTMLElement[];
}

export function useBoardDrag({
  geometry,
  onDropCard,
  onDropColumn,
}: {
  geometry: () => DragGeometry;
  onDropCard: (taskId: number, fromColumn: number, toColumn: number, index: number) => void;
  onDropColumn: (sectionId: number, index: number) => void;
}) {
  const [drag, setDrag] = useState<DragState | null>(null);
  /*
    The live drag also lives in a ref. The window listeners below are attached
    once per drag, so the closure they capture would otherwise hold the state as
    it was when the drag began and every drop would use a stale target.
  */
  const dragRef = useRef<DragState | null>(null);
  const set = (next: DragState | null) => {
    dragRef.current = next;
    setDrag(next);
  };

  /** Where would a card dropped at this point land? */
  const resolveCard = useCallback(
    (x: number, y: number, current: DragState): DropTarget => {
      const { columns, cardsIn } = geometry();

      // The column under the pointer, or the nearest one if the pointer has
      // wandered off the board sideways — letting go over the gutter should not
      // silently cancel a drag.
      let column = columns.find((c) => {
        const r = c.el.getBoundingClientRect();
        return x >= r.left && x <= r.right;
      });
      if (!column && columns.length) {
        column = columns.reduce((best, c) => {
          const d = (el: HTMLElement) => {
            const r = el.getBoundingClientRect();
            return x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
          };
          return d(c.el) < d(best.el) ? c : best;
        });
      }
      if (!column) return { column: null, index: 0 };

      /*
        Index by midpoint: the card sits above every card whose middle is below
        the pointer. The card being dragged is skipped, because it is still in
        the DOM at its old place and would otherwise count itself.
      */
      const cards = cardsIn(column.id).filter(
        (el) => Number(el.dataset.taskId) !== current.id,
      );
      let index = cards.length;
      for (let i = 0; i < cards.length; i += 1) {
        const r = cards[i].getBoundingClientRect();
        if (y < r.top + r.height / 2) {
          index = i;
          break;
        }
      }
      return { column: column.id, index };
    },
    [geometry],
  );

  /** Where would a column dropped at this x land? */
  const resolveColumn = useCallback(
    (x: number, current: DragState): DropTarget => {
      const { columns } = geometry();
      const others = columns.filter((c) => c.id !== current.id);
      let index = others.length;
      for (let i = 0; i < others.length; i += 1) {
        const r = others[i].el.getBoundingClientRect();
        if (x < r.left + r.width / 2) {
          index = i;
          break;
        }
      }
      return { column: null, index };
    },
    [geometry],
  );

  const start = useCallback(
    (e: React.PointerEvent, origin: DragOrigin) => {
      // Left button (or any touch/pen contact) only.
      if (e.button !== 0) return;
      e.preventDefault();
      const host = (e.currentTarget as HTMLElement).closest<HTMLElement>(
        origin.kind === "card" ? "[data-task-id]" : "[data-column-id]",
      );
      const width = host?.getBoundingClientRect().width ?? 280;
      set({
        ...origin,
        x: e.clientX,
        y: e.clientY,
        width,
        target: { column: origin.fromColumn ?? null, index: 0 },
      });
    },
    [],
  );

  useEffect(() => {
    if (!drag) return;

    const move = (e: PointerEvent) => {
      const current = dragRef.current;
      if (!current) return;
      const target =
        current.kind === "card"
          ? resolveCard(e.clientX, e.clientY, current)
          : resolveColumn(e.clientX, current);
      set({ ...current, x: e.clientX, y: e.clientY, target });
    };

    const finish = () => {
      const current = dragRef.current;
      set(null);
      if (!current) return;
      if (current.kind === "card") {
        if (current.target.column == null || current.fromColumn == null) return;
        onDropCard(current.id, current.fromColumn, current.target.column, current.target.index);
      } else {
        onDropColumn(current.id, current.target.index);
      }
    };

    // A drag that is interrupted — Escape, the tab losing focus, the browser
    // cancelling the pointer — must put the card back, not drop it somewhere.
    const cancel = () => set(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") cancel();
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", finish);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("keydown", onKey);
    /*
      While a drag is live the whole page stops selecting text. Without this,
      moving the pointer across the board highlights every card title it passes,
      which looks like a rendering fault.
    */
    const previousSelect = document.body.style.userSelect;
    document.body.style.userSelect = "none";

    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", finish);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("keydown", onKey);
      document.body.style.userSelect = previousSelect;
    };
    // `drag` is in the deps only to re-run when a drag begins or ends; the
    // moving parts are read from the ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [Boolean(drag), resolveCard, resolveColumn, onDropCard, onDropColumn]);

  return { drag, start };
}
