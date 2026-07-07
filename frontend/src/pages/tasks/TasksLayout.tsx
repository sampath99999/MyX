import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { LogOut, Sun, Inbox, CalendarRange, Hash, Plus, Layers, Loader2, Tag, HelpCircle } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api, type Space, type Project, type Label } from "@/lib/api";
import NewProjectDialog from "@/components/tasks/NewProjectDialog";
import NewSpaceDialog from "@/components/tasks/NewSpaceDialog";
import TasksHelpDialog from "@/components/tasks/TasksHelpDialog";
import { todayISO, type TasksContextValue } from "./context";
import { cn } from "@/lib/utils";

const SPACE_KEY = "myx.tasks.space";

export default function TasksLayout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const [spaces, setSpaces] = useState<Space[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [counts, setCounts] = useState({ today: 0, inbox: 0, upcoming: 0 });
  const [spaceId, setSpaceId] = useState<number | null>(() => {
    const saved = localStorage.getItem(SPACE_KEY);
    return saved ? Number(saved) : null;
  });
  const [ready, setReady] = useState(false);
  const today = todayISO();

  const reloadAll = useCallback(async () => {
    if (!user) return;
    const [spacesRes, projRes, labelRes, countRes] = await Promise.all([
      api.listSpaces(),
      api.listProjects(spaceId ?? undefined),
      api.listLabels(),
      api.taskCounts({ space_id: spaceId ?? undefined, today }),
    ]);
    setSpaces(spacesRes.spaces);
    setProjects(projRes.projects);
    setLabels(labelRes.labels);
    setCounts(countRes);
    setReady(true);
  }, [user, spaceId, today]);

  useEffect(() => {
    reloadAll().catch(() => setReady(true));
  }, [reloadAll]);

  function pickSpace(id: number | null) {
    setSpaceId(id);
    if (id == null) localStorage.removeItem(SPACE_KEY);
    else localStorage.setItem(SPACE_KEY, String(id));
    navigate("/tasks");
  }

  const currentSpace = useMemo(() => spaces.find((s) => s.id === spaceId) ?? null, [spaces, spaceId]);

  const ctx: TasksContextValue = {
    spaceId,
    spaces,
    currentSpace,
    projects,
    labels,
    counts,
    today,
    reloadAll,
  };

  const views = [
    { to: "/tasks", end: true, label: "Today", icon: Sun, count: counts.today, accent: "text-amber-400" },
    { to: "/tasks/upcoming", end: false, label: "Upcoming", icon: CalendarRange, count: counts.upcoming, accent: "text-violet-400" },
    { to: "/tasks/inbox", end: false, label: "Inbox", icon: Inbox, count: counts.inbox, accent: "text-sky-400" },
  ];

  const spacePills = (
    <>
      <button
        onClick={() => pickSpace(null)}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors",
          spaceId == null ? "border-primary/40 bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:bg-accent",
        )}
      >
        <Layers className="h-3.5 w-3.5" /> All
      </button>
      {spaces.map((s) => (
        <button
          key={s.id}
          onClick={() => pickSpace(s.id)}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm font-medium transition-colors",
            spaceId === s.id ? "border-primary/40 bg-primary/15 text-foreground" : "border-border text-muted-foreground hover:bg-accent",
          )}
        >
          <span>{s.icon}</span>
          {s.name}
        </button>
      ))}
    </>
  );

  return (
    <div className="flex min-h-full">
      {/* ---------- Tasks sidebar ---------- */}
      <aside className="hidden md:flex md:w-64 shrink-0 flex-col gap-4 border-r border-border/50 p-4 sticky top-0 self-start max-h-dvh overflow-y-auto">
        <div>
          <div className="mb-2 flex items-center justify-between px-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Spaces</span>
            <div className="flex items-center gap-1.5">
              <TasksHelpDialog
                trigger={
                  <button className="text-muted-foreground hover:text-foreground" title="About Tasks">
                    <HelpCircle className="h-3.5 w-3.5" />
                  </button>
                }
              />
              <NewSpaceDialog
                onCreated={reloadAll}
                trigger={
                  <button className="text-muted-foreground hover:text-foreground" title="New space">
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                }
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">{spacePills}</div>
        </div>

        <nav className="flex flex-col gap-0.5">
          {views.map((v) => (
            <NavLink
              key={v.to}
              to={v.to}
              end={v.end}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                  isActive ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                )
              }
            >
              <v.icon className={cn("h-4 w-4", v.accent)} />
              <span className="flex-1">{v.label}</span>
              {v.count > 0 && (
                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
                  {v.count}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Projects */}
        <div>
          <div className="mb-1.5 flex items-center justify-between px-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Projects</span>
            <NewProjectDialog
              spaces={spaces}
              defaultSpaceId={spaceId ?? spaces[0]?.id}
              onCreated={reloadAll}
              trigger={
                <button className="text-muted-foreground hover:text-foreground" title="New project">
                  <Plus className="h-3.5 w-3.5" />
                </button>
              }
            />
          </div>
          <div className="flex flex-col gap-0.5">
            {projects.length === 0 ? (
              <p className="px-2.5 py-2 text-xs text-muted-foreground/70">No projects yet.</p>
            ) : (
              projects.map((p) => (
                <NavLink
                  key={p.id}
                  to={`/tasks/project/${p.id}`}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm font-medium transition-colors",
                      isActive ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )
                  }
                >
                  <Hash className="h-4 w-4" style={{ color: p.color }} />
                  <span className="flex-1 truncate">{p.name}</span>
                  {p.open_count > 0 && <span className="text-[10px] font-semibold text-muted-foreground">{p.open_count}</span>}
                </NavLink>
              ))
            )}
          </div>
        </div>

        {/* Labels */}
        {labels.length > 0 && (
          <div>
            <div className="mb-1.5 px-1">
              <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Labels</span>
            </div>
            <div className="flex flex-col gap-0.5">
              {labels.map((l) => (
                <NavLink
                  key={l.id}
                  to={`/tasks/label/${l.id}`}
                  className={({ isActive }) =>
                    cn(
                      "flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors",
                      isActive ? "bg-primary/15 text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground",
                    )
                  }
                >
                  <Tag className="h-3.5 w-3.5" style={{ color: l.color }} />
                  <span className="flex-1 truncate">{l.name}</span>
                </NavLink>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* ---------- Content ---------- */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center justify-between gap-2 border-b border-border/50 glass px-4 py-3 md:hidden">
          <div className="flex items-center gap-1.5 overflow-x-auto">{spacePills}</div>
          <button onClick={logout} className="shrink-0 text-muted-foreground" title="Sign out">
            <LogOut className="h-5 w-5" />
          </button>
        </div>

        {!ready ? (
          <div className="flex items-center justify-center py-24">
            <Loader2 className="h-5 w-5 animate-spin text-primary" />
          </div>
        ) : (
          <Outlet context={ctx} />
        )}
      </div>
    </div>
  );
}
