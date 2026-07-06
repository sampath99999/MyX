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
};

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
  created_at: string;
}

/** Format a rupee amount for display, e.g. 48700.5 -> "₹48,700.50". */
export function formatMoney(amount: number): string {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2,
  }).format(amount);
}
