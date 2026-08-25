#!/usr/bin/env bash
# Read-only diagnostic: why is Tom's Project Hub dashboard empty?
#
# The projects still exist. The dashboard filters by org_id, and org_id is
# resolving to the wrong business (or to nothing). These four queries say
# which. Nothing here writes. Run: npx wrangler login   (once, first)

set -u
DB=maintain-london-db
run() { echo; echo "── $1 ──"; npx wrangler d1 execute "$DB" --remote --command "$2"; }

# 1. How many businesses are in the shared database, and how do they sort?
#    resolveActiveOrg falls back to memberships[0] ORDER BY o.name, so the
#    alphabetically-first business wins when the cookie is missing.
run "Businesses (in the order the fallback picks them)" \
  "SELECT id, name, slug, logo_url FROM organisations ORDER BY name"

# 2. Which businesses is Tom a member of, and is he a platform admin?
#    A platform admin with no active_org cookie gets NO org at all
#    (middleware.ts:57 guards on 'if (cookieOrg)' with no fallback).
run "Tom's accounts, memberships and admin flag" \
  "SELECT u.id, u.email, u.platform_admin, o.name AS org, m.role
     FROM user u
     LEFT JOIN memberships m ON m.user_id = u.id
     LEFT JOIN organisations o ON o.id = m.org_id
    ORDER BY u.email, o.name"

# 3. Where do the projects actually live?
run "Active projects per business" \
  "SELECT o.name AS org, o.id AS org_id, COUNT(p.id) AS active_projects
     FROM organisations o
     LEFT JOIN projects p ON p.org_id = o.id AND p.status = 'active'
    GROUP BY o.id ORDER BY o.name"

# 4. Has a logo been set to a /api/branding/... path? That route exists only
#    on project-dash, so it 404s on maintainlondon.co.uk.
run "Logos pointing at the Dash-only branding route" \
  "SELECT id, name, logo_url FROM organisations
    WHERE logo_url LIKE '/api/branding/%'"
