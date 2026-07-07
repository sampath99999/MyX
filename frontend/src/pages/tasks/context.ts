import { useOutletContext } from "react-router-dom";
import type { Space, Project, Label } from "@/lib/api";

export interface TasksContextValue {
  spaceId: number | null; // null = All Spaces
  spaces: Space[];
  currentSpace: Space | null; // null when viewing All
  projects: Project[];
  labels: Label[];
  counts: { today: number; inbox: number; upcoming: number };
  today: string; // local YYYY-MM-DD
  reloadAll: () => Promise<void>;
}

export function useTasksContext() {
  return useOutletContext<TasksContextValue>();
}

/** Local date as YYYY-MM-DD (respects the user's timezone). */
export function todayISO(): string {
  return new Date().toLocaleDateString("en-CA"); // en-CA formats as YYYY-MM-DD
}
