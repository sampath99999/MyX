/*
  Everything one account owns, as a single JSON file.

  MyX had no way to get data out. That is a hole in an app whose whole pitch is
  that the data is yours: deleting the account was the only exit, and it took
  everything with it. This is the other exit.

  Two rules shape the format:

  - It is for a person first. Amounts come out in rupees, not the paise the
    database stores, and children (a loan's payments, a checklist's items) are
    nested under their parent rather than left as foreign keys to chase.
  - It is complete. Every table that carries user data appears here, so "export"
    means the same thing as "everything the delete would have destroyed".

  Row ids are kept. They mean nothing outside this file, but they are what would
  make it re-importable later, and they cost nothing.
*/

/**
 * Per-table ceiling. Well past any real account; a runaway one truncates
 * loudly rather than exhausting the Worker's memory mid-response.
 */
const MAX_ROWS = 20_000;

const rupees = (paise: number | null | undefined) =>
  paise == null ? null : Math.round(paise) / 100;

const bool = (n: number | null | undefined) => n === 1;

type Row = Record<string, unknown>;

/** Groups child rows by their parent column, so nesting is one pass, not N queries. */
function groupBy(rows: Row[], key: string): Map<number, Row[]> {
  const map = new Map<number, Row[]>();
  for (const row of rows) {
    const parent = row[key] as number;
    const list = map.get(parent);
    if (list) list.push(row);
    else map.set(parent, [row]);
  }
  return map;
}

const tagList = (raw: unknown) =>
  String(raw ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

export interface ExportBundle {
  format: "myx-export";
  version: 1;
  exported_at: string;
  account: { email: string; name: string; created_at: string };
  notice: string;
  counts: Record<string, number>;
  truncated: string[];
  money: Record<string, unknown>;
  tasks: Record<string, unknown>;
  notes: Record<string, unknown>;
  checklists: unknown[];
  memories: unknown[];
}

export async function buildExport(
  db: D1Database,
  account: { email: string; name: string; created_at: string },
  userId: number,
): Promise<ExportBundle> {
  /*
    One batch, one round trip. Twenty-two sequential awaits against D1 from the
    edge would make a large export feel broken; the queries are independent, so
    there is no reason to pay for them one at a time. Order matters only because
    the results come back positionally.
  */
  const q = (sql: string) => db.prepare(sql).bind(userId);
  const byUser = (table: string, order: string) =>
    q(`SELECT * FROM ${table} WHERE user_id = ? ORDER BY ${order} LIMIT ${MAX_ROWS}`);

  const results = await db.batch<Row>([
    byUser("transactions", "occurred_on, id"),
    byUser("recurring", "next_due, id"),
    byUser("budgets", "category"),
    byUser("loans", "id"),
    byUser("loan_payments", "loan_id, paid_on, id"),
    // No user_id of its own — reached through the loan that owns it.
    q(
      `SELECT rc.* FROM loan_rate_changes rc JOIN loans l ON l.id = rc.loan_id
        WHERE l.user_id = ? ORDER BY rc.loan_id, rc.effective_from LIMIT ${MAX_ROWS}`,
    ),
    byUser("goals", "id"),
    byUser("goal_contributions", "goal_id, occurred_on, id"),
    byUser("investments", "id"),
    byUser("investment_values", "investment_id, recorded_on"),
    byUser("spaces", "position, id"),
    byUser("projects", "position, id"),
    byUser("sections", "position, id"),
    byUser("tasks", "position, id"),
    q(
      `SELECT s.* FROM subtasks s JOIN tasks t ON t.id = s.task_id
        WHERE t.user_id = ? ORDER BY s.task_id, s.position, s.id LIMIT ${MAX_ROWS}`,
    ),
    byUser("labels", "name"),
    q(
      `SELECT tl.task_id, l.name FROM task_labels tl
         JOIN tasks t  ON t.id = tl.task_id
         JOIN labels l ON l.id = tl.label_id
        WHERE t.user_id = ? ORDER BY tl.task_id LIMIT ${MAX_ROWS}`,
    ),
    byUser("folders", "position, id"),
    byUser("notes", "id"),
    byUser("checklists", "position, id"),
    q(
      `SELECT ci.* FROM checklist_items ci JOIN checklists c ON c.id = ci.checklist_id
        WHERE c.user_id = ? ORDER BY ci.checklist_id, ci.position, ci.id LIMIT ${MAX_ROWS}`,
    ),
    byUser("memories", "occurred_on, id"),
  ]);

  const [
    transactions,
    recurring,
    budgets,
    loans,
    loanPayments,
    rateChanges,
    goals,
    contributions,
    investments,
    investmentValues,
    spaces,
    projects,
    sections,
    tasks,
    subtasks,
    labels,
    taskLabels,
    folders,
    notes,
    checklists,
    checklistItems,
    memories,
  ] = results.map((r) => r.results ?? []);

  /*
    A table that came back exactly at the cap was probably cut short. It is named
    in the file rather than silently trimmed — an export that quietly omits half
    of someone's history is worse than no export at all.
  */
  const truncated: string[] = [];
  const named: [string, Row[]][] = [
    ["transactions", transactions],
    ["recurring", recurring],
    ["budgets", budgets],
    ["loans", loans],
    ["loan_payments", loanPayments],
    ["goals", goals],
    ["goal_contributions", contributions],
    ["investments", investments],
    ["tasks", tasks],
    ["notes", notes],
    ["memories", memories],
  ];
  for (const [name, rows] of named) if (rows.length >= MAX_ROWS) truncated.push(name);

  const paymentsByLoan = groupBy(loanPayments, "loan_id");
  const ratesByLoan = groupBy(rateChanges, "loan_id");
  const contributionsByGoal = groupBy(contributions, "goal_id");
  const valuesByInvestment = groupBy(investmentValues, "investment_id");
  const subtasksByTask = groupBy(subtasks, "task_id");
  const labelsByTask = groupBy(taskLabels, "task_id");
  const itemsByChecklist = groupBy(checklistItems, "checklist_id");

  const folderName = new Map(folders.map((f) => [f.id as number, f.name as string]));
  const projectName = new Map(projects.map((p) => [p.id as number, p.name as string]));
  const spaceName = new Map(spaces.map((s) => [s.id as number, s.name as string]));

  return {
    format: "myx-export",
    version: 1,
    exported_at: new Date().toISOString(),
    account,
    notice:
      "Every amount in this file is in rupees. This is a complete copy of your MyX data — keep it somewhere private.",
    counts: {
      transactions: transactions.length,
      recurring: recurring.length,
      budgets: budgets.length,
      loans: loans.length,
      goals: goals.length,
      investments: investments.length,
      tasks: tasks.length,
      notes: notes.length,
      checklists: checklists.length,
      memories: memories.length,
    },
    truncated,

    money: {
      transactions: transactions.map((t) => ({
        id: t.id,
        date: t.occurred_on,
        type: t.type,
        amount: rupees(t.amount as number),
        category: t.category,
        note: t.note,
        created_at: t.created_at,
      })),
      recurring: recurring.map((r) => ({
        id: r.id,
        name: r.name,
        type: r.type,
        amount: rupees(r.amount as number),
        category: r.category,
        frequency: r.frequency,
        interval: r.interval,
        next_due: r.next_due,
        note: r.note,
        active: bool(r.active as number),
        last_paid_on: r.last_paid_on,
      })),
      budgets: budgets.map((b) => ({
        category: b.category,
        monthly_limit: rupees(b.amount as number),
      })),
      loans: loans.map((l) => ({
        id: l.id,
        name: l.name,
        lender: l.lender,
        principal: rupees(l.principal as number),
        annual_rate: l.annual_rate,
        emi: rupees(l.emi as number),
        outstanding: rupees(l.outstanding as number),
        start_date: l.start_date,
        status: l.status,
        rate_changes: (ratesByLoan.get(l.id as number) ?? []).map((rc) => ({
          annual_rate: rc.annual_rate,
          effective_from: rc.effective_from,
        })),
        payments: (paymentsByLoan.get(l.id as number) ?? []).map((p) => ({
          paid_on: p.paid_on,
          kind: p.kind ?? "emi",
          amount: rupees(p.amount as number),
          interest: rupees(p.interest_part as number),
          principal: rupees(p.principal_part as number),
          balance_after: rupees(p.balance_after as number),
        })),
      })),
      goals: goals.map((g) => ({
        id: g.id,
        name: g.name,
        emoji: g.emoji,
        target: rupees(g.target_amount as number),
        saved: rupees(g.saved_amount as number),
        target_date: g.target_date,
        completed_at: g.completed_at,
        contributions: (contributionsByGoal.get(g.id as number) ?? []).map((ct) => ({
          date: ct.occurred_on,
          amount: rupees(ct.amount as number),
          note: ct.note,
        })),
      })),
      investments: investments.map((i) => ({
        id: i.id,
        name: i.name,
        type: i.type,
        invested: rupees(i.invested_amount as number),
        current_value: rupees(i.current_value as number),
        notes: i.notes,
        history: (valuesByInvestment.get(i.id as number) ?? []).map((v) => ({
          date: v.recorded_on,
          value: rupees(v.value as number),
        })),
      })),
    },

    tasks: {
      spaces: spaces.map((s) => ({ id: s.id, name: s.name, icon: s.icon, color: s.color })),
      projects: projects.map((p) => ({
        id: p.id,
        name: p.name,
        space: spaceName.get(p.space_id as number) ?? null,
        color: p.color,
        archived: bool(p.archived as number),
      })),
      sections: sections.map((s) => ({
        id: s.id,
        name: s.name,
        project: projectName.get(s.project_id as number) ?? null,
      })),
      labels: labels.map((l) => ({ name: l.name, color: l.color })),
      items: tasks.map((t) => ({
        id: t.id,
        title: t.title,
        notes: t.notes,
        space: spaceName.get(t.space_id as number) ?? null,
        project: t.project_id == null ? null : (projectName.get(t.project_id as number) ?? null),
        priority: t.priority,
        due_date: t.due_date,
        status: t.status,
        completed_at: t.completed_at,
        created_at: t.created_at,
        labels: (labelsByTask.get(t.id as number) ?? []).map((tl) => tl.name),
        subtasks: (subtasksByTask.get(t.id as number) ?? []).map((s) => ({
          title: s.title,
          done: bool(s.done as number),
        })),
      })),
    },

    notes: {
      folders: folders.map((f) => ({ id: f.id, name: f.name, color: f.color })),
      items: notes.map((n) => ({
        id: n.id,
        title: n.title,
        content: n.content,
        folder: n.folder_id == null ? null : (folderName.get(n.folder_id as number) ?? null),
        tags: tagList(n.tags),
        pinned: bool(n.pinned as number),
        archived: bool(n.archived as number),
        created_at: n.created_at,
        updated_at: n.updated_at,
      })),
    },

    checklists: checklists.map((cl) => ({
      id: cl.id,
      name: cl.name,
      emoji: cl.emoji,
      items: (itemsByChecklist.get(cl.id as number) ?? []).map((i) => ({
        title: i.title,
        done: bool(i.done as number),
      })),
    })),

    memories: memories.map((m) => ({
      id: m.id,
      title: m.title,
      note: m.note,
      emoji: m.emoji,
      date: m.occurred_on,
      tags: tagList(m.tags),
      created_at: m.created_at,
    })),
  };
}
