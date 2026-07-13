-- Interim valuations and client invoices — the invoice-summary sketch, made real.
--
-- The model, straight off the sketch and internally consistent:
--   revised contract sum = quoted + approved variations
--   value of work done   = % complete × revised contract sum
--   next instalment due  = value of work done − paid to date
--   balance outstanding  = revised contract sum − paid to date
-- Only the quote, the % complete, and the invoices are stored; everything else
-- is computed live so it can never drift out of step with the register or the
-- payments. Approved variations come from Phase 3's register.

-- The original contract sum and how far the job has got. Net + a VAT rate; the
-- VAT and total are derived, never stored on the project.
ALTER TABLE projects ADD COLUMN quoted_net REAL NOT NULL DEFAULT 0;
ALTER TABLE projects ADD COLUMN quoted_vat_rate REAL NOT NULL DEFAULT 20;
ALTER TABLE projects ADD COLUMN percent_complete REAL NOT NULL DEFAULT 0;  -- 0–100

-- A real business runs one sequential invoice number series, so numbering is
-- per-org, not per-project — and seedable, so a business can align it with the
-- books it already keeps ("our next invoice is 1050").
ALTER TABLE organisations ADD COLUMN invoice_next_number INTEGER NOT NULL DEFAULT 1;

-- Client invoices / instalments. A deposit is just an invoice — nothing special,
-- it's an amount with a status. Net + VAT + total are all stored so an issued
-- invoice is a fixed record, unaffected by a later rate change.
CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  project_id TEXT NOT NULL,

  number INTEGER NOT NULL,          -- sequential per business
  description TEXT NOT NULL,        -- "Deposit", "2nd instalment", "Interim valuation at 20%"

  net REAL NOT NULL DEFAULT 0,
  vat_rate REAL NOT NULL DEFAULT 20,
  vat REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,

  status TEXT NOT NULL DEFAULT 'draft',  -- draft | sent | paid
  is_deposit INTEGER NOT NULL DEFAULT 0,

  issued_at TEXT,
  due_at TEXT,
  paid_at TEXT,

  created_by TEXT,
  created_by_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_invoices_project ON invoices(project_id, number);
CREATE INDEX IF NOT EXISTS idx_invoices_status ON invoices(org_id, status);
