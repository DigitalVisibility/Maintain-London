-- Support for clock in/out reminder pushes.
-- reminded_at stamps an open session once we've nudged "don't forget to clock
-- out", so the reminder fires once, not every cron run.
ALTER TABLE time_sessions ADD COLUMN reminded_at TEXT;

-- One row per person per day once we've nudged "don't forget to clock in".
CREATE TABLE IF NOT EXISTS clock_in_reminders (
  user_id TEXT NOT NULL,
  date TEXT NOT NULL,
  created_at TEXT NOT NULL,
  PRIMARY KEY (user_id, date)
);
