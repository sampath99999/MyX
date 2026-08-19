import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { requireAuth } from "../middleware";
import { projectSchedule, monthlyInterest } from "../lib/amortize";
import type { AppBindings } from "../types";

const loans = new Hono<AppBindings>();
loans.use("*", requireAuth);

interface LoanRow {
  id: number;
  name: string;
  lender: string | null;
  principal: number;
  annual_rate: number;
  emi: number;
  outstanding: number;
  start_date: string;
  status: "active" | "closed";
  created_at: string;
}

const toPaise = (r: number) => Math.round(r * 100);
const toRupees = (p: number) => p / 100;
const dateRe = /^\d{4}-\d{2}-\d{2}$/;

/** Add N months to a YYYY-MM-DD date (clamped to month end). */
function addMonths(iso: string, n: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  const targetMonth = date.getUTCMonth() + n;
  const targetYear = date.getUTCFullYear() + Math.floor(targetMonth / 12);
  const normMonth = ((targetMonth % 12) + 12) % 12;
  const daysInMonth = new Date(Date.UTC(targetYear, normMonth + 1, 0)).getUTCDate();
  date.setUTCFullYear(targetYear, normMonth, Math.min(d, daysInMonth));
  return date.toISOString().slice(0, 10);
}

/** Loan + a projection of what's left from the current outstanding balance. */
function serialize(l: LoanRow, paidCount: number) {
  const proj = projectSchedule(l.outstanding, l.annual_rate, l.emi);
  const nextInterest = monthlyInterest(l.outstanding, l.annual_rate);
  const nextPrincipal = Math.min(l.emi - nextInterest, l.outstanding);
  const paidStr = new Date().toISOString().slice(0, 10);

  return {
    id: l.id,
    name: l.name,
    lender: l.lender,
    principal: toRupees(l.principal),
    annual_rate: l.annual_rate,
    emi: toRupees(l.emi),
    outstanding: toRupees(l.outstanding),
    start_date: l.start_date,
    status: l.status,
    paid_count: paidCount,
    progress_percent:
      l.principal > 0 ? Math.round(((l.principal - l.outstanding) / l.principal) * 100) : 0,
    months_remaining: proj.months,
    payoff_date: proj.months > 0 ? addMonths(paidStr, proj.months) : null,
    interest_remaining: toRupees(proj.totalInterest),
    covers_interest: proj.coversInterest,
    next_payment: {
      interest: toRupees(nextInterest),
      principal: toRupees(Math.max(nextPrincipal, 0)),
    },
  };
}

async function paidCountFor(db: D1Database, loanId: number): Promise<number> {
  const row = await db
    .prepare("SELECT COUNT(*) AS c FROM loan_payments WHERE loan_id = ?")
    .bind(loanId)
    .first<{ c: number }>();
  return row?.c ?? 0;
}

/** GET /api/loans — list with projections. */
loans.get("/", async (c) => {
  const user = c.get("user");
  const { results } = await c.env.DB.prepare(
    `SELECT l.*, (SELECT COUNT(*) FROM loan_payments p WHERE p.loan_id = l.id) AS paid_count
     FROM loans l WHERE l.user_id = ? ORDER BY l.status, l.created_at DESC`,
  )
    .bind(user.sub)
    .all<LoanRow & { paid_count: number }>();

  return c.json({
    loans: (results ?? []).map((r) => serialize(r, r.paid_count)),
  });
});

/** GET /api/loans/:id — details + full amortization schedule + payment history. */
loans.get("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const loan = await c.env.DB.prepare("SELECT * FROM loans WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .first<LoanRow>();
  if (!loan) throw new HTTPException(404, { message: "Loan not found" });

  const proj = projectSchedule(loan.outstanding, loan.annual_rate, loan.emi);
  const { results: payments } = await c.env.DB.prepare(
    "SELECT * FROM loan_payments WHERE loan_id = ? ORDER BY id DESC",
  )
    .bind(id)
    .all();

  return c.json({
    loan: serialize(loan, (payments ?? []).length),
    schedule: proj.rows.map((r) => ({
      month: r.month,
      interest: toRupees(r.interest),
      principal: toRupees(r.principal),
      payment: toRupees(r.payment),
      balance: toRupees(r.balance),
    })),
    payments: (payments ?? []).map((p: Record<string, unknown>) => ({
      id: p.id,
      amount: toRupees(p.amount as number),
      interest_part: toRupees(p.interest_part as number),
      principal_part: toRupees(p.principal_part as number),
      balance_after: toRupees(p.balance_after as number),
      paid_on: p.paid_on,
    })),
  });
});

/** POST /api/loans — create. Body: { name, lender?, principal, annual_rate, emi, start_date? } */
loans.post("/", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => null);

  const name = String(body?.name ?? "").trim();
  const lender = body?.lender ? String(body.lender).trim() : null;
  const principal = Number(body?.principal);
  const annual_rate = Number(body?.annual_rate);
  const emi = Number(body?.emi);
  const start_date = body?.start_date ? String(body.start_date) : new Date().toISOString().slice(0, 10);

  if (!name) throw new HTTPException(400, { message: "Loan name is required" });
  if (!Number.isFinite(principal) || principal <= 0)
    throw new HTTPException(400, { message: "principal must be positive" });
  if (!Number.isFinite(annual_rate) || annual_rate < 0)
    throw new HTTPException(400, { message: "annual_rate must be >= 0" });
  if (!Number.isFinite(emi) || emi <= 0)
    throw new HTTPException(400, { message: "emi must be positive" });
  if (!dateRe.test(start_date))
    throw new HTTPException(400, { message: "start_date must be YYYY-MM-DD" });

  const principalP = toPaise(principal);
  const emiP = toPaise(emi);
  // Reject an EMI that can never amortize the loan.
  if (emiP <= monthlyInterest(principalP, annual_rate))
    throw new HTTPException(400, {
      message: "EMI is too low to cover the monthly interest — the loan would never close.",
    });

  const created = await c.env.DB.prepare(
    `INSERT INTO loans (user_id, name, lender, principal, annual_rate, emi, outstanding, start_date)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`,
  )
    .bind(user.sub, name, lender, principalP, annual_rate, emiP, principalP, start_date)
    .first<LoanRow>();
  if (!created) throw new HTTPException(500, { message: "Failed to create loan" });

  return c.json({ loan: serialize(created, 0) }, 201);
});

/** POST /api/loans/:id/pay — record an EMI (reducing balance) and optionally log a transaction. */
loans.post("/:id/pay", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => ({}));
  const logTransaction = body?.log_transaction !== false; // default: also record as an expense
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  // Idempotency: the client sends a key per payment *intent*, so a double-tap,
  // a retried request, or a flaky connection all resolve to one booked EMI
  // instead of two. Required — a missing key would silently reopen the bug.
  const idempotencyKey = body?.idempotency_key ? String(body.idempotency_key).slice(0, 100) : null;
  if (!idempotencyKey)
    throw new HTTPException(400, { message: "idempotency_key is required" });

  const loan = await c.env.DB.prepare("SELECT * FROM loans WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .first<LoanRow>();
  if (!loan) throw new HTTPException(404, { message: "Loan not found" });

  // Replay of a key we've already booked: return the original result unchanged
  // rather than erroring, so a retry looks identical to the first success.
  const prior = await c.env.DB.prepare(
    "SELECT * FROM loan_payments WHERE loan_id = ? AND idempotency_key = ?",
  )
    .bind(id, idempotencyKey)
    .first<{
      amount: number;
      interest_part: number;
      principal_part: number;
      balance_after: number;
    }>();
  if (prior) {
    return c.json({
      loan: serialize(loan, await paidCountFor(c.env.DB, id)),
      payment: {
        amount: toRupees(prior.amount),
        interest_part: toRupees(prior.interest_part),
        principal_part: toRupees(prior.principal_part),
        balance_after: toRupees(prior.balance_after),
      },
      replayed: true,
    });
  }

  if (loan.status === "closed") throw new HTTPException(400, { message: "Loan is already closed" });

  const interest = monthlyInterest(loan.outstanding, loan.annual_rate);
  let principal = loan.emi - interest;
  if (principal > loan.outstanding) principal = loan.outstanding; // final EMI
  const payment = interest + principal;
  const balanceAfter = loan.outstanding - principal;
  /*
    An EMI is usually recorded after the fact, so the caller picks the date and
    it becomes the expense's date too — otherwise last month's instalment lands
    in this month's spending, budgets and charts.

    A malformed or future date is rejected rather than quietly replaced with
    today: silently mis-dating a financial record is worse than refusing it.
  */
  const today = new Date().toISOString().slice(0, 10);
  let paidOn = today;
  if (body?.paid_on !== undefined && body?.paid_on !== null) {
    const requested = String(body.paid_on);
    if (!dateRe.test(requested)) {
      throw new HTTPException(400, { message: "paid_on must be a date in YYYY-MM-DD form" });
    }
    if (requested > today) {
      throw new HTTPException(400, { message: "paid_on cannot be in the future" });
    }
    paidOn = requested;
  }
  const nextStatus = balanceAfter <= 0 ? "closed" : "active";

  const stmts = [
    c.env.DB.prepare(
      `INSERT INTO loan_payments (loan_id, user_id, amount, interest_part, principal_part, balance_after, paid_on, idempotency_key)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(id, user.sub, payment, interest, principal, balanceAfter, paidOn, idempotencyKey),
    c.env.DB.prepare("UPDATE loans SET outstanding = ?, status = ? WHERE id = ? AND user_id = ?").bind(
      balanceAfter,
      nextStatus,
      id,
      user.sub,
    ),
  ];
  if (logTransaction) {
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO transactions (user_id, type, amount, category, note, occurred_on)
         VALUES (?, 'expense', ?, 'Loan EMI', ?, ?)`,
      ).bind(user.sub, payment, `${loan.name} EMI`, paidOn),
    );
  }

  // The UNIQUE(loan_id, idempotency_key) index is the real guard: two requests
  // racing past the SELECT above both reach here, and the second one's INSERT
  // fails, rolling back the whole batch. Treat that as a replay, not an error.
  try {
    await c.env.DB.batch(stmts);
  } catch (e) {
    const replay = await c.env.DB.prepare(
      "SELECT * FROM loan_payments WHERE loan_id = ? AND idempotency_key = ?",
    )
      .bind(id, idempotencyKey)
      .first<{
        amount: number;
        interest_part: number;
        principal_part: number;
        balance_after: number;
      }>();
    if (!replay) throw e;
    const current = await c.env.DB.prepare("SELECT * FROM loans WHERE id = ? AND user_id = ?")
      .bind(id, user.sub)
      .first<LoanRow>();
    return c.json({
      loan: serialize(current!, await paidCountFor(c.env.DB, id)),
      payment: {
        amount: toRupees(replay.amount),
        interest_part: toRupees(replay.interest_part),
        principal_part: toRupees(replay.principal_part),
        balance_after: toRupees(replay.balance_after),
      },
      replayed: true,
    });
  }

  const updated = await c.env.DB.prepare("SELECT * FROM loans WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .first<LoanRow>();
  return c.json({
    loan: serialize(updated!, await paidCountFor(c.env.DB, id)),
    payment: {
      amount: toRupees(payment),
      interest_part: toRupees(interest),
      principal_part: toRupees(principal),
      balance_after: toRupees(balanceAfter),
    },
  });
});

/**
 * POST /api/loans/:id/prepay — a lump sum straight off the principal.
 *
 * Distinct from an EMI, and not a variation of one. An instalment is split into
 * interest and principal; a prepayment is entirely principal, which is exactly
 * why it saves money — every future month's interest is then charged on a
 * smaller balance.
 *
 * The response reports that saving, computed by projecting the schedule before
 * and after. It is the number that makes someone actually do it, and the app
 * was already claiming it on the EMI calculator page while being unable to
 * record one.
 *
 * Body: { amount, paid_on?, idempotency_key, log_transaction? }
 */
loans.post("/:id/prepay", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const body = await c.req.json().catch(() => null);
  const idempotencyKey = String(body?.idempotency_key ?? "").trim();
  if (!idempotencyKey)
    throw new HTTPException(400, { message: "idempotency_key is required" });

  const logTransaction = body?.log_transaction !== false;

  // Same replay handling as an EMI: a repeated intent returns the original
  // result rather than paying down the loan twice.
  const priorPayment = await c.env.DB.prepare(
    "SELECT * FROM loan_payments WHERE loan_id = ? AND idempotency_key = ?",
  )
    .bind(id, idempotencyKey)
    .first<{ amount: number; principal_part: number; balance_after: number }>();

  const loan = await c.env.DB.prepare("SELECT * FROM loans WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .first<LoanRow>();
  if (!loan) throw new HTTPException(404, { message: "Loan not found" });

  if (priorPayment) {
    return c.json({
      loan: serialize(loan, await paidCountFor(c.env.DB, id)),
      payment: {
        amount: toRupees(priorPayment.amount),
        principal_part: toRupees(priorPayment.principal_part),
        balance_after: toRupees(priorPayment.balance_after),
      },
      replayed: true,
    });
  }

  if (loan.status === "closed") throw new HTTPException(400, { message: "Loan is already closed" });

  const amount = Number(body?.amount);
  if (!Number.isFinite(amount) || amount <= 0)
    throw new HTTPException(400, { message: "amount must be a positive number" });

  const amountPaise = toPaise(amount);
  if (amountPaise > loan.outstanding)
    throw new HTTPException(400, {
      message: "Prepayment cannot be more than the outstanding balance",
    });

  const today = new Date().toISOString().slice(0, 10);
  let paidOn = today;
  if (body?.paid_on !== undefined && body?.paid_on !== null) {
    const requested = String(body.paid_on);
    if (!dateRe.test(requested))
      throw new HTTPException(400, { message: "paid_on must be a date in YYYY-MM-DD form" });
    if (requested > today)
      throw new HTTPException(400, { message: "paid_on cannot be in the future" });
    paidOn = requested;
  }

  const balanceAfter = loan.outstanding - amountPaise;
  const nextStatus = balanceAfter <= 0 ? "closed" : "active";

  // What this actually bought, in interest and in months.
  const before = projectSchedule(loan.outstanding, loan.annual_rate, loan.emi);
  const after =
    balanceAfter > 0 ? projectSchedule(balanceAfter, loan.annual_rate, loan.emi) : null;
  const interestSaved = before.totalInterest - (after?.totalInterest ?? 0);
  const monthsSaved = before.months - (after?.months ?? 0);

  const stmts = [
    c.env.DB.prepare(
      `INSERT INTO loan_payments
         (loan_id, user_id, amount, interest_part, principal_part, balance_after, paid_on, idempotency_key, kind)
       VALUES (?, ?, ?, 0, ?, ?, ?, ?, 'prepayment')`,
    ).bind(id, user.sub, amountPaise, amountPaise, balanceAfter, paidOn, idempotencyKey),
    c.env.DB.prepare("UPDATE loans SET outstanding = ?, status = ? WHERE id = ? AND user_id = ?").bind(
      balanceAfter,
      nextStatus,
      id,
      user.sub,
    ),
  ];
  if (logTransaction) {
    stmts.push(
      c.env.DB.prepare(
        `INSERT INTO transactions (user_id, type, amount, category, note, occurred_on)
         VALUES (?, 'expense', ?, 'Loan prepayment', ?, ?)`,
      ).bind(user.sub, amountPaise, `${loan.name} prepayment`, paidOn),
    );
  }

  try {
    await c.env.DB.batch(stmts);
  } catch (e) {
    // The UNIQUE index caught a race past the SELECT above. Treat as a replay.
    const replay = await c.env.DB.prepare(
      "SELECT * FROM loan_payments WHERE loan_id = ? AND idempotency_key = ?",
    )
      .bind(id, idempotencyKey)
      .first<{ amount: number; principal_part: number; balance_after: number }>();
    if (!replay) throw e;
    const current = await c.env.DB.prepare("SELECT * FROM loans WHERE id = ? AND user_id = ?")
      .bind(id, user.sub)
      .first<LoanRow>();
    return c.json({
      loan: serialize(current!, await paidCountFor(c.env.DB, id)),
      payment: {
        amount: toRupees(replay.amount),
        principal_part: toRupees(replay.principal_part),
        balance_after: toRupees(replay.balance_after),
      },
      replayed: true,
    });
  }

  const updated = await c.env.DB.prepare("SELECT * FROM loans WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .first<LoanRow>();

  return c.json({
    loan: serialize(updated!, await paidCountFor(c.env.DB, id)),
    payment: {
      amount: toRupees(amountPaise),
      principal_part: toRupees(amountPaise),
      balance_after: toRupees(balanceAfter),
    },
    saved: {
      interest: toRupees(interestSaved),
      months: monthsSaved,
      closed: nextStatus === "closed",
    },
  });
});

/** POST /api/loans/:id/rate — floating rate change (affects future interest). Body: { annual_rate, effective_from? } */
loans.post("/:id/rate", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => null);
  const annual_rate = Number(body?.annual_rate);
  const effective_from = body?.effective_from ? String(body.effective_from) : new Date().toISOString().slice(0, 10);

  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });
  if (!Number.isFinite(annual_rate) || annual_rate < 0)
    throw new HTTPException(400, { message: "annual_rate must be >= 0" });
  if (!dateRe.test(effective_from))
    throw new HTTPException(400, { message: "effective_from must be YYYY-MM-DD" });

  const loan = await c.env.DB.prepare("SELECT * FROM loans WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .first<LoanRow>();
  if (!loan) throw new HTTPException(404, { message: "Loan not found" });

  await c.env.DB.batch([
    c.env.DB.prepare(
      "INSERT INTO loan_rate_changes (loan_id, annual_rate, effective_from) VALUES (?, ?, ?)",
    ).bind(id, annual_rate, effective_from),
    c.env.DB.prepare("UPDATE loans SET annual_rate = ? WHERE id = ? AND user_id = ?").bind(
      annual_rate,
      id,
      user.sub,
    ),
  ]);

  const updated = await c.env.DB.prepare("SELECT * FROM loans WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .first<LoanRow>();
  return c.json({ loan: serialize(updated!, await paidCountFor(c.env.DB, id)) });
});

/** PATCH /api/loans/:id — edit name/lender/emi. */
loans.patch("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  const body = await c.req.json().catch(() => null);
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });

  const loan = await c.env.DB.prepare("SELECT * FROM loans WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .first<LoanRow>();
  if (!loan) throw new HTTPException(404, { message: "Loan not found" });

  const name = body?.name != null ? String(body.name).trim() : loan.name;
  const lender = body?.lender !== undefined ? (body.lender ? String(body.lender).trim() : null) : loan.lender;
  const emi = body?.emi != null ? toPaise(Number(body.emi)) : loan.emi;

  if (!name) throw new HTTPException(400, { message: "Loan name is required" });
  if (!Number.isFinite(emi) || emi <= 0) throw new HTTPException(400, { message: "invalid emi" });
  if (emi <= monthlyInterest(loan.outstanding, loan.annual_rate))
    throw new HTTPException(400, { message: "EMI too low to cover monthly interest" });

  await c.env.DB.prepare("UPDATE loans SET name = ?, lender = ?, emi = ? WHERE id = ? AND user_id = ?")
    .bind(name, lender, emi, id, user.sub)
    .run();
  const updated = await c.env.DB.prepare("SELECT * FROM loans WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .first<LoanRow>();
  return c.json({ loan: serialize(updated!, await paidCountFor(c.env.DB, id)) });
});

/** DELETE /api/loans/:id */
loans.delete("/:id", async (c) => {
  const user = c.get("user");
  const id = Number(c.req.param("id"));
  if (!Number.isInteger(id)) throw new HTTPException(400, { message: "Invalid id" });
  const res = await c.env.DB.prepare("DELETE FROM loans WHERE id = ? AND user_id = ?")
    .bind(id, user.sub)
    .run();
  if (!res.meta.changes) throw new HTTPException(404, { message: "Loan not found" });
  return c.json({ ok: true });
});

export default loans;
