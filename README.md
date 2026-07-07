# MyX — Personal Life Manager

A private, self-hosted app to manage your daily life: money, tasks, notes, memories,
checklists and more. Built to run **100% free** on Cloudflare's edge.

---

## 1. Vision

One place for everything in your life. Web-first, installable as a PWA on your phone.
Single-user (you) today, built so family accounts can be added later.

## 2. Modules (roadmap)

### 💰 Money
- Income & Expenditure + Current Balance
- Budgets, Bills & subscriptions, Savings goals, Debts/loans, Investments

### ✅ Productivity
- Notes, Tasks
- Habits, Calendar/events, Reminders, Goals, Projects

### 🧠 Personal
- Memories
- Journal / diary, Mood tracker, Bookmarks, Contacts
- **Checklists** — reusable templates you tick off repeatedly (Before bed, Morning
  routine, Leaving home, Travel packing). A checklist resets each run, unlike one-off Tasks.

### 🏃 Health & Body
- Fitness, Meals, Water, Medicines, Sleep

### 🏠 Life Admin
- Documents vault, Passwords / secure notes, Shopping lists, Travel planner, Vehicle

> **Built so far:**
> - ✅ Auth (own `users` table + JWT) + premium login/register
> - ✅ Dashboard shell (real balance + month spend, live from the DB)
> - ✅ **Money → Overview** — income/expense, current balance, premium add-transaction
>   flow (hero amount input with amount-in-words, searchable icon category picker)
> - ✅ **Money → Recurring** — bills & subscriptions; "Mark paid" logs a real
>   transaction and rolls the due date forward; pause/resume; due/overdue status
> - ✅ **Money → Budgets** — monthly limit per category, live spend vs limit with
>   green/amber/red status and over-budget warnings
> - ✅ **Money → Loans** — EMI loans on reducing-balance amortization (matches the
>   bank to the paise); enter EMI+rate → derived schedule; live preview, pay EMI,
>   floating rate changes, full schedule + payment history
> - ✅ **Money → Goals** — savings goals with progress bars, add/withdraw funds,
>   auto-complete at 100%
> - ✅ **Money → Dashboard** — rich rollup (6-month trend, top categories, savings
>   rate, upcoming bills) with charts + a separate Transactions tab
> - ✅ **Tasks (Phases 1–3)** — **Spaces** keep Work/Personal/Freelance separate;
>   Projects (List **or** Kanban board with drag-and-drop); Today · Upcoming · Inbox;
>   labels, subtasks, priorities; natural-language quick-add (`pay rent tomorrow !p1 #home`);
>   task detail dialog; in-app help with reference links. See
>   [docs/TASKS_PLAN.md](docs/TASKS_PLAN.md).
>
> The Money section uses tabs (Dashboard · Transactions · Recurring · Budgets · Loans ·
> Goals). Tasks uses Spaces (top-level contexts) → Projects → Tasks. One module at a time.

## 3. Architecture

```
Browser (PWA)
   │
   ▼
Cloudflare Pages  ──►  React + Vite + Tailwind v4 + shadcn/ui   (frontend/)
   │  fetch /api/*
   ▼
Cloudflare Workers ──►  Hono API + JWT auth                     (backend/)
   │  binding: DB
   ▼
Cloudflare D1     ──►  SQLite database  (myx-db)
```

| Layer     | Tech                                             | Cloudflare product |
|-----------|--------------------------------------------------|--------------------|
| Frontend  | React 19, Vite, TypeScript, Tailwind v4, shadcn  | **Pages**          |
| Backend   | Hono, TypeScript                                 | **Workers**        |
| Database  | SQLite via Drizzle-free raw SQL                  | **D1** (`myx-db`)  |
| Auth      | Own `users` table, JWT (HS256), PBKDF2 hashing   | —                  |

**Why this stack:** all free tier, one API shared by web + future native app, fast global edge.

### Auth design (own table + JWT)
- Passwords hashed with **PBKDF2-SHA256** (100k iterations) via Web Crypto — no native deps,
  works in Workers.
- Login returns a **JWT** (HS256) signed with `JWT_SECRET`.
- Frontend stores the token in `localStorage`, sends it as `Authorization: Bearer <token>`.
- Protected routes verified by Hono middleware.

## 4. Database schema (v1)

```sql
users (
  id            INTEGER PK
  email         TEXT UNIQUE
  name          TEXT
  password_hash TEXT      -- pbkdf2$<iterations>$<salt_b64>$<hash_b64>
  created_at    TEXT
)
```
```sql
transactions (
  id           INTEGER PK
  user_id      INTEGER  -> users.id (cascade delete)
  type         TEXT     -- 'income' | 'expense'
  amount       INTEGER  -- stored in paise (÷100 for rupees); avoids float errors
  category     TEXT
  note         TEXT     -- nullable
  occurred_on  TEXT     -- YYYY-MM-DD
  created_at   TEXT
)
```
```sql
goals (
  id            INTEGER PK
  user_id       INTEGER  -> users.id (cascade delete)
  name          TEXT
  emoji         TEXT     -- nullable, e.g. "✈️"
  target_amount INTEGER  -- paise
  saved_amount  INTEGER  -- paise, default 0
  target_date   TEXT     -- nullable YYYY-MM-DD
  created_at    TEXT
  completed_at  TEXT     -- set when saved >= target
)
```
Goals are a standalone tracker; contributions do **not** touch the transactions balance.
More tables (tasks, notes, checklists…) are added per-module later.

### Money API (implemented)
| Method | Path                          | Purpose                          |
|--------|-------------------------------|----------------------------------|
| GET    | `/api/transactions`           | List (newest first, `?type=&limit=`) |
| GET    | `/api/transactions/summary`   | Balance + income/expense totals  |
| POST   | `/api/transactions`           | Create (amount in rupees)        |
| DELETE | `/api/transactions/:id`       | Delete one                       |

### Savings Goals API (implemented)
| Method | Path                          | Purpose                          |
|--------|-------------------------------|----------------------------------|
| GET    | `/api/goals`                  | List goals (with % progress)     |
| POST   | `/api/goals`                  | Create a goal                    |
| POST   | `/api/goals/:id/contribute`   | Add/withdraw funds (`{amount}`, negative = withdraw) |
| PATCH  | `/api/goals/:id`              | Edit name / target / emoji / date |
| DELETE | `/api/goals/:id`              | Delete a goal                    |

All money routes require `Authorization: Bearer <jwt>` and are scoped to the logged-in user.

## 5. Project structure

```
MyX/
├── README.md            ← this file (the plan)
├── backend/             ← Cloudflare Worker (Hono API)
│   ├── src/
│   │   ├── index.ts        app + routes wiring + CORS
│   │   ├── lib/auth.ts     password hashing + JWT helpers
│   │   ├── middleware.ts    auth guard
│   │   └── routes/auth.ts   /register /login /me
│   ├── migrations/0001_init.sql
│   └── wrangler.jsonc
└── frontend/            ← React app (Cloudflare Pages)
    └── src/
        ├── pages/Login.tsx, Dashboard.tsx
        ├── components/ui/  (shadcn)
        └── lib/api.ts, auth.tsx
```

## 6. Setup & run (local dev)

```bash
# Backend (Worker + local D1) — http://localhost:8787
cd backend
npm install
npm run db:migrate:local        # apply migrations to local D1
npm run dev

# Frontend (Vite) — http://localhost:5173
cd frontend
npm install
npm run dev
```

Local frontend calls the local Worker at `http://localhost:8787` (see `frontend/.env`).

## 7. Deploy (production, free)

```bash
# 1. Backend → Workers
cd backend
npm run db:migrate                       # apply migrations to remote D1
npx wrangler secret put JWT_SECRET       # set a strong random secret
npm run deploy                           # deploys Worker, prints its URL

# 2. Frontend → Pages
cd frontend
# set VITE_API_URL to the deployed Worker URL in .env.production
npm run build
npx wrangler pages deploy dist --project-name myx-app
```

## 8. Cloudflare resources (already created)

| Resource | Name     | ID                                     |
|----------|----------|----------------------------------------|
| D1       | `myx-db` | `ab5a4c50-4c48-41b6-ae3e-02ce46b63b82` |
| Worker   | `myx-api`| created on first `deploy`              |
| Pages    | `myx-app`| created on first `pages deploy`        |

## 9. Roadmap

Money module (building out one sub-feature at a time):
1. ✅ Overview — transactions + balance
2. ✅ Savings Goals
3. ✅ Recurring transactions (bills & subscriptions)
4. ✅ Budgets (monthly limits per category + alerts)
5. ✅ Loans (EMI, reducing-balance, floating rate) — bank-accurate
   - Todo: personal debts / IOUs (money you lent or borrowed from people)
6. Investments  ← next
7. Money charts (spend by category, trends)

Then: Tasks + Checklists → Notes + Memories → cross-module dashboard → PWA/offline → reminders.
```
