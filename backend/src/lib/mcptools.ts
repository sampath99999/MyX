/*
  The tools MyX exposes over MCP, and nothing else.

  Every tool here is a description of an existing MyX API call — a method, a
  path, a body — never its own copy of the logic. routes/mcp.ts takes one of
  these and dispatches it back through the same Hono app the browser talks to,
  carrying the same Authorization header, so a tool call and a click in the web
  UI run identical code down to the SQL.

  That indirection is the whole design. The alternative — MCP handlers querying
  D1 directly — means every validation rule, every rupees-to-paise conversion and
  every user_id predicate exists twice, and the copies drift the first time one
  side is fixed. Here they cannot: there is one implementation and one place a
  bug can be.

  Two things shape the list itself:

  - It is small on purpose. An agent loads every description below into its
    context before it can use any of them, so one tool per endpoint (there are
    over a hundred) would spend the context it is meant to serve. These are the
    verbs someone actually asks an assistant for.
  - Nothing deletes. Writing is create and update; MyX has no undo for most
    modules, and an agent that misreads "clear my list" should not be able to
    take a year of transactions with it. Deletion stays a deliberate act in the
    app.
*/

/** Arguments as they arrive from the client — unvalidated by definition. */
export type ToolArgs = Record<string, unknown>;

export interface McpTool {
  name: string;
  description: string;
  inputSchema: {
    type: "object";
    properties: Record<string, unknown>;
    required?: string[];
  };
  /** Write tools are hidden from read-only keys. See routes/mcp.ts. */
  write?: boolean;
  method: "GET" | "POST" | "PATCH";
  /** The MyX API path this maps to, built from the arguments. */
  path: (args: ToolArgs) => string;
  /** The JSON body, for the tools that send one. */
  body?: (args: ToolArgs) => Record<string, unknown>;
}

/** A bad argument. Reported to the model as a tool error, not an HTTP failure. */
export class ToolArgumentError extends Error {}

/* ---- argument helpers ---------------------------------------------------- */

/**
 * An integer argument destined for a URL path.
 *
 * Validated rather than interpolated: these land in the path, so a string like
 * "1/../../admin" would otherwise be a way to aim a tool call at a route it was
 * never meant to reach.
 */
function pathId(args: ToolArgs, key: string): number {
  const value = Number(args[key]);
  if (!Number.isInteger(value)) throw new ToolArgumentError(`${key} must be a whole number`);
  return value;
}

/** A path with only the arguments that were actually supplied in its query. */
function withQuery(base: string, params: Record<string, unknown>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") continue;
    search.set(key, String(value));
  }
  const query = search.toString();
  return query ? `${base}?${query}` : base;
}

/** A body with the untouched fields left out, so a PATCH never clears them. */
function present(args: ToolArgs, keys: string[]): Record<string, unknown> {
  const body: Record<string, unknown> = {};
  for (const key of keys) if (args[key] !== undefined) body[key] = args[key];
  return body;
}

/* ---- schema helpers ------------------------------------------------------ */

const str = (description: string) => ({ type: "string", description });
const int = (description: string) => ({ type: "integer", description });
const money = (description: string) => ({ type: "number", description });
const flag = (description: string) => ({ type: "boolean", description });
const oneOf = (values: string[], description: string) => ({
  type: "string",
  enum: values,
  description,
});
const strings = (description: string) => ({
  type: "array",
  items: { type: "string" },
  description,
});

/** Repeated in enough schemas to be worth naming. */
const DATE = "A date as YYYY-MM-DD.";
const RUPEES = "In rupees, not paise — 250.50 means ₹250.50.";

/* ---- the tools ----------------------------------------------------------- */

export const TOOLS: McpTool[] = [
  /* ---- across everything ---- */
  {
    name: "myx_search",
    description:
      "Search every module at once — transactions, tasks, notes, memories, checklists, loans, goals, investments and bills. The first thing to reach for when you know what something is called but not where it lives. Needs at least two characters.",
    inputSchema: {
      type: "object",
      properties: { query: str("What to look for.") },
      required: ["query"],
    },
    method: "GET",
    path: (a) => withQuery("/api/search", { q: a.query }),
  },
  {
    name: "myx_dashboard",
    description:
      "The home screen in one call: balance, this month's income and spending against last month's, open and overdue task counts, tasks due today, bills due within a week, and recent transactions. Start here for 'how am I doing' or 'what needs me today'.",
    inputSchema: { type: "object", properties: {} },
    method: "GET",
    path: () => "/api/dashboard/summary",
  },

  /* ---- money ---- */
  {
    name: "myx_transactions_list",
    description:
      "List transactions, newest first, with totals for whatever the filters matched. All filters are optional.",
    inputSchema: {
      type: "object",
      properties: {
        type: oneOf(["income", "expense"], "Only income, or only expenses."),
        from: str(`Earliest date, inclusive. ${DATE}`),
        to: str(`Latest date, inclusive. ${DATE}`),
        category: str("Exact category name, e.g. 'Groceries'."),
        query: str("Free text matched against the note and the category."),
        min: money(`Smallest amount. ${RUPEES}`),
        max: money(`Largest amount. ${RUPEES}`),
        limit: int("How many to return. Default 50, maximum 200."),
        offset: int("Skip this many, for paging."),
      },
    },
    method: "GET",
    path: (a) =>
      withQuery("/api/transactions", {
        type: a.type,
        from: a.from,
        to: a.to,
        category: a.category,
        q: a.query,
        min: a.min,
        max: a.max,
        limit: a.limit,
        offset: a.offset,
      }),
  },
  {
    name: "myx_transactions_summary",
    description:
      "Current balance plus all-time and this-month income and expense totals. Cheaper than listing transactions when only the numbers are wanted.",
    inputSchema: { type: "object", properties: {} },
    method: "GET",
    path: () => "/api/transactions/summary",
  },
  {
    name: "myx_transaction_add",
    description:
      "Record money in or out. Defaults to today when no date is given. Use an existing category name where one fits — myx_transactions_list shows what the account already uses.",
    inputSchema: {
      type: "object",
      properties: {
        type: oneOf(["income", "expense"], "Which direction the money went."),
        amount: money(`How much. Must be positive. ${RUPEES}`),
        category: str("Category name, e.g. 'Groceries', 'Salary'."),
        note: str("What it was for."),
        occurred_on: str(`When it happened. ${DATE} Defaults to today.`),
      },
      required: ["type", "amount", "category"],
    },
    write: true,
    method: "POST",
    path: () => "/api/transactions",
    body: (a) => present(a, ["type", "amount", "category", "note", "occurred_on"]),
  },
  {
    name: "myx_money_dashboard",
    description:
      "The full money rollup: six-month trend, spending by category, savings rate, upcoming bills and portfolio value. Use it for questions about patterns rather than individual entries.",
    inputSchema: { type: "object", properties: {} },
    method: "GET",
    path: () => "/api/money/dashboard",
  },
  {
    name: "myx_budgets_list",
    description:
      "Monthly budget per category with what has been spent against each, and whether it is under, close, or over.",
    inputSchema: {
      type: "object",
      properties: { month: str("Which month, as YYYY-MM. Defaults to this one.") },
    },
    method: "GET",
    path: (a) => withQuery("/api/budgets", { month: a.month }),
  },
  {
    name: "myx_recurring_list",
    description:
      "Bills and subscriptions with their next due date and whether each is due, overdue or paused.",
    inputSchema: { type: "object", properties: {} },
    method: "GET",
    path: () => "/api/recurring",
  },
  {
    name: "myx_recurring_pay",
    description:
      "Mark a bill paid. This logs a real transaction for it and rolls the due date forward, so it changes the balance — confirm with the user before calling it. Pass expected_next_due (the date myx_recurring_list showed) and a repeat call is refused rather than paying twice.",
    inputSchema: {
      type: "object",
      properties: {
        id: int("The bill's id, from myx_recurring_list."),
        expected_next_due: str(`The due date you believe you are paying. ${DATE}`),
      },
      required: ["id"],
    },
    write: true,
    method: "POST",
    path: (a) => `/api/recurring/${pathId(a, "id")}/pay`,
    body: (a) => present(a, ["expected_next_due"]),
  },
  {
    name: "myx_loans_list",
    description:
      "EMI loans with outstanding principal, interest rate, EMI and progress through the schedule.",
    inputSchema: { type: "object", properties: {} },
    method: "GET",
    path: () => "/api/loans",
  },
  {
    name: "myx_goals_list",
    description: "Savings goals with target, amount saved and progress.",
    inputSchema: { type: "object", properties: {} },
    method: "GET",
    path: () => "/api/goals",
  },
  {
    name: "myx_goal_contribute",
    description:
      "Add money to a savings goal, or withdraw it with a negative amount. Goals are tracked separately from the balance, so this does not create a transaction.",
    inputSchema: {
      type: "object",
      properties: {
        id: int("The goal's id, from myx_goals_list."),
        amount: money(`How much to add; negative withdraws. ${RUPEES}`),
        occurred_on: str(`When the money moved. ${DATE} Cannot be in the future.`),
        note: str("What the contribution was."),
      },
      required: ["id", "amount"],
    },
    write: true,
    method: "POST",
    path: (a) => `/api/goals/${pathId(a, "id")}/contribute`,
    body: (a) => present(a, ["amount", "occurred_on", "note"]),
  },
  {
    name: "myx_investments_list",
    description:
      "Holdings with invested amount, current value and gain or loss, plus portfolio totals. Values are entered by hand; there is no live market data.",
    inputSchema: { type: "object", properties: {} },
    method: "GET",
    path: () => "/api/investments",
  },

  /* ---- tasks ---- */
  {
    name: "myx_spaces_list",
    description:
      "The top-level contexts tasks live in — Personal, Work and so on. Every task belongs to exactly one, so read this before creating one.",
    inputSchema: { type: "object", properties: {} },
    method: "GET",
    path: () => "/api/spaces",
  },
  {
    name: "myx_projects_list",
    description: "Projects within a space, or across all spaces when none is given.",
    inputSchema: {
      type: "object",
      properties: { space_id: int("Limit to one space, from myx_spaces_list.") },
    },
    method: "GET",
    path: (a) => withQuery("/api/projects", { space_id: a.space_id }),
  },
  {
    name: "myx_tasks_list",
    description:
      "List tasks with their labels and subtask counts. The view argument covers the three questions usually being asked: 'today' is everything due today or already overdue, 'upcoming' is everything due later, 'inbox' is open tasks not filed under a project. With no view and no filters, all open tasks come back.",
    inputSchema: {
      type: "object",
      properties: {
        view: oneOf(["today", "upcoming", "inbox"], "Which of the three standard views."),
        space_id: int("Limit to one space."),
        project_id: int("Limit to one project. Includes completed tasks."),
        label_id: int("Limit to tasks carrying one label."),
        limit: int("How many to return. Default 200, maximum 500."),
        offset: int("Skip this many, for paging."),
      },
    },
    method: "GET",
    path: (a) =>
      withQuery("/api/tasks", {
        view: a.view,
        space_id: a.space_id,
        project_id: a.project_id,
        label_id: a.label_id,
        limit: a.limit,
        offset: a.offset,
      }),
  },
  {
    name: "myx_task_add",
    description:
      "Create a task. space_id is required — call myx_spaces_list first and pick the one that matches what the task is about. Leaving project_id out puts it in the Inbox, which is the right default when the user did not name a project.",
    inputSchema: {
      type: "object",
      properties: {
        title: str("What needs doing."),
        space_id: int("Which space it belongs to, from myx_spaces_list."),
        project_id: int("Optional project, from myx_projects_list."),
        due_date: str(`When it is due. ${DATE}`),
        priority: int("1 is highest, 4 is the default."),
        notes: str("Any detail that does not belong in the title."),
      },
      required: ["title", "space_id"],
    },
    write: true,
    method: "POST",
    path: () => "/api/tasks",
    body: (a) => present(a, ["title", "space_id", "project_id", "due_date", "priority", "notes"]),
  },
  {
    name: "myx_task_update",
    description:
      "Change a task. Only the fields you pass are touched; the rest are left alone. Pass null for due_date or project_id to clear them.",
    inputSchema: {
      type: "object",
      properties: {
        id: int("The task's id."),
        title: str("New title."),
        due_date: str(`New due date, or null to clear it. ${DATE}`),
        priority: int("1 is highest, 4 is lowest."),
        notes: str("New notes, or null to clear them."),
        project_id: int("Move it to another project, or null for the Inbox."),
        space_id: int("Move it to another space."),
      },
      required: ["id"],
    },
    write: true,
    method: "PATCH",
    path: (a) => `/api/tasks/${pathId(a, "id")}`,
    body: (a) => present(a, ["title", "due_date", "priority", "notes", "project_id", "space_id"]),
  },
  {
    name: "myx_task_complete",
    description: "Tick a task off, or reopen one that was ticked off by mistake.",
    inputSchema: {
      type: "object",
      properties: {
        id: int("The task's id."),
        action: oneOf(["complete", "reopen"], "Defaults to complete."),
      },
      required: ["id"],
    },
    write: true,
    method: "POST",
    path: (a) => {
      const action = a.action === "reopen" ? "reopen" : "complete";
      return `/api/tasks/${pathId(a, "id")}/${action}`;
    },
  },

  /* ---- notes ---- */
  {
    name: "myx_notes_list",
    description:
      "List notes — titles, tags and metadata, without the full body. Use myx_note_get once you know which one you want.",
    inputSchema: {
      type: "object",
      properties: {
        query: str("Full-text search across titles and content."),
        tag: str("Only notes carrying this tag."),
        folder_id: int("Only notes in this notebook."),
        view: oneOf(["pinned", "trash"], "A special view instead of the normal list."),
      },
    },
    method: "GET",
    path: (a) =>
      withQuery("/api/notes", {
        q: a.query,
        tag: a.tag,
        folder_id: a.folder_id,
        view: a.view,
      }),
  },
  {
    name: "myx_note_get",
    description: "One note in full, including its markdown body.",
    inputSchema: {
      type: "object",
      properties: { id: int("The note's id.") },
      required: ["id"],
    },
    method: "GET",
    path: (a) => `/api/notes/${pathId(a, "id")}`,
  },
  {
    name: "myx_note_create",
    description: "Write a new note. The content is markdown.",
    inputSchema: {
      type: "object",
      properties: {
        title: str("The note's title."),
        content: str("Markdown body."),
        folder_id: int("Which notebook to file it under."),
        tags: strings("Tags to attach."),
      },
      required: ["title"],
    },
    write: true,
    method: "POST",
    path: () => "/api/notes",
    body: (a) => present(a, ["title", "content", "folder_id", "tags"]),
  },
  {
    name: "myx_note_update",
    description:
      "Change a note. Only the fields you pass are touched. Passing content replaces the whole body, so read the note first and send back the full new text rather than a fragment.",
    inputSchema: {
      type: "object",
      properties: {
        id: int("The note's id."),
        title: str("New title."),
        content: str("The complete new markdown body — this replaces, it does not append."),
        tags: strings("The complete new tag list."),
        pinned: flag("Pin or unpin it."),
        archived: flag("Move to Trash, or restore from it."),
        folder_id: int("Move it to another notebook."),
      },
      required: ["id"],
    },
    write: true,
    method: "PATCH",
    path: (a) => `/api/notes/${pathId(a, "id")}`,
    body: (a) => present(a, ["title", "content", "tags", "pinned", "archived", "folder_id"]),
  },

  /* ---- personal ---- */
  {
    name: "myx_memories_list",
    description:
      "Saved memories, newest first — moments the user chose to keep, with the date each happened and any tags. Search here before assuming something was never recorded.",
    inputSchema: {
      type: "object",
      properties: {
        query: str("Free text matched against the title and the note."),
        tag: str("Only memories carrying this tag."),
      },
    },
    method: "GET",
    path: (a) => withQuery("/api/memories", { q: a.query, tag: a.tag }),
  },
  {
    name: "myx_memory_add",
    description: "Save a memory — something worth keeping, with the date it happened.",
    inputSchema: {
      type: "object",
      properties: {
        title: str("What happened."),
        note: str("The detail worth keeping."),
        emoji: str("A single emoji for the card."),
        occurred_on: str(`When it happened. ${DATE}`),
        tags: strings("Tags to attach."),
      },
      required: ["title"],
    },
    write: true,
    method: "POST",
    path: () => "/api/memories",
    body: (a) => present(a, ["title", "note", "emoji", "occurred_on", "tags"]),
  },
  {
    name: "myx_checklists_list",
    description:
      "Reusable checklists with their items and tick state — morning routine, travel packing and the like.",
    inputSchema: { type: "object", properties: {} },
    method: "GET",
    path: () => "/api/checklists",
  },
  {
    name: "myx_checklist_item_set",
    description: "Tick or untick one item on a checklist, or rename it.",
    inputSchema: {
      type: "object",
      properties: {
        checklist_id: int("The checklist's id."),
        item_id: int("The item's id."),
        done: flag("True to tick it off, false to untick."),
        title: str("Rename the item."),
      },
      required: ["checklist_id", "item_id"],
    },
    write: true,
    method: "PATCH",
    path: (a) =>
      `/api/checklists/${pathId(a, "checklist_id")}/items/${pathId(a, "item_id")}`,
    body: (a) => present(a, ["done", "title"]),
  },
  {
    name: "myx_checklist_reset",
    description:
      "Unticks every item on a checklist, ready for the next run. This throws away the current run's progress, so confirm before calling it.",
    inputSchema: {
      type: "object",
      properties: { id: int("The checklist's id.") },
      required: ["id"],
    },
    write: true,
    method: "POST",
    path: (a) => `/api/checklists/${pathId(a, "id")}/reset`,
  },
];

/** The tools a credential may see. A read-only key is never offered the writes. */
export function toolsForScope(scope: "read" | "write"): McpTool[] {
  return scope === "write" ? TOOLS : TOOLS.filter((t) => !t.write);
}

export function findTool(name: string, scope: "read" | "write"): McpTool | undefined {
  return toolsForScope(scope).find((t) => t.name === name);
}
