-- Maintain London Project Hub: Client visibility / vetting
-- Adds per-item + per-photo "client can see this" flags plus an entry-level
-- release gate, so a site manager can vet exactly what a client sees.
-- Run with: wrangler d1 execute maintain-london-db --file=./migrations/0004_client_visibility.sql
--
-- Model: nothing reaches the client until the entry is released
-- (client_released = 1). Within a released entry, items/photos are HIDDEN by
-- default (client_visible = 0) and must be explicitly ticked to show.

-- Entry-level gate + entry-level field visibility (weather / notes)
ALTER TABLE diary_entries ADD COLUMN client_released INTEGER NOT NULL DEFAULT 0;
ALTER TABLE diary_entries ADD COLUMN client_released_at TEXT;
ALTER TABLE diary_entries ADD COLUMN weather_visible INTEGER NOT NULL DEFAULT 0;
ALTER TABLE diary_entries ADD COLUMN notes_visible INTEGER NOT NULL DEFAULT 0;

-- Per-item visibility (hidden by default → tick to show)
ALTER TABLE entry_personnel ADD COLUMN client_visible INTEGER NOT NULL DEFAULT 0;
ALTER TABLE entry_activities ADD COLUMN client_visible INTEGER NOT NULL DEFAULT 0;
ALTER TABLE entry_delays ADD COLUMN client_visible INTEGER NOT NULL DEFAULT 0;
ALTER TABLE entry_variations ADD COLUMN client_visible INTEGER NOT NULL DEFAULT 0;
ALTER TABLE entry_materials_required ADD COLUMN client_visible INTEGER NOT NULL DEFAULT 0;
ALTER TABLE entry_equipment_hire ADD COLUMN client_visible INTEGER NOT NULL DEFAULT 0;
ALTER TABLE entry_deliveries ADD COLUMN client_visible INTEGER NOT NULL DEFAULT 0;

-- Per-photo / per-file visibility
ALTER TABLE entry_files ADD COLUMN client_visible INTEGER NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_entries_released ON diary_entries(client_released);
