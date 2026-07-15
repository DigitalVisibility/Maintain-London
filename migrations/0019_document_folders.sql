-- Per-business document folders.
--
-- The hub used to force the same nine folders on everyone, but a roofer has no
-- "Bathrooms" and a kitchen fitter has no "Roof". Each business now defines its
-- own folders — starting from a standard cross-trade set they can add to, rename,
-- or remove. The `documents.folder` column already holds a free-text folder name,
-- so this table just describes which folders a business *has* (so an empty one
-- still shows in the grid to file into) and whether each is client-facing by
-- default.

CREATE TABLE IF NOT EXISTS document_folders (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  client_default INTEGER NOT NULL DEFAULT 0,   -- new uploads here default to client-visible?
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_document_folders_org ON document_folders(org_id, sort_order);
-- A business can't have two folders with the same name.
CREATE UNIQUE INDEX IF NOT EXISTS idx_document_folders_name ON document_folders(org_id, name);
