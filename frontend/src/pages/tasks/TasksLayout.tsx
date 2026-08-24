import { useCallback, useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import {
  Sun,
  Inbox,
  CalendarRange,
  Plus,
  Layers,
  Tag,
  Hash,
  HelpCircle,
  ChevronDown,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { api, type Space, type Project, type Label } from "@/lib/api";
import NewProjectDialog from "@/components/tasks/NewProjectDialog";
import ProjectRow from "@/components/tasks/ProjectRow";
import NewSpaceDialog from "@/components/tasks/NewSpaceDialog";
import TasksHelpDialog from "@/components/tasks/TasksHelpDialog";
import { Menu, MenuItem, MenuLabel } from "@/components/ui/menu";
import { todayISO, type TasksContextValue } from "./context";
import { cn } from "@/lib/utils";

/*
  Tasks keeps its own rail: three views, then the user's projects and labels,
  all scoped by the currently selected Space.

  The space switcher used to be a wrapping row of pills at the top of that rail.
  With four spaces it took three lines, and on a phone it was a horizontally
  scrolling strip pinned above every screen. It is one control now — the thing
  it always was, a scope selector — which frees the rail for the navigation and
  gives the phone layout a header that fits.
*/

const SPACE_KEY = "myx.tasks.space";

export default function TasksLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [spaces, setSpaces] = useState<Space[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [labels, setLabels] = useState<Label[]>([]);
  const [counts, setCounts] = useState({ today: 0, inbox: 0, upcoming: 0 });
  const [spaceId, setSpaceId] = useState<number | null>(() => {
    const saved = localStorage.getItem(SPACE_KEY);
    return saved ? Number(saved) : null;
  });
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
  }, [user, spaceId, today]);

  useEffect(() => {
    reloadAll().catch(() => {});
  }, [reloadAll]);

  function pickSpace(id: number | null) {
    setSpaceId(id);
    if (id == null) localStorage.removeItem(SPACE_KEY);
    else localStorage.setItem(SPACE_KEY, String(id));
    navigate("/tasks");
  }

  const currentSpace = useMemo(
    () => spaces.find((s) => s.id === spaceId) ?? null,
    [spaces, spaceId],
  );

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
    { to: "/tasks", end: true, label: "Today", icon: Sun, count: counts.today },
    {
      to: "/tasks/upcoming",
      end: false,
      label: "Upcoming",
      icon: CalendarRange,
      count: counts.upcoming,
    },
    { to: "/tasks/inbox", end: false, label: "Inbox", icon: Inbox, count: counts.inbox },
  ];

  const spaceSwitcher = (
    <Menu
      align="start"
      className="min-w-0"
      trigger={
        <button className="flex h-9 w-full min-w-0 items-center gap-2 rounded-md border border-border px-2.5 text-sm font-medium transition-colors hover:bg-accent">
          {currentSpace ? (
            <span className="shrink-0 text-base leading-none">{currentSpace.icon}</span>
          ) : (
            <Layers className="size-4 shrink-0 text-muted-foreground" />
          )}
          <span className="min-w-0 flex-1 truncate text-left">
            {currentSpace ? currentSpace.name : "All spaces"}
          </span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </button>
      }
    >
      <MenuLabel>Scope</MenuLabel>
      <MenuItem icon={Layers} onSelect={() => pickSpace(null)}>
        All spaces
      </MenuItem>
      {spaces.map((s) => (
        <MenuItem key={s.id} onSelect={() => pickSpace(s.id)}>
          <span className="flex items-center gap-2">
            <span className="text-base leading-none">{s.icon}</span>
            {s.name}
          </span>
        </MenuItem>
      ))}
    </Menu>
  );

  /*
    "New space" is a button beside the switcher rather than the last row of it.
    A dialog opened from inside the menu unmounts with the menu the instant the
    row is clicked, so it would never appear.
  */
  const newSpaceButton = (
    <NewSpaceDialog
      onCreated={reloadAll}
      trigger={
        <button
          aria-label="New space"
          title="New space"
          className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Plus className="size-4" />
        </button>
      }
    />
  );

  const navItem = (isActive: boolean) =>
    cn(
      "flex items-center gap-2.5 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
      isActive
        ? "bg-accent text-foreground"
        : "text-muted-foreground hover:bg-accent/60 hover:text-foreground",
    );

  return (
    <div className="flex min-h-full">
      {/* ---------- Tasks rail ---------- */}
      <aside className="sticky top-0 hidden max-h-dvh w-60 shrink-0 flex-col gap-5 self-start overflow-y-auto border-r border-border p-3 md:flex">
        <div className="flex items-center gap-1.5">
          {spaceSwitcher}
          {newSpaceButton}
          <TasksHelpDialog
            trigger={
              <button
                aria-label="About Tasks"
                className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
              >
                <HelpCircle className="size-4" />
              </button>
            }
          />
        </div>

        <nav className="flex flex-col gap-0.5">
          {views.map((v) => (
            <NavLink key={v.to} to={v.to} end={v.end} className={({ isActive }) => navItem(isActive)}>
              <v.icon className="size-4 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{v.label}</span>
              {v.count > 0 && (
                <span className="tnum shrink-0 rounded-full bg-secondary px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                  {v.count}
                </span>
              )}
            </NavLink>
          ))}
        </nav>

        {/* Projects */}
        <div>
          <div className="mb-1.5 flex items-center justify-between px-2.5">
            <span className="eyebrow">Projects</span>
            <NewProjectDialog
              spaces={spaces}
              defaultSpaceId={spaceId ?? spaces[0]?.id}
              onCreated={reloadAll}
              trigger={
                <button
                  aria-label="New project"
                  className="text-muted-foreground transition-colors hover:text-foreground"
                >
                  <Plus className="size-3.5" />
                </button>
              }
            />
          </div>
          <div className="flex flex-col gap-0.5">
            {projects.length === 0 ? (
              <p className="px-2.5 py-1.5 text-xs text-muted-foreground/70">
                No projects in this space yet.
              </p>
            ) : (
              projects.map((p) => (
                <ProjectRow
                  key={p.id}
                  project={p}
                  spaces={spaces}
                  className={navItem}
                  onChanged={reloadAll}
                />
              ))
            )}
          </div>
        </div>

        {/* Labels */}
        {labels.length > 0 && (
          <div>
            <div className="mb-1.5 px-2.5">
              <span className="eyebrow">Labels</span>
            </div>
            <div className="flex flex-col gap-0.5">
              {labels.map((l) => (
                <NavLink
                  key={l.id}
                  to={`/tasks/label/${l.id}`}
                  className={({ isActive }) => navItem(isActive)}
                >
                  <Tag className="size-3.5 shrink-0" style={{ color: l.color }} />
                  <span className="min-w-0 flex-1 truncate">{l.name}</span>
                </NavLink>
              ))}
            </div>
          </div>
        )}
      </aside>

      {/* ---------- Content ---------- */}
      <div className="min-w-0 flex-1">
        {/*
          The phone header. It carries the two things the rail carries and the
          app header cannot: which space you are scoped to, and how to reach the
          three views without a sidebar.
        */}
        <div className="glass-bar sticky top-0 z-10 border-b border-border md:hidden">
          <div className="flex items-center gap-2 px-3 py-2.5">
            <div className="min-w-0 flex-1">{spaceSwitcher}</div>
            <NewProjectDialog
              spaces={spaces}
              defaultSpaceId={spaceId ?? spaces[0]?.id}
              onCreated={reloadAll}
              trigger={
                <button
                  aria-label="New project"
                  className="flex size-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  <Plus className="size-4" />
                </button>
              }
            />
          </div>
          <div className="flex gap-1 overflow-x-auto px-3 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {views.map((v) => (
              <NavLink
                key={v.to}
                to={v.to}
                end={v.end}
                className={({ isActive }) =>
                  cn(
                    /* 30px tall on a phone, which is where this row only ever
                       appears. h-9 puts it in range of a thumb without making
                       the strip any wider. */
                    "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[0.8125rem] font-medium transition-colors",
                    isActive
                      ? "border-transparent bg-foreground text-background"
                      : "border-border text-muted-foreground",
                  )
                }
              >
                <v.icon className="size-3.5" />
                {v.label}
                {v.count > 0 && <span className="tnum">{v.count}</span>}
              </NavLink>
            ))}

            {/*
              Projects and labels, on a phone.

              The rail that holds these is `hidden md:flex`, and this strip only
              ever carried the three views — so on a phone you could create a
              project from the button above and then have no way whatsoever to
              open it, and labels did not exist at all. Half the module was
              unreachable on the device the app is mostly used on.

              They join the same scroller rather than getting rows of their own:
              they are more destinations, the strip already scrolls sideways,
              and a phone has no vertical space to spend on a second bar. The
              dividers are what stop it reading as one undifferentiated run of
              pills.
            */}
            {projects.length > 0 && (
              <>
                <span aria-hidden className="mx-0.5 my-1.5 w-px shrink-0 bg-border" />
                {projects.map((p) => (
                  <NavLink
                    key={p.id}
                    to={`/tasks/project/${p.id}`}
                    className={({ isActive }) =>
                      cn(
                        "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[0.8125rem] font-medium transition-colors",
                        isActive
                          ? "border-transparent bg-foreground text-background"
                          : "border-border text-muted-foreground",
                      )
                    }
                  >
                    <Hash className="size-3.5 shrink-0" style={{ color: p.color }} />
                    <span className="max-w-[9rem] truncate">{p.name}</span>
                    {p.open_count > 0 && <span className="tnum">{p.open_count}</span>}
                  </NavLink>
                ))}
              </>
            )}

            {labels.length > 0 && (
              <>
                <span aria-hidden className="mx-0.5 my-1.5 w-px shrink-0 bg-border" />
                {labels.map((l) => (
                  <NavLink
                    key={l.id}
                    to={`/tasks/label/${l.id}`}
                    className={({ isActive }) =>
                      cn(
                        "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[0.8125rem] font-medium transition-colors",
                        isActive
                          ? "border-transparent bg-foreground text-background"
                          : "border-border text-muted-foreground",
                      )
                    }
                  >
                    <Tag className="size-3.5 shrink-0" style={{ color: l.color }} />
                    <span className="max-w-[9rem] truncate">{l.name}</span>
                  </NavLink>
                ))}
              </>
            )}
          </div>
        </div>

        {/*
          The outlet renders straight away.

          Both of these modules used to hold it behind a spinner until the
          layout's own fetch — spaces, projects and labels here; folders and
          tags in Notes — came back. Nothing below actually needed that: every
          child route reads the filters it queries with from local state that
          exists on the first render, and every one of them has its own loading
          state. So the spinner was not covering a gap, it was creating one:
          the child's request could not start until the layout's had finished,
          which serialised two calls that have no reason to wait for each other.

          Money never did this, which is why Notes and Tasks were the only two
          places in the app that flashed a spinner on the way in.
        */}
        <Outlet context={ctx} />
      </div>
    </div>
  );
}
