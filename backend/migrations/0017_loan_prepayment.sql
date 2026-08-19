-- Loan prepayments
--
-- A part-prepayment is structurally a payment row that is all principal and no
-- interest, so loan_payments already holds one. What it could not do is say so:
-- a ₹1,00,000 prepayment and a ₹1,00,000 EMI were indistinguishable in the
-- history, and the running "instalments paid" count included both.
--
-- Existing rows are EMIs by definition — prepayments could not be recorded
-- before this migration.

ALTER TABLE loan_payments ADD COLUMN kind TEXT NOT NULL DEFAULT 'emi'
  CHECK (kind IN ('emi', 'prepayment'));
