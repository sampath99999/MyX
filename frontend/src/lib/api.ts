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

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers = new Headers(options.headers);
  headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const data = await res.json().catch(() => ({}));

  if (!res.ok) {
    throw new ApiError((data as { error?: string })?.error ?? "Request failed", res.status);
  }
  return data as T;
}

export interface User {
  id: number;
  email: string;
  name: string;
  created_at?: string;
}

export interface AuthResponse {
  token: string;
  user: User;
}

export const api = {
  register: (body: { email: string; name: string; password: string }) =>
    request<AuthResponse>("/api/auth/register", { method: "POST", body: JSON.stringify(body) }),

  login: (body: { email: string; password: string }) =>
    request<AuthResponse>("/api/auth/login", { method: "POST", body: JSON.stringify(body) }),

  me: () => request<{ user: User }>("/api/auth/me"),

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
    }>("/api/dashboard/summary"),

  // ----- Money -----
  listTransactions: (params?: { limit?: number; type?: "income" | "expense" }) => {
    const q = new URLSearchParams();
    if (params?.limit) q.set("limit", String(params.limit));
    if (params?.type) q.set("type", params.type);
    const qs = q.toString();
    return request<{ transactions: Transaction[] }>(`/api/transactions${qs ? `?${qs}` : ""}`);
  },

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

  deleteTransaction: (id: number) =>
    request<{ ok: true }>(`/api/transactions/${id}`, { method: "DELETE" }),

  // ----- Savings Goals -----
  listGoals: () => request<{ goals: Goal[] }>("/api/goals"),

  createGoal: (body: {
    name: string;
    target: number;
    saved?: number;
    emoji?: string | null;
    target_date?: string | null;
  }) => request<{ goal: Goal }>("/api/goals", { method: "POST", body: JSON.stringify(body) }),

  contributeGoal: (id: number, amount: number) =>
    request<{ goal: Goal }>(`/api/goals/${id}/contribute`, {
      method: "POST",
      body: JSON.stringify({ amount }),
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

  payRecurring: (id: number) =>
    request<{ recurring: Recurring; paid: { amount: number; occurred_on: string } }>(
      `/api/recurring/${id}/pay`,
      { method: "POST" },
    ),

  updateRecurring: (id: number, body: Partial<{ active: boolean; next_due: string }>) =>
    request<{ recurring: Recurring }>(`/api/recurring/${id}`, {
      method: "PATCH",
      body: JSON.stringify(body),
    }),

  deleteRecurring: (id: number) =>
    request<{ ok: true }>(`/api/recurring/${id}`, { method: "DELETE" }),

  // ----- Budgets -----
  listBudgets: () =>
    request<{ budgets: Budget[]; totals: { limit: number; spent: number; remaining: number } }>(
      "/api/budgets",
    ),

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

  payLoan: (id: number, logTransaction = true) =>
    request<{ loan: Loan; payment: LoanPayment }>(`/api/loans/${id}/pay`, {
      method: "POST",
      body: JSON.stringify({ log_transaction: logTransaction }),
    }),

  changeLoanRate: (id: number, annual_rate: number) =>
    request<{ loan: Loan }>(`/api/loans/${id}/rate`, {
      method: "POST",
      body: JSON.stringify({ annual_rate }),
    }),

  updateLoan: (id: number, body: { name?: string; lender?: string; emi?: number }) =>
    request<{ loan: Loan }>(`/api/loans/${id}`, { method: "PATCH", body: JSON.stringify(body) }),

  deleteLoan: (id: number) => request<{ ok: true }>(`/api/loans/${id}`, { method: "DELETE" }),

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
    body: Partial<{ name: string; color: string; archived: boolean; view: "list" | "board" }>,
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
  }) => {
    const q = new URLSearchParams();
    if (params.space_id != null) q.set("space_id", String(params.space_id));
    if (params.project_id != null) q.set("project_id", String(params.project_id));
    if (params.view) q.set("view", params.view);
    if (params.label_id != null) q.set("label_id", String(params.label_id));
    if (params.today) q.set("today", params.today);
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
  deleteSection: (projectId: number, sectionId: number) =>
    request<{ ok: true }>(`/api/projects/${projectId}/sections/${sectionId}`, { method: "DELETE" }),
};

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
  id?: number;
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

export interface Transaction {
  id: number;
  type: "income" | "expense";
  amount: number;
  category: string;
  note: string | null;
  occurred_on: string;
  created_at?: string;
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
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}
