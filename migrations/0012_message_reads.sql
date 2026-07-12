-- Read state and notification throttling for the per-project message thread.
--
-- Until now a client message notified nobody: it sat in the thread until someone
-- happened to open the project. This row is what lets us say "you have unread
-- messages" and, crucially, "we already told you about this thread ten minutes
-- ago, so don't email again" — a notification that fires on every message trains
-- people to ignore it.

CREATE TABLE IF NOT EXISTS message_reads (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  /* Everything in this thread created after this is unread for this user. */
  last_read_at TEXT,
  /* When we last emailed this user about this thread — the throttle. */
  last_notified_at TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (project_id, user_id),
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_message_reads_user ON message_reads(user_id);
