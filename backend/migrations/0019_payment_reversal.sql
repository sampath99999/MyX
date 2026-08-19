-- Undoing a loan payment
--
-- Recording an EMI or a prepayment writes three things: a loan_payments row,
-- a new outstanding balance, and an expense. Nothing tied them together, so
-- deleting the expense in the Money module left the loan still believing it had
-- been paid — the balance stayed reduced with no record of the money leaving.
-- There was also no way to undo the payment itself, from anywhere.
--
-- Linking the booked expense means an undo can remove both halves. Nullable
-- because payments recorded before this migration have no recoverable link:
-- undoing one of those reverses the loan and leaves its expense alone rather
-- than guessing which transaction it was.

ALTER TABLE loan_payments ADD COLUMN transaction_id INTEGER
  REFERENCES transactions(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_loan_payments_transaction
  ON loan_payments(transaction_id);
