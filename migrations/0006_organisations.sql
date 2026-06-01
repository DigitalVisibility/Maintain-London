-- Maintain London Project Hub: Multi-tenant foundation (organisations)
-- Adds the tenant boundary so the same app can run several businesses, with a
-- single login able to switch between the businesses it belongs to.
-- Run with: wrangler d1 execute maintain-london-db --file=./migrations/0006_organisations.sql
--
-- Model: organisations = tenants. memberships = which users belong to which org
-- and with what role (a user can be in several orgs, e.g. the owner). Tenant-
-- owned rows (projects, suppliers, invitations) carry org_id; diary entries and
-- their sub-records inherit their org via their project.

-- Organisations (tenants) — also holds per-business branding/config.
CREATE TABLE IF NOT EXISTS organisations (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE,
  brand_color TEXT NOT NULL DEFAULT '#AEDE4A',
  logo_url TEXT,
  email_from TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Memberships: user ↔ org, with the user's role IN that org.
CREATE TABLE IF NOT EXISTS memberships (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  org_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'operative',  -- owner | admin | manager | operative | client
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, org_id)
);
CREATE INDEX IF NOT EXISTS idx_memberships_user ON memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_memberships_org ON memberships(org_id);

-- Tenant scoping on existing tables (nullable add, then backfilled below).
ALTER TABLE projects ADD COLUMN org_id TEXT REFERENCES organisations(id);
ALTER TABLE suppliers ADD COLUMN org_id TEXT REFERENCES organisations(id);
ALTER TABLE invitations ADD COLUMN org_id TEXT REFERENCES organisations(id);

CREATE INDEX IF NOT EXISTS idx_projects_org ON projects(org_id);
CREATE INDEX IF NOT EXISTS idx_suppliers_org ON suppliers(org_id);

-- Seed Maintain London as the first organisation and attach all existing data.
INSERT OR IGNORE INTO organisations (id, name, slug, brand_color, logo_url)
VALUES ('org-maintain-london', 'Maintain London', 'maintain-london', '#AEDE4A', '/images/Icons/Stacked.png');

UPDATE projects   SET org_id = 'org-maintain-london' WHERE org_id IS NULL;
UPDATE suppliers  SET org_id = 'org-maintain-london' WHERE org_id IS NULL;

-- Give every existing user a membership in Maintain London, carrying their role.
INSERT OR IGNORE INTO memberships (id, user_id, org_id, role, created_at)
SELECT lower(hex(randomblob(16))), id, 'org-maintain-london', role, datetime('now') FROM user;
