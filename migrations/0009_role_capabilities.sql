-- Maintain London Project Hub: per-organisation role capability overrides
-- Lets the owner/manager choose which roles see which sections/features.
-- Run with: wrangler d1 execute maintain-london-db --file=./migrations/0009_role_capabilities.sql
--
-- Only stores DEVIATIONS from the built-in defaults (lib/capabilities.ts).
-- enabled = 1 grants a capability the role wouldn't have by default;
-- enabled = 0 removes one it would normally have.
CREATE TABLE IF NOT EXISTS role_capabilities (
  org_id TEXT NOT NULL REFERENCES organisations(id) ON DELETE CASCADE,
  role TEXT NOT NULL,
  capability TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (org_id, role, capability)
);
