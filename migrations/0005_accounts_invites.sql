-- Maintain London Project Hub: Accounts / RBAC foundation
-- Invite-based onboarding for both staff and clients, plus client↔project links.
-- Run with: wrangler d1 execute maintain-london-db --file=./migrations/0005_accounts_invites.sql
--
-- Roles live on the existing `user.role` column (owner | admin | manager |
-- operative | client). Onboarding is invite-gated; the role is taken from the
-- invitation server-side and never trusted from the client.

-- Pending invitations (emailed magic link → set password → account created)
CREATE TABLE IF NOT EXISTS invitations (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  role TEXT NOT NULL DEFAULT 'operative',      -- owner | admin | manager | operative | client
  project_id TEXT REFERENCES projects(id),     -- clients: project they're attached to (null for staff)
  token TEXT UNIQUE NOT NULL,                  -- single-use, random, in the email link
  invited_by TEXT REFERENCES user(id),
  status TEXT NOT NULL DEFAULT 'pending',      -- pending | accepted | revoked
  expires_at TEXT NOT NULL,
  accepted_at TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_invitations_token ON invitations(token);
CREATE INDEX IF NOT EXISTS idx_invitations_email ON invitations(email);

-- Client ↔ project links: a client can be attached to one or more projects,
-- and a project can have more than one client contact.
CREATE TABLE IF NOT EXISTS project_clients (
  id TEXT PRIMARY KEY,
  project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(project_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_project_clients_user ON project_clients(user_id);
CREATE INDEX IF NOT EXISTS idx_project_clients_project ON project_clients(project_id);
