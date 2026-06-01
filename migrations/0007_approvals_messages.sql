-- Maintain London Project Hub: Additional-works approvals + per-project messaging
-- Run with: wrangler d1 execute maintain-london-db --file=./migrations/0007_approvals_messages.sql

-- Per-project pre-authorisation spend limits (tiered approval).
--   cost <= auto_limit         → auto-approved (just logged, client notified)
--   auto_limit < cost <= mgr   → needs a manager's approval
--   cost > manager_limit       → needs the client's approval
ALTER TABLE projects ADD COLUMN approval_auto_limit REAL NOT NULL DEFAULT 150;
ALTER TABLE projects ADD COLUMN approval_manager_limit REAL NOT NULL DEFAULT 750;

-- Additional-works / variation approval requests.
CREATE TABLE IF NOT EXISTS approval_requests (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  entry_id TEXT REFERENCES diary_entries(id) ON DELETE SET NULL,
  type TEXT NOT NULL DEFAULT 'additional_work',  -- additional_work | extra_materials | variation | other
  description TEXT NOT NULL,
  est_cost REAL,
  photo_key TEXT,                                -- optional R2 key for a supporting photo
  requested_by TEXT REFERENCES user(id),
  requested_by_name TEXT,
  required_level TEXT NOT NULL DEFAULT 'manager', -- auto | manager | client | emergency
  status TEXT NOT NULL DEFAULT 'pending',         -- pending | approved | rejected | auto_approved | emergency
  is_emergency INTEGER NOT NULL DEFAULT 0,
  reason TEXT,                                    -- emergency justification
  approver_id TEXT REFERENCES user(id),
  approver_name TEXT,
  decided_at TEXT,
  decide_token TEXT UNIQUE,                       -- magic-link one-tap decision (no login)
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_approvals_project ON approval_requests(project_id);
CREATE INDEX IF NOT EXISTS idx_approvals_org_status ON approval_requests(org_id, status);
CREATE INDEX IF NOT EXISTS idx_approvals_token ON approval_requests(decide_token);

-- Per-project message thread (team ↔ client).
CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT REFERENCES user(id),
  author_name TEXT,
  author_role TEXT,
  body TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_project ON messages(project_id, created_at);
