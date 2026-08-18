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
> - ✅ Auth (own `users` table + JWT) + premium login/register — rate limited,
>   revocable on logout, 24h sliding sessions
> - ✅ **PWA** — installable on phone/desktop, offline app shell, maskable icons,
>   app shortcuts; API traffic is never cached
> - ✅ **Mobile navigation** — bottom tab bar below `md`, so every module is
>   reachable on a phone (the sidebar is desktop-only)
> - ✅ **Tests** — 107 Vitest cases across both packages
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
> - ✅ **Money → Investments** — manually-tracked holdings (stocks, mutual funds, FDs,
>   PPF/EPF, gold, crypto, other) with invested vs current value and derived gain/loss;
>   portfolio-value KPI + insight on the Money Dashboard
> - ✅ **Money → Dashboard** — rich rollup (6-month trend, top categories, savings
>   rate, upcoming bills, portfolio value) with charts + a separate Transactions tab
> - ✅ **Tasks (Phases 1–3)** — **Spaces** keep Work/Personal/Freelance separate;
>   Projects (List **or** Kanban board with drag-and-drop); Today · Upcoming · Inbox;
>   labels, subtasks, priorities; natural-language quick-add (`pay rent tomorrow !p1 #home`);
>   task detail dialog; in-app help with reference links. See
>   [docs/TASKS_PLAN.md](docs/TASKS_PLAN.md).
> - ✅ **Notes** — notebooks (folders) + tags + pinning + Trash; markdown editor
>   with live preview and autosave; full-text search; masonry note cards.
>
> The Money section uses tabs (Dashboard · Transactions · Recurring · Budgets · Loans ·
> Goals · Investments). Tasks uses Spaces (top-level contexts) → Projects → Tasks. One
> module at a time.

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
  works in Workers. Input is capped at 128 chars so a huge password can't burn CPU.
- Login returns a **JWT** (HS256) signed with `JWT_SECRET`, valid for **24h**.
  `GET /api/auth/me` slides the session past the halfway mark, so active users stay signed in.
- Frontend stores the token in `localStorage`, sends it as `Authorization: Bearer <token>`.
- Protected routes verified by Hono middleware.
- **Revocation:** every token carries a `token_version` matched against `users.token_version`.
  `POST /api/auth/logout` bumps it, which invalidates that user's outstanding tokens everywhere
  — logout used to be cosmetic, leaving the JWT usable for its full life.
- **Rate limiting:** a D1-backed fixed-window limiter (`auth_attempts`) runs *before* any
  hashing — 20/15min per IP and 5/15min of failures per email on login, 5/hour per IP on
  register. Blocks both password guessing and PBKDF2 CPU exhaustion.
- A 401 anywhere in the app tears the session down client-side and routes to `/login`.

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
```sql
investments (
  id              INTEGER PK
  user_id         INTEGER  -> users.id (cascade delete)
  name            TEXT
  type            TEXT     -- 'stocks' | 'mutual_fund' | 'fd' | 'ppf_epf' | 'gold' | 'crypto' | 'other'
  invested_amount INTEGER  -- paise
  current_value   INTEGER  -- paise, updated by hand (no live market data)
  notes           TEXT     -- nullable
  created_at      TEXT
  updated_at      TEXT
)
```
Investments are manually valued; gain/loss is derived as `current_value - invested_amount`.
More tables (checklists, notes, memories…) are added per-module later.

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

### Investments API (implemented)
| Method | Path                          | Purpose                          |
|--------|-------------------------------|----------------------------------|
| GET    | `/api/investments`            | List holdings + portfolio totals (invested, current, gain) |
| POST   | `/api/investments`            | Create a holding (`{name, type, invested, current?, notes?}`) |
| PATCH  | `/api/investments/:id`        | Edit name / type / invested / current / notes |
| DELETE | `/api/investments/:id`        | Delete a holding                 |

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
npm run install:all             # root + backend + frontend deps
npm run db:migrate:local        # apply migrations to local D1
npm run dev                     # API on :8787 and web on :5173 together
```

Or one at a time:

```bash
npm run dev:api                 # Worker + local D1 — http://localhost:8787
npm run dev:web                 # Vite — http://localhost:5173
```

Local frontend calls the local Worker at `http://localhost:8787` (see `frontend/.env`).
The Worker reads `JWT_SECRET` from `backend/.dev.vars` (gitignored) in local dev — create it
with any random string:

```bash
echo "JWT_SECRET=$(openssl rand -hex 32)" > backend/.dev.vars
```

### Tests

Vitest in both packages; backend tests run against real SQLite (`node:sqlite`) with the
migrations applied, so schema guarantees are covered too.

```bash
npm --prefix backend test       # amortization, rate limiting, idempotency, auth
npm --prefix frontend test      # quick-add parsing, markdown XSS regressions
```

### PWA

`frontend/public/` holds `manifest.webmanifest`, the icon set and `sw.js`. The service worker
is **production-only** (`src/lib/pwa.ts` unregisters it in dev so it can't fight Vite's HMR).
It caches the app shell and hashed assets, and deliberately never touches `/api/*` — that
traffic is private and authenticated, so it must not land in a browser cache.

## 7. Live URLs (deployed 🎉)

- **App:** https://myx-app.pages.dev
- **API:** https://myx-api.samchitech.workers.dev

### Redeploy after changes
```bash
# Backend (Worker + remote D1)
cd backend
npm run db:migrate        # only if there are new migrations
npm run deploy

# Frontend (Pages, production)
cd frontend
npm run deploy            # build + deploy to myx-app (branch main = production)

# Or both from the repo root:
npm run deploy
```
`JWT_SECRET` is already set as a Worker secret (production). Rotate with
`npx wrangler secret put JWT_SECRET` in `backend/`.

## 8. Cloudflare resources

| Resource | Name      | Detail                                       |
|----------|-----------|----------------------------------------------|
| D1       | `myx-db`  | `ab5a4c50-4c48-41b6-ae3e-02ce46b63b82`       |
| Worker   | `myx-api` | https://myx-api.samchitech.workers.dev       |
| Pages    | `myx-app` | https://myx-app.pages.dev (prod branch `main`) |

## 9. Roadmap

Money module (building out one sub-feature at a time):
1. ✅ Overview — transactions + balance
2. ✅ Savings Goals
3. ✅ Recurring transactions (bills & subscriptions)
4. ✅ Budgets (monthly limits per category + alerts)
5. ✅ Loans (EMI, reducing-balance, floating rate) — bank-accurate
   - Todo: personal debts / IOUs (money you lent or borrowed from people)
6. ✅ Investments (manual holdings: stocks, mutual funds, FDs, PPF/EPF, gold, crypto)
7. ✅ Money charts (spend by category, trends) — shipped as part of the Money Dashboard

**Still remaining:**
- Personal debts / IOUs (money lent to or borrowed from people — separate from bank Loans)
- ✅ Tasks (Phases 1–3) — done
- ✅ Notes — done
- Checklists — reusable templates you tick off repeatedly (see [§2](#2-modules-roadmap))
- Memories, Journal/diary, Mood tracker, Bookmarks, Contacts (Personal module)
- Habits, Calendar/events, Reminders, Goals *(cross-module)*, Projects *(cross-module)*
- Health & Body module (Fitness, Meals, Water, Medicines, Sleep)
- Life Admin module (Documents vault, Passwords, Shopping lists, Travel planner, Vehicle)
- Cross-module dashboard (today Dashboard only shows real Money numbers; other modules
  are placeholders — see `/api/dashboard/summary` in [backend/src/index.ts](backend/src/index.ts))
- Reminders / notifications
