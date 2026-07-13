-- The document hub: project-level files, organised into folders.
--
-- Until now files could only hang off a diary entry (entry_files). This is the
-- project's own filing cabinet — drawings, contracts, handover packs — the folder
-- grid from the wireframe. Each file is tagged with a folder and a client-visible
-- flag, so the team decides what the client sees (contracts and handovers, yes;
-- superseded drawings, no).

CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  org_id TEXT,
  project_id TEXT NOT NULL,
  folder TEXT NOT NULL DEFAULT 'Documents',
  filename TEXT NOT NULL,
  r2_key TEXT NOT NULL,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER,
  caption TEXT,
  client_visible INTEGER NOT NULL DEFAULT 0,
  uploaded_by TEXT,
  uploaded_by_name TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_documents_project ON documents(project_id, folder);
CREATE INDEX IF NOT EXISTS idx_documents_key ON documents(r2_key);
