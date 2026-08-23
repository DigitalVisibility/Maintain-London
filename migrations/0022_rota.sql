-- Per-site rota: who is expected on which job, and when.
--
-- Each person already has a default working pattern (people.default_*). A rota
-- row assigns them to a specific project and may override the days/hours for
-- that site. The live attendance board measures actual clock-ins and the
-- manager's register against this expectation to flag late / no-show.

CREATE TABLE IF NOT EXISTS project_rota (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  project_id TEXT NOT NULL,
  person_id TEXT NOT NULL,
  days TEXT,           -- CSV weekday numbers (Mon=1 … Sun=7); null = use the person's default
  start_time TEXT,     -- 'HH:MM'; null = use the person's default
  end_time TEXT,       -- 'HH:MM'; null = use the person's default
  created_at TEXT NOT NULL,
  UNIQUE(project_id, person_id)
);
CREATE INDEX IF NOT EXISTS idx_rota_project ON project_rota(project_id);
CREATE INDEX IF NOT EXISTS idx_rota_org ON project_rota(org_id);
