-- Per-user capability grants.
--
-- Some things — seeing the money (quotes, invoices, variations, the valuation) —
-- should be decided per person, not just per role. The owner and admins always
-- see it; managers and operatives do not by default, and the owner grants it to
-- the specific people who should. This table holds those per-user grants; it wins
-- over the role default and the per-role override.

CREATE TABLE IF NOT EXISTS user_capabilities (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  capability TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_capabilities
  ON user_capabilities(org_id, user_id, capability);
