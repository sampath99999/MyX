import type { ReactNode } from "react";

/*
  The label that appears beside an item in the collapsed sidebar.

  `title` was doing this job, which means a system tooltip after roughly a
  second — long enough that the usual response is to give up and expand the
  rail, which defeats the point of collapsing it. This one appears immediately
  and is drawn in the app's own colours.

  It only renders in the collapsed state, where the nav drops its scroller so
  the label is not clipped at the rail's edge: `overflow-y: auto` forces the
  other axis to clip as well, and there is nothing to scroll in a rail of seven
  icons anyway.

  Presentational only. Every item that uses it already carries its real name in
  an `aria-label` or its own text, so this is `aria-hidden` rather than a second
  thing for a screen reader to announce.
*/
export default function RailLabel({ children }: { children: ReactNode }) {
  return (
    <span
      aria-hidden
      className="pointer-events-none absolute left-full top-1/2 z-50 ml-2 -translate-y-1/2 translate-x-1 whitespace-nowrap rounded-md border border-border bg-popover px-2 py-1 text-xs font-medium text-popover-foreground opacity-0 shadow-pop transition-[opacity,transform] duration-150 group-hover:translate-x-0 group-hover:opacity-100"
    >
      {children}
    </span>
  );
}
