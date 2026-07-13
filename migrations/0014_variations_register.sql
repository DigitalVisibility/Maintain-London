-- The variations register: the contractual record of every change to the job,
-- numbered per project (0001, 0002 …), each with net / VAT / total and a status
-- that runs Draft → Pending → Approved / Rejected. This is the master record for
-- the money — Phase 4's revised contract sum is the quote plus the *approved*
-- variations, so the status here is what decides whether a variation counts.

CREATE TABLE IF NOT EXISTS variations (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  project_id TEXT NOT NULL,

  /* Sequential per project, shown zero-padded as 0001. Stored as an int so
     "next number" is just MAX+1 and the register sorts correctly. */
  number INTEGER NOT NULL,

  description TEXT NOT NULL,

  /* net + VAT = total. All three are stored, not just net, so an exported row is
     self-contained and a rate change later doesn't silently restate history. */
  net REAL NOT NULL DEFAULT 0,
  vat_rate REAL NOT NULL DEFAULT 20,   -- UK: 20 standard, 5 reduced, 0 zero-rated
  vat REAL NOT NULL DEFAULT 0,
  total REAL NOT NULL DEFAULT 0,

  status TEXT NOT NULL DEFAULT 'draft',  -- draft | pending | approved | rejected

  /* Where it came from. A variation noted on the site diary auto-creates a draft
     here; source_entry_id / source_variation_id link back to that diary line so
     the same line is never promoted twice. NULL for one raised by hand. */
  source_entry_id TEXT,
  source_variation_id TEXT,

  /* The approval this variation raised (reuses the existing tiered engine +
     one-tap client decide link). The decision writes back to status. */
  approval_id TEXT,

  created_by TEXT,
  created_by_name TEXT,
  raised_at TEXT,
  decided_at TEXT,
  decided_by_name TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,

  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_variations_project ON variations(project_id, number);
CREATE INDEX IF NOT EXISTS idx_variations_status ON variations(org_id, status);
-- One register entry per diary variation line (dedupes the auto-promotion).
CREATE UNIQUE INDEX IF NOT EXISTS idx_variations_source
  ON variations(source_variation_id) WHERE source_variation_id IS NOT NULL;

-- How a variation is signed off, per project. A variation changes what the client
-- pays, so the default is that the client always approves it — separate from the
-- operational spend tiers (approval_auto_limit / approval_manager_limit), which
-- are about letting the site team buy extra materials without asking.
--   client — every variation needs the client's sign-off (default)
--   tiered — follow the project's spend tiers (auto / manager / client by cost)
ALTER TABLE projects ADD COLUMN variation_approval TEXT NOT NULL DEFAULT 'client';

-- Link an approval back to the variation that raised it, so a decision (in-app or
-- via the emailed one-tap link) updates the register.
ALTER TABLE approval_requests ADD COLUMN variation_id TEXT;
