-- Project schedules — the programme and procurement wireframes.
--
-- Programme: the tasks that make up the job, on a timeline (a lightweight Gantt).
-- Procurement: what needs ordering, from whom, by when, and where it's got to.
-- Both carry a client-visible flag so the client's portal can show the programme
-- (his "project schedules") without exposing internal procurement chatter.
--
-- The "financial schedule" isn't a table: it IS the invoices and the valuation
-- from Phase 4, presented as a timeline — no second copy of the money to drift.

CREATE TABLE IF NOT EXISTS programme_tasks (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  start_date TEXT,             -- YYYY-MM-DD
  end_date TEXT,               -- YYYY-MM-DD
  status TEXT NOT NULL DEFAULT 'not_started',  -- not_started | in_progress | complete
  sort_order INTEGER NOT NULL DEFAULT 0,
  client_visible INTEGER NOT NULL DEFAULT 1,   -- the programme is normally shared
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_programme_project ON programme_tasks(project_id, sort_order);

CREATE TABLE IF NOT EXISTS procurement_items (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  project_id TEXT NOT NULL,
  item TEXT NOT NULL,
  supplier TEXT,
  required_by TEXT,            -- YYYY-MM-DD
  status TEXT NOT NULL DEFAULT 'to_order',     -- to_order | ordered | delivered
  notes TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  client_visible INTEGER NOT NULL DEFAULT 0,   -- procurement is internal by default
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_procurement_project ON procurement_items(project_id, sort_order);
