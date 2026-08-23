-- Voice capture + AI drafting.
--
-- The point of this set is that a day on site can be recorded by talking and
-- pointing a camera. Audio lands in R2, Whisper turns it into a transcript, and
-- Claude turns the transcript + the photos into a *structured* draft entry that
-- a human confirms. Nothing here writes to the diary directly — a draft is
-- always proposed, never applied, so the operative stays the author of record.

-- One recorded note. Attached to a diary entry, to a single photo, or to a
-- walkthrough quote — exactly one of those, or to none while still being taken.
CREATE TABLE IF NOT EXISTS voice_notes (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  project_id TEXT,
  entry_id TEXT,
  quote_id TEXT,
  -- entry_files.id, when the note is commentary on one specific photo
  file_id TEXT,
  r2_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER,
  duration_s REAL,
  transcript TEXT,
  language TEXT,
  -- pending | transcribed | failed. A failed transcript keeps its audio so it
  -- can be retried or played back by hand rather than silently disappearing.
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  transcribed_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_voice_entry ON voice_notes(entry_id);
CREATE INDEX IF NOT EXISTS idx_voice_quote ON voice_notes(quote_id);
CREATE INDEX IF NOT EXISTS idx_voice_file ON voice_notes(file_id);
CREATE INDEX IF NOT EXISTS idx_voice_project ON voice_notes(project_id);

-- A proposed structured entry awaiting a human's confirmation. `payload` is the
-- same JSON shape the diary form posts, so applying a draft is the ordinary
-- save path — not a second way of writing a diary entry.
CREATE TABLE IF NOT EXISTS diary_drafts (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  project_id TEXT NOT NULL,
  entry_id TEXT,
  -- voice | photos | both
  source TEXT NOT NULL DEFAULT 'voice',
  payload TEXT,
  -- pending | applied | discarded | failed
  status TEXT NOT NULL DEFAULT 'pending',
  error TEXT,
  created_by TEXT NOT NULL,
  created_at TEXT NOT NULL,
  applied_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_draft_entry ON diary_drafts(entry_id);
CREATE INDEX IF NOT EXISTS idx_draft_project ON diary_drafts(project_id, status);

-- AI-written caption and tags live alongside the human caption rather than
-- overwriting it: the machine's guess never destroys what a person typed.
ALTER TABLE entry_files ADD COLUMN ai_caption TEXT;
ALTER TABLE entry_files ADD COLUMN ai_tags TEXT;
ALTER TABLE entry_files ADD COLUMN ai_status TEXT;

-- Capture metadata, for the burned-in stamp and for ordering a photo timeline
-- by when the shutter fired rather than when the upload finished.
ALTER TABLE entry_files ADD COLUMN taken_at TEXT;
ALTER TABLE entry_files ADD COLUMN lat REAL;
ALTER TABLE entry_files ADD COLUMN lng REAL;
