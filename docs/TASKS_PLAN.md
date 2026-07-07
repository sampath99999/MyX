# MyX — Tasks Module Plan

The goal: the best personal task manager you've used — and critically, **your work,
personal, and freelance tasks never bleed into each other**, while still letting you see
"everything today" when you want.

## Design philosophy (researched)

The best apps converge on one idea for separating life contexts: **Areas of
Responsibility** (Things 3) / **Spaces** (Linear) — permanent top-level containers you
*switch between*, so you only ever see one world at a time. Todoist/TickTick do it with
folders+filters; Things does it with Areas. Areas is the cleaner mental model and the one
that fits your ask.

So MyX Tasks uses a 3-level hierarchy, plus cross-cutting labels and smart views:

```
Space (Personal | Work | Freelance | +custom)   ← the big separation. You pick one.
  └─ Project (e.g. "Client X Website", "Home Reno", "Q3 Roadmap")
       └─ Section (To do · Doing · Done, or custom)
            └─ Task
                 └─ Subtasks / checklist
```

## The headline feature: Spaces

- A **Space switcher** at the top of the Tasks sidebar (like Slack workspaces).
- Selecting **Work** completely hides Personal & Freelance. No mixing.
- An **"All Spaces"** view for when you *do* want everything (e.g. Today across all).
- Each space: name, color, icon. Default three: 🏠 Personal, 💼 Work, 💻 Freelance.
- Optional later: "work hours" auto-focus that defaults you into Work 9–6.

## Views (GTD-inspired)

- **Today** — everything due/scheduled today (current space, or All).
- **Upcoming** — next 7 days, grouped by day.
- **Inbox** — quick capture, not yet filed into a project.
- **Anytime / Someday** — no date; things to do eventually.
- **Project view** — as a **List** or a **Kanban board** (toggle per project).
- **Filters / Smart lists** — by label, priority, e.g. "@calls", "P1 this week".

## Task anatomy

- Title, notes (markdown-ish)
- **Priority** P1–P4 (color flags)
- **Due date** + optional time; optional **start/scheduled date**
- **Labels/tags** (cross-cutting: @home, @errand, #urgent)
- **Subtasks / checklist**
- **Recurring** rule (daily/weekly/monthly/custom) — reuse the money recurrence engine idea
- **Reminders** (later; needs notifications)
- Belongs to a Space; optionally a Project + Section

## Premium UX (what makes it feel best-in-class)

- **Natural-language quick add**: `Pay rent tomorrow 6pm !p1 #home` → parses date, time,
  priority, label, space. One keystroke to capture (press `Q`).
- **Keyboard-first**: quick add, complete (done), navigate — all without the mouse.
- **Drag & drop**: reorder tasks, drag across Kanban sections, drag onto days.
- **Progress**: projects show X/Y done with a ring; satisfying complete animation.
- **Fast, optimistic UI**: checking a task feels instant.
- Consistent with the existing premium dark theme, glass cards, and dialogs.

## Data model (D1)

```sql
spaces      (id, user_id, name, color, icon, position, created_at)
projects    (id, user_id, space_id, name, color, view TEXT('list'|'board'),
             deadline TEXT?, archived INT, position, created_at)
sections    (id, user_id, project_id, name, position)
tasks       (id, user_id, space_id, project_id?, section_id?,
             title, notes, priority INT(1..4 = P1..P4),
             due_date TEXT?, due_time TEXT?, scheduled_date TEXT?,
             status TEXT('open'|'done'), completed_at TEXT?,
             recurrence TEXT?, recurrence_interval INT?,
             position, created_at)
subtasks    (id, task_id, title, done INT, position)
labels      (id, user_id, name, color)
task_labels (task_id, label_id)
```

Everything is scoped to `user_id` (own-table JWT auth, same as Money).

## API (Hono on Workers)

- Spaces:    `GET/POST/PATCH/DELETE /api/spaces` (+ reorder)
- Projects:  `GET/POST/PATCH/DELETE /api/projects?space_id=` (+ archive, reorder)
- Sections:  `POST/PATCH/DELETE /api/projects/:id/sections`
- Tasks:     `GET /api/tasks?space_id=&view=today|upcoming|inbox&project_id=`
             `POST/PATCH/DELETE /api/tasks`, `POST /api/tasks/:id/complete|reopen`,
             `POST /api/tasks/:id/move` (project/section/position)
- Subtasks:  `POST/PATCH/DELETE /api/tasks/:id/subtasks`
- Labels:    `GET/POST/PATCH/DELETE /api/labels`

## Frontend structure

```
/tasks                      TasksLayout (space switcher + views/projects sidebar)
  /tasks (index)            Today (current space)
  /tasks/upcoming
  /tasks/inbox
  /tasks/project/:id        Project (list or board)
  /tasks/label/:id          Label filter
```
Reuse: premium theme, Dialog, Input, Button, Card, CategoryPicker patterns.

## Phased build (one sub-feature at a time, like Money)

**Phase 1 — MVP foundation** ✅ DONE
- Spaces (create/switch; default Personal + Work), Projects, Tasks (list),
  Today + Inbox, quick-add, complete/reopen/delete

**Phase 2 — Power** ✅ DONE
- Priorities (P1–P3), labels/tags (+ label filter view), subtasks/checklist,
  Upcoming view, natural-language quick-add (`tomorrow`, `!p1`, `#label`),
  task detail dialog (edit title/notes/due/priority/labels/subtasks)

**Phase 3 — Boards** ✅ DONE
- Per-project List/Board toggle, Kanban sections (auto-seeded To do/Doing/Done),
  add columns/cards, native drag-and-drop between columns

**Phase 4 — Time**
- Recurring tasks, reminders/notifications, calendar view

**Phase 5 — Polish**
- Filters/smart lists, keyboard shortcuts, cross-space "All Today", search

## Open decisions (to confirm before building)

1. Name the top-level separation **"Spaces"** or **"Areas"**? (default: Spaces)
2. Default spaces to seed: **Personal, Work, Freelance** (editable)? 
3. Start with **Phase 1 MVP** and iterate (recommended), or build more upfront?
```
