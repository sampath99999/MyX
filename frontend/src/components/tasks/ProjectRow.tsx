import { useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Hash,
  MoreHorizontal,
  Pencil,
  Trash2,
  FolderInput,
  Check,
  LayoutGrid,
  List,
} from "lucide-react";
import {
  ContextMenu,
  Menu,
  MenuItem,
  MenuLabel,
  MenuSeparator,
  useContextMenu,
} from "@/components/ui/menu";
import { useConfirm } from "@/components/ui/confirm";
import { useToast } from "@/components/ui/toast";
import { api, type Project, type Space } from "@/lib/api";
import { cn } from "@/lib/utils";

/*
  A project in the tasks rail, with the actions it needs attached to it.

  Everything here used to live on the project's own page, which meant moving or
  renaming one required opening it first — and moving a project between spaces
  was not possible at all, in the UI or in the API.

  Two ways in, deliberately. Right-click is what people try on a list like this,
  and it is what was asked for; but it is invisible until tried and does not
  exist on a touchscreen, so the same items hang off a `⋯` button that appears
  on hover and is always present for a keyboard. Neither is the only route.

  Archive is not offered, though the API supports it. `GET /api/projects`
  filters `archived = 0` and nothing in the app lists archived projects, so the
  menu item would be a one-way door that looks like tidying and behaves like
  deletion.
*/
export default function ProjectRow({
  project,
  spaces,
  className,
  onChanged,
}: {
  project: Project;
  spaces: Space[];
  /** The rail's own row styling, so this matches every other entry. */
  className: (isActive: boolean) => string;
  onChanged: () => void;
}) {
  const navigate = useNavigate();
  const { at, openAt, close } = useContextMenu();
  const { confirm, confirmDialog } = useConfirm();
  const toast = useToast();
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(project.name);
  const inputRef = useRef<HTMLInputElement>(null);

  async function saveName() {
    const next = name.trim();
    setRenaming(false);
    if (!next || next === project.name) {
      setName(project.name);
      return;
    }
    await api.updateProject(project.id, { name: next });
    onChanged();
  }

  async function moveTo(space: Space) {
    if (space.id === project.space_id) return;
    await api.updateProject(project.id, { space_id: space.id });
    toast.success(`"${project.name}" moved to ${space.name}`, "Its tasks moved with it.");
    onChanged();
  }

  async function setView(view: "list" | "board") {
    await api.updateProject(project.id, { view });
    onChanged();
  }

  async function remove() {
    const ok = await confirm({
      title: `Delete "${project.name}"?`,
      description:
        project.open_count > 0
          ? `Its ${project.open_count} open task${project.open_count === 1 ? "" : "s"} move to the Inbox rather than being deleted.`
          : "The project is empty, so nothing else changes.",
      confirmLabel: "Delete project",
    });
    if (!ok) return;
    await api.deleteProject(project.id);
    toast.success(`"${project.name}" deleted`, "Any tasks it held are in the Inbox.");
    onChanged();
    navigate("/tasks");
  }

  /* One set of items, rendered into both the right-click menu and the button. */
  const items = (
    <>
      <MenuItem
        icon={Pencil}
        onSelect={() => {
          setRenaming(true);
          // The menu is still unmounting on this tick; focus after it goes.
          setTimeout(() => inputRef.current?.select(), 0);
        }}
      >
        Rename
      </MenuItem>
      <MenuItem
        icon={project.view === "board" ? List : LayoutGrid}
        onSelect={() => setView(project.view === "board" ? "list" : "board")}
      >
        {project.view === "board" ? "Show as list" : "Show as board"}
      </MenuItem>

      {spaces.length > 1 && (
        <>
          <MenuSeparator />
          <MenuLabel>
            <span className="flex items-center gap-1.5">
              <FolderInput className="size-3.5" />
              Move to
            </span>
          </MenuLabel>
          {spaces.map((s) => (
            <MenuItem
              key={s.id}
              onSelect={() => moveTo(s)}
              className={s.id === project.space_id ? "text-foreground" : undefined}
            >
              <span className="flex min-w-0 flex-1 items-center gap-2">
                <span className="shrink-0 text-sm leading-none">{s.icon}</span>
                <span className="min-w-0 flex-1 truncate">{s.name}</span>
                {s.id === project.space_id && (
                  <Check className="size-3.5 shrink-0 text-brand" />
                )}
              </span>
            </MenuItem>
          ))}
        </>
      )}

      <MenuSeparator />
      <MenuItem icon={Trash2} destructive onSelect={remove}>
        Delete project
      </MenuItem>
    </>
  );

  if (renaming) {
    return (
      <div className={className(false)}>
        <Hash className="size-4 shrink-0" style={{ color: project.color }} />
        <input
          ref={inputRef}
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={saveName}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveName();
            if (e.key === "Escape") {
              setName(project.name);
              setRenaming(false);
            }
          }}
          className="min-w-0 flex-1 rounded border border-ring bg-background px-1 py-0.5 text-sm outline-none"
        />
      </div>
    );
  }

  return (
    <div className="group/row relative">
      {confirmDialog}

      <NavLink
        to={`/tasks/project/${project.id}`}
        onContextMenu={openAt}
        className={({ isActive }) => cn(className(isActive), "pr-8")}
      >
        <Hash className="size-4 shrink-0" style={{ color: project.color }} />
        <span className="min-w-0 flex-1 truncate">{project.name}</span>
        {project.open_count > 0 && (
          <span className="tnum shrink-0 text-[10px] font-medium text-muted-foreground">
            {project.open_count}
          </span>
        )}
      </NavLink>

      {/*
        A sibling of the link rather than a child: a <button> inside an <a> is
        invalid markup and the anchor swallows the click.
      */}
      <div className="absolute right-1 top-1/2 -translate-y-1/2">
        <Menu
          align="end"
          trigger={
            <button
              aria-label={`Options for ${project.name}`}
              className={cn(
                "flex size-6 items-center justify-center rounded text-muted-foreground/70 transition-colors hover:bg-accent hover:text-foreground",
                // Always there for a keyboard and on touch, quiet until hovered
                // on a pointer.
                "opacity-0 focus-visible:opacity-100 group-hover/row:opacity-100 [@media(hover:none)]:opacity-100",
              )}
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          }
        >
          {items}
        </Menu>
      </div>

      <ContextMenu at={at} onClose={close}>
        {items}
      </ContextMenu>
    </div>
  );
}
