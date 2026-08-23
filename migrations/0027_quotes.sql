-- Quotes: the pre-project object.
--
-- Everything else in the platform starts at a project — i.e. at a job already
-- won. A walkthrough of a job you are *pricing* had nowhere to live. A quote is
-- that home: walk the site, shoot and talk, and the AI proposes a sectioned
-- scope the office prices. On acceptance it graduates into a project, and the
-- accepted net becomes that project's quoted sum, so the valuation in
-- lib/financials.ts reads the same figure the client signed.

CREATE TABLE IF NOT EXISTS quotes (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  -- Sequential per business (Q0001, Q0002 …), minted on first save.
  number TEXT,
  title TEXT NOT NULL,
  client_name TEXT,
  client_email TEXT,
  address TEXT,
  postcode TEXT,
  -- draft | sent | accepted | declined
  status TEXT NOT NULL DEFAULT 'draft',
  vat_rate REAL NOT NULL DEFAULT 20,
  notes TEXT,
  -- JSON array of the unknowns the walkthrough flagged but could not price
  -- ("no access to the loft", "consumer unit age unconfirmed"). Surfaced to the
  -- estimator, never silently dropped — an unpriced unknown is the single most
  -- expensive thing to discover after winning the job.
  assumptions TEXT,
  -- Set once accepted and converted; the project this quote became.
  project_id TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  sent_at TEXT,
  accepted_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_quotes_org ON quotes(org_id, status);
CREATE INDEX IF NOT EXISTS idx_quotes_project ON quotes(project_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_quotes_number ON quotes(org_id, number);

-- A priced line. `section` groups by room or area, which is how a walkthrough
-- naturally divides and how a client reads a quote.
CREATE TABLE IF NOT EXISTS quote_items (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL,
  section TEXT,
  description TEXT NOT NULL,
  qty REAL,
  unit TEXT,
  rate REAL,
  net REAL,
  -- 1 = provisional sum / needs confirming on site before it is committed
  provisional INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_quote_items ON quote_items(quote_id, sort_order);

-- Walkthrough photos. Deliberately a separate table from entry_files: those
-- hang off a diary entry, and a quote has no entry (or project) yet.
CREATE TABLE IF NOT EXISTS quote_files (
  id TEXT PRIMARY KEY,
  quote_id TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  filename TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER,
  caption TEXT,
  ai_caption TEXT,
  ai_tags TEXT,
  -- quote_items.id, when the photo is evidence for one specific line
  linked_to TEXT,
  taken_at TEXT,
  lat REAL,
  lng REAL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_quote_files ON quote_files(quote_id);
CREATE UNIQUE INDEX IF NOT EXISTS idx_quote_files_key ON quote_files(r2_key);
