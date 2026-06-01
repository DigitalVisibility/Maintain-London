-- Maintain London Project Hub: Time tracking (clock in/out per project)
-- Run with: wrangler d1 execute maintain-london-db --file=./migrations/0008_time_tracking.sql

-- Break handling per organisation:
--   break_mode = 'pause' → operatives pause/resume; actual break time is tracked
--   break_mode = 'fixed' → a fixed break is auto-deducted at clock-out
ALTER TABLE organisations ADD COLUMN break_mode TEXT NOT NULL DEFAULT 'pause';
ALTER TABLE organisations ADD COLUMN fixed_break_minutes INTEGER NOT NULL DEFAULT 30;

-- One row per clock-in → clock-out, with geolocation at each end.
CREATE TABLE IF NOT EXISTS time_sessions (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  user_name TEXT,
  clock_in TEXT NOT NULL,
  clock_out TEXT,
  clock_in_lat REAL,
  clock_in_lng REAL,
  clock_out_lat REAL,
  clock_out_lng REAL,
  break_minutes REAL NOT NULL DEFAULT 0,
  break_started_at TEXT,                       -- set while on a live break
  status TEXT NOT NULL DEFAULT 'active',       -- active | on_break | completed
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_time_user_status ON time_sessions(user_id, status);
CREATE INDEX IF NOT EXISTS idx_time_project ON time_sessions(project_id);
CREATE INDEX IF NOT EXISTS idx_time_org_in ON time_sessions(org_id, clock_in);
