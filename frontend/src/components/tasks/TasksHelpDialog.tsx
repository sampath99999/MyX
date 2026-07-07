import { type ReactNode } from "react";
import { Layers, FolderKanban, Sun, Tag, Sparkles, ExternalLink } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";

const REFERENCES = [
  {
    label: "Things 3 — Areas of Responsibility",
    url: "https://culturedcode.com/things/support/articles/2803578/",
    note: "The model our Spaces are based on.",
  },
  {
    label: "Getting Things Done (GTD) — Todoist guide",
    url: "https://www.todoist.com/productivity-methods/getting-things-done",
    note: "Today / Upcoming / Inbox workflow.",
  },
  {
    label: "Kanban boards explained — Atlassian",
    url: "https://www.atlassian.com/agile/kanban/boards",
    note: "The board view (To do · Doing · Done).",
  },
];

function Row({ icon: Icon, title, children }: { icon: typeof Layers; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
        <Icon className="h-4 w-4" />
      </div>
      <div>
        <div className="text-sm font-semibold">{title}</div>
        <div className="text-sm text-muted-foreground">{children}</div>
      </div>
    </div>
  );
}

export default function TasksHelpDialog({ trigger }: { trigger: ReactNode }) {
  return (
    <Dialog>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            About Tasks
          </DialogTitle>
          <DialogDescription>
            A focused task manager that keeps your different worlds separate.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Row icon={Layers} title="Spaces keep contexts apart">
            Switch between <b>Personal</b>, <b>Work</b>, <b>Freelance</b> (or your own). Pick one and
            you only see that world; choose <b>All</b> to see everything together.
          </Row>
          <Row icon={FolderKanban} title="Projects & boards">
            Group tasks into projects. View a project as a simple <b>List</b> or a <b>Board</b>{" "}
            (To do · Doing · Done) with drag-and-drop.
          </Row>
          <Row icon={Sun} title="Today · Upcoming · Inbox">
            <b>Today</b> shows what's due (and overdue). <b>Upcoming</b> is the next few days.{" "}
            <b>Inbox</b> is for quick capture you sort later.
          </Row>
          <Row icon={Tag} title="Priorities, labels & subtasks">
            Flag tasks P1–P3, add <b>#labels</b> to filter across projects, and break a task into a
            checklist of subtasks.
          </Row>

          {/* Quick-add syntax */}
          <div className="rounded-xl border border-border/60 bg-background/40 p-4">
            <div className="text-sm font-semibold">Quick-add shortcuts</div>
            <p className="mt-1 text-xs text-muted-foreground">Type these right in the add box:</p>
            <ul className="mt-2 space-y-1.5 text-sm">
              <li>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">tomorrow</code>,{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">monday</code>,{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">in 3 days</code> — sets the due date
              </li>
              <li>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">!p1</code> …{" "}
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">!p3</code> — sets priority
              </li>
              <li>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs">#home</code> — adds a label
              </li>
            </ul>
            <p className="mt-2 text-xs text-muted-foreground">
              e.g. <code className="rounded bg-muted px-1.5 py-0.5 text-xs">Pay rent tomorrow !p1 #home</code>
            </p>
          </div>

          {/* References */}
          <div>
            <div className="mb-2 text-sm font-semibold">References &amp; inspiration</div>
            <div className="space-y-1.5">
              {REFERENCES.map((r) => (
                <a
                  key={r.url}
                  href={r.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-start gap-2 rounded-lg border border-border/60 px-3 py-2 text-sm transition-colors hover:bg-accent"
                >
                  <ExternalLink className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
                  <span>
                    <span className="font-medium text-foreground">{r.label}</span>
                    <span className="block text-xs text-muted-foreground">{r.note}</span>
                  </span>
                </a>
              ))}
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              Full design doc: <code className="rounded bg-muted px-1.5 py-0.5 text-xs">docs/TASKS_PLAN.md</code> in the repo.
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
