-- Maintain London Project Hub: platform (agency) super-admin
-- A platform_admin oversees ALL organisations: lands on an agency dashboard,
-- can create businesses, and enter any of them — without being a member.
-- Run with: wrangler d1 execute maintain-london-db --file=./migrations/0010_platform_admin.sql
ALTER TABLE user ADD COLUMN platform_admin INTEGER NOT NULL DEFAULT 0;
