-- Scheduled / milestone-triggered client summaries.
--
-- The cadence is a *business* setting with a per-project override, not a
-- hard-coded Friday 4pm: a roofer running stage payments off task completion
-- needs a milestone trigger, not a calendar one. Both feed the same pipeline —
-- gather the period, draft a narrative, queue it for approval, send, archive.

-- ── Business-wide defaults ──────────────────────────────────────────────────
-- cadence: manual | daily | weekly | fortnightly | monthly | milestone
--   summary_day  — weekly/fortnightly: ISO weekday (1 = Mon … 7 = Sun)
--                  monthly:            day of month (1–28)
--   summary_time — local wall-clock "HH:MM" in the org's timezone
--   summary_anchor — a date the fortnightly cycle counts from
ALTER TABLE organisations ADD COLUMN summary_cadence TEXT NOT NULL DEFAULT 'weekly';
ALTER TABLE organisations ADD COLUMN summary_day INTEGER NOT NULL DEFAULT 5;      -- Friday
ALTER TABLE organisations ADD COLUMN summary_time TEXT NOT NULL DEFAULT '16:00';  -- 4pm
ALTER TABLE organisations ADD COLUMN summary_anchor TEXT;
ALTER TABLE organisations ADD COLUMN timezone TEXT NOT NULL DEFAULT 'Europe/London';

-- ── Per-project override (NULL = inherit the business default) ──────────────
-- Payment terms are per contract, not per company: one job can run weekly while
-- another on the same account runs off milestones.
ALTER TABLE projects ADD COLUMN summary_cadence TEXT;
ALTER TABLE projects ADD COLUMN summary_day INTEGER;
ALTER TABLE projects ADD COLUMN summary_time TEXT;
ALTER TABLE projects ADD COLUMN summary_anchor TEXT;

-- The scheduled occurrence this project last fired for. The cron sweep compares
-- it against the most recent due occurrence, so a summary fires exactly once per
-- occurrence however often the sweep runs.
ALTER TABLE projects ADD COLUMN summary_last_fired_at TEXT;

-- ── Milestones ─────────────────────────────────────────────────────────────
-- "Roof stripped, felted, battened — watertight." A milestone is both a
-- programme marker and, later, what a stage payment hangs off — so it is one
-- object, defined once, rather than two that drift apart.
CREATE TABLE IF NOT EXISTS project_milestones (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  project_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  target_date TEXT,
  status TEXT NOT NULL DEFAULT 'pending',   -- pending | complete
  completed_at TEXT,
  completed_by TEXT,
  /* Completing this milestone drafts a client summary covering the work since
     the last one. */
  triggers_summary INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_milestones_project ON project_milestones(project_id, sort_order);

-- ── Summaries ──────────────────────────────────────────────────────────────
-- Every summary covers the period since the last one was sent — which is what
-- lets a calendar cadence and a milestone share one pipeline.
CREATE TABLE IF NOT EXISTS summaries (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  project_id TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end TEXT NOT NULL,
  trigger TEXT NOT NULL,                    -- scheduled | manual | milestone
  milestone_id TEXT,
  status TEXT NOT NULL DEFAULT 'draft',     -- draft | approved | sent | skipped
  title TEXT,
  narrative TEXT,                           -- Claude's draft; editable before sending
  entry_count INTEGER NOT NULL DEFAULT 0,
  photo_count INTEGER NOT NULL DEFAULT 0,
  /* The sent HTML, archived to R2 so there is a permanent record of exactly
     what the client was told. */
  r2_key TEXT,
  recipients TEXT,
  approved_by TEXT,
  approved_at TEXT,
  sent_at TEXT,
  error TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
  FOREIGN KEY (milestone_id) REFERENCES project_milestones(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_summaries_project ON summaries(project_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_summaries_status ON summaries(org_id, status);
