// Thin API client for the MyX Worker backend.
// Base URL comes from VITE_API_URL (see .env / .env.production).

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:8787";
const TOKEN_KEY = "myx.token";

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.status = status;
  }
}

/**
 * Fired when the server rejects our token — expired, or revoked by a logout on
 * another device. AuthProvider listens and drops the session so the router sends
 * the user to /login instead of leaving them staring at failed panels.
 */
export const UNAUTHORIZED_EVENT = "myx:unauthorized";

/** Sign-in and sign-up legitimately return 401/403; those must not sign us out. */
const isAuthEndpoint = (path: string) =>
  path.startsWith("/api/auth/login") || path.startsWith("/api/auth/register");

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  // Only set a JSON content type when there is actually a body — sending it on
  // GET/DELETE provokes a CORS preflight for nothing.
  if (options.body != null) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    // Tokens are short-lived and revocable now, so a 401 mid-session is a real
    // possibility rather than an anomaly. Tear the session down once, here,
    // instead of letting every screen render its own confusing error.
    if (res.status === 401 && !isAuthEndpoint(path)) {
      clearToken();
      window.dispatchEvent(new CustomEvent(UNAUTHORIZED_EVENT));
    }
    throw new ApiError((data as { error?: string })?.error ?? "Request failed", res.status);
  }
  return data as T;
}

/**
 * Fire-and-forget write that survives the page going away.
 *
 * `keepalive` lets the browser finish the request after unload, which
 * navigator.sendBeacon cannot do here because it can't set an Authorization
 * header. Used to flush a pending note autosave on tab close.
 */
export function requestKeepalive(path: string, body: unknown): void {
  const token = getToken();
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (token) headers.Authorization = `Bearer ${token}`;
  // Errors here are unobservable by design — the page is going away.
  void fetch(`${API_URL}${path}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
    keepalive: true,
  }).catch(() => {});
}

export interface User {
  id: number;
  email: string;
  name: string;
  /** Absent on responses from before verification shipped; treated as verified. */
  email_verified?: boolean;
  /** Daily digest opt-in. Absent on responses predating the feature. */
  digest_enabled?: boolean;
  created_at?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
  /** True when this sign-in cancelled a pending account deletion. */
  restored?: boolean;
  /**
   * True when the server locks unverified accounts out of their own data
   * (REQUIRE_VERIFIED_EMAIL). It decides whether the code step is a wall or a
   * nudge, and only the server knows which.
   */
  verification_required?: boolean;
}

/**
 * Downloads the account export and hands the browser a file.
 *
 * Not routed through `request`, which parses JSON into an object — this needs
 * the raw bytes. A plain link cannot be used either, because the endpoint wants
 * an Authorization header, so the response is turned into an object URL and a
 * synthetic click. The URL is revoked straight after; leaving it alive keeps a
 * copy of the user's entire history in memory for the life of the tab.
 */
export async function downloadExport(): Promise<{ filename: string; bytes: number }> {
  const token = getToken();
  const res = await fetch(`${API_URL}/api/auth/export`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(data.error ?? "Could not build the export", res.status);
  }

  const blob = await res.blob();
  const filename = `myx-export-${new Date().toISOString().slice(0, 10)}.json`;
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);

  return { filename, bytes: blob.size };
}

/** A single cross-module search result. `kind` decides icon, label and link. */
export interface SearchHit {
  kind:
    | "transaction"
    | "task"
    | "note"
    | "memory"
    | "checklist"
    | "loan"
    | "goal"
    | "investment"
    | "recurring"
    | "project";
  id: number;
  title: string;
  subtitle: string | null;
  /** Rupees, or null for things that are not money. */
  amount: number | null;
  date: string | null;
}

export interface Notification {
  id: string;
  kind: "task" | "bill" | "budget";
  severity: "urgent" | "warning" | "info";
  title: string;
  detail: string | null;
  to: string;
  date: string | null;
}

export interface RecurringSuggestion {
  signature: string;
  name: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  frequency: "weekly" | "monthly" | "yearly";
  interval: number;
  next_due: string;
  occurrences: number;
  last_seen: string;
  confidence: number;
}

export const api = {
  register: (body: { email: string; name: string; password: string }) =>
    request<AuthResponse>("/api/auth/register", { method: "POST", body: JSON.stringify(body) }),

  login: (body: { email: string; password: string }) =>
    request<AuthResponse>("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),

  /**
   * Current user. The server slides the session by returning a fresh token once
   * the current one is past halfway through its 24h life, so an active user is
   * never signed out despite the short TTL.
   */
  me: async () => {
    const res = await request<{
      user: User;
      token?: string;
      verification_required?: boolean;
    }>("/api/auth/me");
    if (res.token) setToken(res.token);
    return res;
  },

  /**
   * Revokes the token server-side (bumps token_version) — clearing localStorage
   * alone left it valid until expiry.
   */
  logout: () => request<{ ok: true }>("/api/auth/logout", { method: "POST" }),

  setPreferences: (body: { digest_enabled: boolean }) =>
    request<{ ok: true; digest_enabled: boolean }>("/api/auth/preferences", {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  verifyEmail: (body: { code: string }) =>
    request<{ ok: true; email_verified: true }>("/api/auth/verify-email", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  /** Issues a fresh code and invalidates the previous one. */
  resendVerification: () =>
    request<{ ok: true; email_verified: boolean }>("/api/auth/verify-email/resend", {
      method: "POST",
    }),

  /** Always resolves the same way whether or not the address has an account. */
  forgotPassword: (body: { email: string }) =>
    request<{ message: string }>("/api/auth/forgot", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  resetPassword: (body: { token: string; password: string }) =>
    request<{ ok: true }>("/api/auth/reset", { method: "POST", body: JSON.stringify(body) }),

  /**
   * Schedules deletion. Reversible for `grace_days` by signing in again; the
   * server re-checks the password before doing anything.
   */
  deleteAccount: (body: { password: string }) =>
    request<{ ok: true; restorable_until: number; grace_days: number }>("/api/auth/account", {
      method: "DELETE",
      body: JSON.stringify(body),
    }),

  dashboardSummary: () =>
    request<{
      greeting: string;
      stats: {
        balance: number;
        monthSpend: number;
        openTasks: number;
        notes: number;
        checklists: number;
      };
      /** What needs the user now: tasks due or overdue, bills due within a week. */
      today: {
        tasks: { id: number; title: string; due_date: string; priority: number }[];
        bills: { id: number; name: string; amount: number; next_due: string }[];
      };
      /** Latest transactions, newest first. Amounts in rupees. */
      recent: {
        id: number;
        type: "income" | "expense";
        amount: number;
        category: string;
        note: string | null;
        occurred_on: string;
      }[];
      /** The user's first checklist with up to 6 items; null when none exist. */
      checklist: {
        id: number;
        name: string;
        emoji: string | null;
        items: { id: number; title: string; done: boolean }[];
      } | null;
    }>("/api/dashboard/summary"),

  // ----- Search and notifications (the header) -----

  /** Everything matching, across every module. Empty below two characters. */
  search: (q: string) =>
    request<{ query: string; results: SearchHit[] }>(`/api/search?q=${encodeURIComponent(q)}`),

  /**
   * Live attention items. Not a stored feed — these are conditions that are
   * currently true, so there is nothing to mark as read.
   */
  notifications: () =>
    request<{ items: Notification[]; count: number; urgent: number }>("/api/notifications"),

  /** Recurring bills detected in the transaction history. */
  recurringSuggestions: () =>
    request<{ suggestions: RecurringSuggestion[] }>("/api/recurring/suggestions"),

  dismissRecurringSuggestion: (signature: string) =>
    request<{ ok: true }>("/api/recurring/suggestions/dismiss", {
      method: "POST",
      body: JSON.stringify({ signature }),
    }),

  /*
    ----- Admin -----
    Owner-only. The API answers 404 to anyone not flagged as an admin in the
    database, so a non-admin cannot tell these routes exist.
  */
  adminSession: () =>
    request<{ unlocked: boolean; unlocked_until: number | null }>("/api/admin/session"),

  adminUnlock: () => request<{ sent: true }>("/api/admin/unlock", { method: "POST" }),

  adminUnlockVerify: (code: string) =>
    request<{ unlocked_until: number }>("/api/admin/unlock/verify", {
      method: "POST",
      body: JSON.stringify({ code }),
    }),

  adminStats: () =>
    request<{
      users: { total: number; verified: number; digest_on: number; new_this_week: number };
      content: Record<string, number>;
      signups: { day: string; n: number }[];
      digests: { sent_total: number; sent_today: number };
    }>("/api/admin/stats"),

  adminHealth: () =>
    request<{ health: Record<string, number | string | null>; checked_at: number }>(
      "/api/admin/health",
    ),

  adminErrors: (includeResolved = false) =>
    request<{ errors: unknown[] }>(`/api/admin/errors${includeResolved ? "?include=resolved" : ""}`),

  adminResolveError: (fingerprint: string) =>
    request<{ ok: true }>(`/api/admin/errors/${fingerprint}/resolve`, { method: "POST" }),

  // ----- Money -----

  /**
   * One transaction by id. Needed because /money/transactions/:id is linkable,
   * and the list on that page only holds the most recent hundred.
   */
  getTransaction: (id: number) =>
    request<{ transaction: Transaction }>(`/api/transactions/${id}`),

  /**
   * The ledger, filtered server-side.
   *
   * Every filter is applied by the database rather than to the page that is
   * already loaded — the page only holds a slice, so "last March" filtered in
   * the browser would quietly answer a different question.
   */
  listTransactions: (params?: TransactionQuery) => {
    const q = new URLSearchParams();
    for (const [key, value] of Object.entries(params ?? {})) {
      // `!= null` and not a falsy check: offset 0 and min 0 are both real.
      if (value != null && value !== "") q.set(key, String(value));
    }
    const qs = q.toString();
    return request<{ transactions: Transaction[]; totals: TransactionTotals }>(
      `/api/transactions${qs ? `?${qs}` : ""}`,
    );
  },

  /** Categories the account has actually used, commonest first. */
  transactionCategories: () =>
    request<{ categories: { category: string; n: number }[] }>("/api/transactions/categories"),

  moneySummary: () =>
    request<{
      balance: number;
      totalIncome: number;
      totalExpense: number;
      monthIncome: number;
      monthExpense: number;
      count: number;
    }>("/api/transactions/summary"),

  moneyDashboard: () => request<MoneyDashboardData>("/api/money/dashboard"),

  createTransaction: (body: {
    type: "income" | "expense";
    amount: number;
    category: string;
    note?: string;
    occurred_on?: string;
  }) => request<{ transaction: Transaction }>("/api/transactions", {
    method: "POST",
    body: JSON.stringify(body),
  }),

  /**
   * Bulk write, used by the statement importer. All-or-nothing on the server:
   * a half-imported statement is worse than a failed one, because it is
   * invisible until the totals look wrong.
   */
  importTransactions: (
    transactions: {
      type: "income" | "expense";
      amount: number;
      category: string;
      note?: string;
      occurred_on: string;
    }[],
  ) =>
    request<{ imported: number }>("/api/transactions/import", {
      method: "POST",
      body: JSON.stringify({ transactions }),
    }),

  /** Correct an entry. Omitted fields are left as they are; note accepts null to clear. */
  updateTransaction: (
    id: number,
    body: Partial<{
      type: "income" | "expense";
      amount: number;
      category: string;
      note: string | null;
      occurred_on: string;
    }>,
  ) =>
    request<{ transaction: Transaction }>(`/api/transactions/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteTransaction: (id: number) =>
    request<{ ok: true }>(`/api/transactions/${id}`, { method: "DELETE" }),

  // ----- Savings Goals -----
  goalContributions: (id: number) =>
    request<{
      contributions: { id: number; amount: number; occurred_on: string; note: string | null }[];
    }>(`/api/goals/${id}/contributions`),

  investmentHistory: (id: number) =>
    request<{ history: { value: number; recorded_on: string }[] }>(
      `/api/investments/${id}/history`,
    ),

  listGoals: () => request<{ goals: Goal[] }>("/api/goals"),

  createGoal: (body: {
    name: string;
    target: number;
    saved?: number;
    emoji?: string | null;
    target_date?: string | null;
  }) => request<{ goal: Goal }>("/api/goals", { method: "POST", body: JSON.stringify(body) }),

  /** `occurredOn` records when the money actually moved, not when it was logged. */
  contributeGoal: (id: number, amount: number, occurredOn?: string) =>
    request<{ goal: Goal }>(`/api/goals/${id}/contribute`, {
      method: "POST",
      body: JSON.stringify({ amount, occurred_on: occurredOn }),
    }),

  updateGoal: (
    id: number,
    body: { name?: string; target?: number; emoji?: string | null; target_date?: string | null },
  ) => request<{ goal: Goal }>(`/api/goals/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  deleteGoal: (id: number) => request<{ ok: true }>(`/api/goals/${id}`, { method: "DELETE" }),

  // ----- Recurring (bills & subscriptions) -----
  listRecurring: () => request<{ recurring: Recurring[] }>("/api/recurring"),

  recurringSummary: () =>
    request<{ monthlyIncome: number; monthlyExpense: number; count: number }>(
      "/api/recurring/summary",
    ),

  createRecurring: (body: {
    name: string;
    type: "income" | "expense";
    amount: number;
    category: string;
    frequency: Frequency;
    interval: number;
    next_due: string;
    note?: string;
  }) => request<{ recurring: Recurring }>("/api/recurring", {
    method: "POST",
    body: JSON.stringify(body),
  }),

  /**
   * Mark a bill paid. `expectedNextDue` is the due date the UI is showing; the
   * server rejects the call if it has already moved on, so a double-tap cannot
   * book the same bill twice.
   */
  payRecurring: (id: number, expectedNextDue?: string) =>
    request<{ recurring: Recurring; paid: { amount: number; occurred_on: string } }>(
      `/api/recurring/${id}/pay`,
      { method: "POST", body: JSON.stringify({ expected_next_due: expectedNextDue }) },
    ),

  updateRecurring: (id: number, body: Partial<{ active: boolean; next_due: string }>) =>
    request<{ recurring: Recurring }>(`/api/recurring/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteRecurring: (id: number) =>
    request<{ ok: true }>(`/api/recurring/${id}`, { method: "DELETE" }),

  // ----- Budgets -----
  /** `month` is YYYY-MM; omit for the current one. Spend is derived from transactions. */
  listBudgets: (month?: string) =>
    request<{
      month: string;
      budgets: Budget[];
      totals: { limit: number; spent: number; remaining: number };
    }>(`/api/budgets${month ? `?month=${month}` : ""}`),

  createBudget: (body: { category: string; amount: number }) =>
    request<{ budget: Budget }>("/api/budgets", { method: "POST", body: JSON.stringify(body) }),

  updateBudget: (id: number, amount: number) =>
    request<{ ok: true }>(`/api/budgets/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ amount }),
    }),

  deleteBudget: (id: number) => request<{ ok: true }>(`/api/budgets/${id}`, { method: "DELETE" }),

  // ----- Loans (EMI) -----
  listLoans: () => request<{ loans: Loan[] }>("/api/loans"),

  getLoan: (id: number) =>
    request<{ loan: Loan; schedule: LoanScheduleRow[]; payments: LoanPayment[] }>(
      `/api/loans/${id}`,
    ),

  createLoan: (body: {
    name: string;
    lender?: string;
    principal: number;
    annual_rate: number;
    emi: number;
    start_date?: string;
  }) => request<{ loan: Loan }>("/api/loans", { method: "POST", body: JSON.stringify(body) }),

  /**
   * Record an EMI. `idempotencyKey` identifies the payment *intent*, so a
   * double-tap or a retry after a dropped connection books one payment, not two.
   */
  /**
   * `paidOn` (YYYY-MM-DD) is also the date of the expense this books, so a
   * payment logged late lands in the month it was actually made rather than
   * the month it was entered.
   */
  /**
   * A lump sum straight off the principal. Returns what it saved in interest
   * and months — the reason to do it at all.
   */
  /**
   * Reverse the most recent payment: restores the balance, reopens the loan if
   * that payment closed it, and deletes the expense it booked.
   */
  undoLoanPayment: (loanId: number, paymentId: number) =>
    request<{ loan: Loan; reversed: { principal: number; expense_removed: boolean } }>(
      `/api/loans/${loanId}/payments/${paymentId}`,
      { method: "DELETE" },
    ),

  prepayLoan: (id: number, amount: number, idempotencyKey: string, paidOn?: string) =>
    request<{
      loan: Loan;
      payment: { amount: number; principal_part: number; balance_after: number };
      saved?: { interest: number; months: number; closed: boolean };
      replayed?: boolean;
    }>(`/api/loans/${id}/prepay`, {
      method: "POST",
      body: JSON.stringify({ amount, idempotency_key: idempotencyKey, paid_on: paidOn }),
    }),

  payLoan: (id: number, idempotencyKey: string, logTransaction = true, paidOn?: string) =>
    request<{ loan: Loan; payment: LoanPayment; replayed?: boolean }>(`/api/loans/${id}/pay`, {
      method: "POST",
      body: JSON.stringify({
        log_transaction: logTransaction,
        idempotency_key: idempotencyKey,
        paid_on: paidOn,
      }),
    }),

  changeLoanRate: (id: number, annual_rate: number) =>
    request<{ loan: Loan }>(`/api/loans/${id}/rate`, {
      method: "POST",
      body: JSON.stringify({ annual_rate }),
    }),

  updateLoan: (id: number, body: { name?: string; lender?: string; emi?: number }) =>
    request<{ loan: Loan }>(`/api/loans/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  deleteLoan: (id: number) => request<{ ok: true }>(`/api/loans/${id}`, { method: "DELETE" }),

  // ----- Investments -----
  listInvestments: () =>
    request<{ investments: Investment[]; totals: InvestmentTotals }>("/api/investments"),

  createInvestment: (body: {
    name: string;
    type: InvestmentType;
    invested: number;
    current?: number;
    notes?: string;
  }) =>
    request<{ investment: Investment }>("/api/investments", {
      method: "POST",
      body: JSON.stringify(body),
    }),

  updateInvestment: (
    id: number,
    body: Partial<{
      name: string;
      type: InvestmentType;
      invested: number;
      current: number;
      notes: string | null;
    }>,
  ) =>
    request<{ investment: Investment }>(`/api/investments/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteInvestment: (id: number) =>
    request<{ ok: true }>(`/api/investments/${id}`, { method: "DELETE" }),

  // ----- Checklists -----
  listChecklists: () => request<{ checklists: Checklist[] }>("/api/checklists"),
  createChecklist: (body: { name: string; emoji?: string | null }) =>
    request<{ checklist: Checklist }>("/api/checklists", { method: "POST", body: JSON.stringify(body) }),
  getChecklist: (id: number) =>
    request<{ checklist: Checklist; items: ChecklistItem[] }>(`/api/checklists/${id}`),
  updateChecklist: (id: number, body: Partial<{ name: string; emoji: string | null }>) =>
    request<{ checklist: Checklist }>(`/api/checklists/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteChecklist: (id: number) =>
    request<{ ok: true }>(`/api/checklists/${id}`, { method: "DELETE" }),
  resetChecklist: (id: number) =>
    request<{ ok: true }>(`/api/checklists/${id}/reset`, { method: "POST" }),
  addChecklistItem: (id: number, title: string) =>
    request<{ item: ChecklistItem }>(`/api/checklists/${id}/items`, {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  updateChecklistItem: (id: number, itemId: number, body: Partial<{ title: string; done: boolean }>) =>
    request<{ item: ChecklistItem }>(`/api/checklists/${id}/items/${itemId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteChecklistItem: (id: number, itemId: number) =>
    request<{ ok: true }>(`/api/checklists/${id}/items/${itemId}`, { method: "DELETE" }),

  // ----- Memories -----
  listMemoryTags: () => request<{ tags: string[] }>("/api/memories/tags"),
  listMemories: (params?: { tag?: string; q?: string }) => {
    const p = new URLSearchParams();
    if (params?.tag) p.set("tag", params.tag);
    if (params?.q) p.set("q", params.q);
    const qs = p.toString();
    return request<{ memories: Memory[] }>(`/api/memories${qs ? `?${qs}` : ""}`);
  },
  createMemory: (body: {
    title: string;
    note?: string;
    emoji?: string | null;
    occurred_on?: string | null;
    tags?: string[];
  }) => request<{ memory: Memory }>("/api/memories", { method: "POST", body: JSON.stringify(body) }),
  updateMemory: (
    id: number,
    body: Partial<{
      title: string;
      note: string;
      emoji: string | null;
      occurred_on: string | null;
      tags: string[];
    }>,
  ) => request<{ memory: Memory }>(`/api/memories/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteMemory: (id: number) => request<{ ok: true }>(`/api/memories/${id}`, { method: "DELETE" }),

  // ----- Tasks: Spaces -----
  listSpaces: () => request<{ spaces: Space[] }>("/api/spaces"),
  createSpace: (body: { name: string; color?: string; icon?: string }) =>
    request<{ space: Space }>("/api/spaces", { method: "POST", body: JSON.stringify(body) }),
  updateSpace: (id: number, body: Partial<{ name: string; color: string; icon: string }>) =>
    request<{ space: Space }>(`/api/spaces/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteSpace: (id: number) => request<{ ok: true }>(`/api/spaces/${id}`, { method: "DELETE" }),

  // ----- Tasks: Projects -----
  listProjects: (spaceId?: number) =>
    request<{ projects: Project[] }>(
      `/api/projects${spaceId != null ? `?space_id=${spaceId}` : ""}`,
    ),
  createProject: (body: { space_id: number; name: string; color?: string }) =>
    request<{ project: Project }>("/api/projects", { method: "POST", body: JSON.stringify(body) }),
  updateProject: (
    id: number,
    /*
      `space_id` moves the project to another space — and takes its tasks with
      it, server-side. Tasks carry their own space_id, so moving one without
      the other files them under a project in one space while they are still
      counted against the other.
    */
    body: Partial<{
      name: string;
      color: string;
      archived: boolean;
      view: "list" | "board";
      space_id: number;
    }>,
  ) =>
    request<{ project: Project }>(`/api/projects/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteProject: (id: number) => request<{ ok: true }>(`/api/projects/${id}`, { method: "DELETE" }),

  // ----- Tasks -----
  listTasks: (params: {
    space_id?: number;
    project_id?: number;
    view?: "today" | "inbox" | "upcoming";
    label_id?: number;
    today?: string;
    limit?: number;
    offset?: number;
  }) => {
    const q = new URLSearchParams();
    if (params.space_id != null) q.set("space_id", String(params.space_id));
    if (params.project_id != null) q.set("project_id", String(params.project_id));
    if (params.view) q.set("view", params.view);
    if (params.label_id != null) q.set("label_id", String(params.label_id));
    if (params.today) q.set("today", params.today);
    if (params.limit != null) q.set("limit", String(params.limit));
    if (params.offset != null) q.set("offset", String(params.offset));
    return request<{ tasks: Task[] }>(`/api/tasks?${q.toString()}`);
  },
  getTask: (id: number) =>
    request<{ task: Task; labels: Label[]; subtasks: Subtask[] }>(`/api/tasks/${id}`),
  taskCounts: (params: { space_id?: number; today?: string }) => {
    const q = new URLSearchParams();
    if (params.space_id != null) q.set("space_id", String(params.space_id));
    if (params.today) q.set("today", params.today);
    return request<{ today: number; inbox: number; upcoming: number }>(
      `/api/tasks/counts?${q.toString()}`,
    );
  },
  createTask: (body: {
    title: string;
    space_id: number;
    project_id?: number | null;
    section_id?: number | null;
    due_date?: string | null;
    priority?: number;
    notes?: string;
    label_ids?: number[];
  }) => request<{ task: Task }>("/api/tasks", { method: "POST", body: JSON.stringify(body) }),
  updateTask: (
    id: number,
    body: Partial<{
      title: string;
      notes: string | null;
      priority: number;
      due_date: string | null;
      project_id: number | null;
      space_id: number;
    }>,
  ) => request<{ task: Task }>(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  completeTask: (id: number) =>
    request<{ task: Task }>(`/api/tasks/${id}/complete`, { method: "POST" }),
  reopenTask: (id: number) => request<{ task: Task }>(`/api/tasks/${id}/reopen`, { method: "POST" }),
  deleteTask: (id: number) => request<{ ok: true }>(`/api/tasks/${id}`, { method: "DELETE" }),
  moveTask: (id: number, section_id: number | null, position: number) =>
    request<{ ok: true }>(`/api/tasks/${id}/move`, {
      method: "POST",
      body: JSON.stringify({ section_id, position }),
    }),
  /**
   * One column's tasks, in the order they should end up.
   *
   * `moveTask` sets a single task's section and position, which is only enough
   * to append to a column. Anything that changes the order of the cards already
   * in it has to renumber all of them, and N separate calls race each other.
   */
  reorderTasks: (section_id: number | null, ids: number[]) =>
    request<{ ok: true }>("/api/tasks/reorder", {
      method: "POST",
      body: JSON.stringify({ section_id, ids }),
    }),
  setTaskLabels: (id: number, label_ids: number[]) =>
    request<{ ok: true }>(`/api/tasks/${id}/labels`, {
      method: "PUT",
      body: JSON.stringify({ label_ids }),
    }),

  // ----- Subtasks -----
  addSubtask: (taskId: number, title: string) =>
    request<{ subtask: Subtask }>(`/api/tasks/${taskId}/subtasks`, {
      method: "POST",
      body: JSON.stringify({ title }),
    }),
  updateSubtask: (taskId: number, subId: number, body: Partial<{ title: string; done: boolean }>) =>
    request<{ subtask: Subtask }>(`/api/tasks/${taskId}/subtasks/${subId}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),
  deleteSubtask: (taskId: number, subId: number) =>
    request<{ ok: true }>(`/api/tasks/${taskId}/subtasks/${subId}`, { method: "DELETE" }),

  // ----- Labels -----
  listLabels: () => request<{ labels: Label[] }>("/api/labels"),
  createLabel: (name: string, color?: string) =>
    request<{ label: Label }>("/api/labels", { method: "POST", body: JSON.stringify({ name, color }) }),
  deleteLabel: (id: number) => request<{ ok: true }>(`/api/labels/${id}`, { method: "DELETE" }),

  // ----- Sections (Kanban) -----
  listSections: (projectId: number) =>
    request<{ sections: Section[] }>(`/api/projects/${projectId}/sections`),
  createSection: (projectId: number, name: string) =>
    request<{ section: Section }>(`/api/projects/${projectId}/sections`, {
      method: "POST",
      body: JSON.stringify({ name }),
    }),
  renameSection: (projectId: number, sectionId: number, name: string) =>
    request<{ ok: true }>(`/api/projects/${projectId}/sections/${sectionId}`, {
      method: "PATCH",
      body: JSON.stringify({ name }),
    }),
  /** The columns, in their new left-to-right order. */
  reorderSections: (projectId: number, ids: number[]) =>
    request<{ ok: true }>(`/api/projects/${projectId}/sections/reorder`, {
      method: "POST",
      body: JSON.stringify({ ids }),
    }),
  deleteSection: (projectId: number, sectionId: number) =>
    request<{ ok: true }>(`/api/projects/${projectId}/sections/${sectionId}`, { method: "DELETE" }),

  // ----- Notes: Folders -----
  listFolders: () => request<{ folders: Folder[] }>("/api/folders"),
  createFolder: (name: string, color?: string) =>
    request<{ folder: Folder }>("/api/folders", { method: "POST", body: JSON.stringify({ name, color }) }),
  updateFolder: (id: number, body: Partial<{ name: string; color: string }>) =>
    request<{ folder: Folder }>(`/api/folders/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteFolder: (id: number) => request<{ ok: true }>(`/api/folders/${id}`, { method: "DELETE" }),

  // ----- Notes -----
  listNoteTags: () => request<{ tags: string[] }>("/api/notes/tags"),
  listNotes: (params: { folder_id?: number; view?: "pinned" | "trash"; tag?: string; q?: string }) => {
    const p = new URLSearchParams();
    if (params.folder_id != null) p.set("folder_id", String(params.folder_id));
    if (params.view) p.set("view", params.view);
    if (params.tag) p.set("tag", params.tag);
    if (params.q) p.set("q", params.q);
    return request<{ notes: NoteListItem[] }>(`/api/notes?${p.toString()}`);
  },
  getNote: (id: number) => request<{ note: Note }>(`/api/notes/${id}`),
  createNote: (body: { title?: string; content?: string; folder_id?: number | null; tags?: string[] }) =>
    request<{ note: Note }>("/api/notes", { method: "POST", body: JSON.stringify(body) }),
  updateNote: (
    id: number,
    body: Partial<{
      title: string;
      content: string;
      folder_id: number | null;
      tags: string[];
      pinned: boolean;
      color: string | null;
      archived: boolean;
    }>,
  ) => request<{ note: Note }>(`/api/notes/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
  deleteNote: (id: number) => request<{ ok: true }>(`/api/notes/${id}`, { method: "DELETE" }),
};

export interface Folder {
  id: number;
  name: string;
  color: string;
  position: number;
  note_count: number;
  created_at?: string;
}

export interface NoteListItem {
  id: number;
  folder_id: number | null;
  title: string;
  snippet: string;
  tags: string[];
  pinned: boolean;
  color: string | null;
  archived: boolean;
  updated_at: string;
}

export interface Note {
  id: number;
  folder_id: number | null;
  title: string;
  content: string;
  tags: string[];
  pinned: boolean;
  color: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface Space {
  id: number;
  name: string;
  color: string;
  icon: string;
  position: number;
  created_at: string;
}

export interface Project {
  id: number;
  space_id: number;
  name: string;
  color: string;
  archived: boolean;
  position: number;
  view: "list" | "board";
  open_count: number;
  created_at: string;
}

export interface Label {
  id: number;
  name: string;
  color: string;
  created_at?: string;
}

export interface Subtask {
  id: number;
  title: string;
  done: boolean;
  position: number;
}

export interface Section {
  id: number;
  project_id: number;
  name: string;
  position: number;
}

export interface Task {
  id: number;
  space_id: number;
  project_id: number | null;
  section_id: number | null;
  title: string;
  notes: string | null;
  priority: number; // 1=P1 (highest) .. 4=none
  due_date: string | null;
  status: "open" | "done";
  completed_at: string | null;
  position: number;
  created_at: string;
  labels: Label[];
  subtasks: { total: number; done: number };
}

export interface Loan {
  id: number;
  name: string;
  lender: string | null;
  principal: number;
  annual_rate: number;
  emi: number;
  outstanding: number;
  start_date: string;
  status: "active" | "closed";
  paid_count: number;
  progress_percent: number;
  months_remaining: number;
  payoff_date: string | null;
  interest_remaining: number;
  covers_interest: boolean;
  next_payment: { interest: number; principal: number };
}

export interface LoanScheduleRow {
  month: number;
  interest: number;
  principal: number;
  payment: number;
  balance: number;
}

export interface LoanPayment {
  kind?: "emi" | "prepayment";
  /** Only the newest payment can be reversed — earlier rows depend on it. */
  can_undo?: boolean;
  /** Always returned; undoing a payment needs it. */
  id: number;
  amount: number;
  interest_part: number;
  principal_part: number;
  balance_after: number;
  paid_on?: string;
}

export interface Budget {
  id: number;
  category: string;
  limit: number;
  spent: number;
  remaining: number;
  percent: number;
  over: boolean;
}

export type Frequency = "daily" | "weekly" | "monthly" | "yearly";

export interface Recurring {
  id: number;
  name: string;
  type: "income" | "expense";
  amount: number;
  category: string;
  frequency: Frequency;
  interval: number;
  next_due: string;
  note: string | null;
  active: boolean;
  last_paid_on: string | null;
  created_at: string;
}

export interface Goal {
  id: number;
  name: string;
  emoji: string | null;
  target: number;
  saved: number;
  remaining: number;
  percent: number;
  target_date: string | null;
  created_at: string;
  completed_at: string | null;
}

export type InvestmentType = "stocks" | "mutual_fund" | "fd" | "ppf_epf" | "gold" | "crypto" | "other";

export interface Investment {
  id: number;
  name: string;
  type: InvestmentType;
  invested: number;
  current: number;
  gain: number;
  gainPercent: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface InvestmentTotals {
  invested: number;
  current: number;
  gain: number;
  gainPercent: number;
  count: number;
}

export interface Checklist {
  id: number;
  name: string;
  emoji: string | null;
  position: number;
  total: number;
  done: number;
  created_at: string;
}

export interface ChecklistItem {
  id: number;
  title: string;
  done: boolean;
  position: number;
}

export interface Memory {
  id: number;
  title: string;
  note: string;
  emoji: string | null;
  occurred_on: string | null;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: number;
  type: "income" | "expense";
  amount: number;
  category: string;
  note: string | null;
  occurred_on: string;
  created_at?: string;
}

export type TransactionSort = "date_desc" | "date_asc" | "amount_desc" | "amount_asc";

/** Every filter the ledger accepts. All optional; all applied by the database. */
export interface TransactionQuery {
  limit?: number;
  offset?: number;
  type?: "income" | "expense";
  /** Inclusive YYYY-MM-DD bounds. */
  from?: string;
  to?: string;
  category?: string;
  /** Matched against the note and the category. */
  q?: string;
  /** Rupees, inclusive. */
  min?: number;
  max?: number;
  sort?: TransactionSort;
}

/** Totals for the whole filtered set — not just the page that came back. */
export interface TransactionTotals {
  income: number;
  expense: number;
  net: number;
  matched: number;
}

export interface MoneyDashboardData {
  summary: {
    balance: number;
    totalIncome: number;
    totalExpense: number;
    monthIncome: number;
    monthExpense: number;
    netMonth: number;
    savingsRate: number;
    spendChangePct: number | null;
    transactionCount: number;
  };
  monthlyTrend: { month: string; label: string; income: number; expense: number; net: number }[];
  categories: { category: string; amount: number; percent: number }[];
  budgets: {
    items: { id: number; category: string; limit: number; spent: number; percent: number; over: boolean }[];
    totals: { limit: number; spent: number; overCount: number };
  };
  goals: {
    items: { id: number; name: string; emoji: string | null; target: number; saved: number; percent: number; completed: boolean }[];
    totals: { target: number; saved: number; count: number; completed: number };
  };
  loans: {
    count: number;
    activeCount: number;
    outstanding: number;
    monthlyEmi: number;
    principal: number;
  };
  investments: {
    count: number;
    invested: number;
    current: number;
    gain: number;
    gainPercent: number;
  };
  recurring: {
    monthlyIncome: number;
    monthlyExpense: number;
    upcoming: {
      id: number;
      name: string;
      type: "income" | "expense";
      amount: number;
      category: string;
      next_due: string;
      days_until: number;
      overdue: boolean;
    }[];
  };
  recentTransactions: Omit<Transaction, "created_at">[];
  insights: { tone: "info" | "warn" | "good"; message: string }[];
}

/** Format a rupee amount for display, e.g. 48700.5 -> "₹48,700.50". */
export function formatMoney(amount: number): string {
  /*
    Paise only when there are paise.

    Every figure in the app used to end in ".00" — a balance of ₹7,02,893.00,
    a bill of ₹649.00, a budget of ₹12,000.00 — and in a column of them the
    two zeroes are pure noise that pushes the digits that matter apart. Real
    paise (a 649.50 bill) still print, because rounding someone's money in the
    display is not a cosmetic decision.
  */
  const whole = Number.isInteger(amount);
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: whole ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

/**
 * Compact form for chart axes and tight tiles: ₹7.02L, ₹1.2Cr, ₹45K.
 *
 * Indian grouping, not the Intl "compact" notation, which renders 702893 as
 * "₹703K" — a unit nobody in the app's audience reads amounts in.
 */
export function formatMoneyShort(amount: number): string {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  if (abs >= 1_00_00_000) return `${sign}₹${(abs / 1_00_00_000).toFixed(2).replace(/\.00$/, "")}Cr`;
  if (abs >= 1_00_000) return `${sign}₹${(abs / 1_00_000).toFixed(2).replace(/\.00$/, "")}L`;
  if (abs >= 1_000) return `${sign}₹${(abs / 1_000).toFixed(1).replace(/\.0$/, "")}K`;
  return `${sign}₹${Math.round(abs)}`;
}
