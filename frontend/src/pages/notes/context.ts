import { useOutletContext } from "react-router-dom";
import type { Folder } from "@/lib/api";

export type NotesView = "all" | "pinned" | "trash";

export interface NotesContextValue {
  folderId: number | null;
  view: NotesView;
  tag: string | null;
  folders: Folder[];
  tags: string[];
  reloadMeta: () => Promise<void>;
}

export function useNotesContext() {
  return useOutletContext<NotesContextValue>();
}

/** Relative "time ago" for note timestamps (stored as UTC 'YYYY-MM-DD HH:MM:SS'). */
export function timeAgo(ts: string): string {
  const d = new Date(ts.replace(" ", "T") + "Z");
  const sec = Math.floor((Date.now() - d.getTime()) / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return d.toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });
}
