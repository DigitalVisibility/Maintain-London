#!/usr/bin/env bash
# Build Project Dash's OWN database from an empty D1.
#
# The migrations were written for Maintain London's database and seed it as
# tenant #1: 0006 inserts 'org-maintain-london' and attaches every existing
# row to it, 0003 inserts a sample project. Replaying them verbatim into Dash
# would recreate a competitor's business inside the SaaS on day one. This
# script runs the schema, then strips those seeds back out.
#
# Prerequisites:
#   npx wrangler login
#   npx wrangler d1 create project-dash-db      -> paste id into wrangler.toml
#   npx wrangler r2 bucket create project-dash-files
#   npx wrangler kv namespace create SESSION    -> paste id into wrangler.toml
#
# Then: ./scripts/bootstrap-dash-db.sh

set -euo pipefail

DB=project-dash-db

if grep -q "REPLACE_ME" wrangler.toml; then
  echo "wrangler.toml still has REPLACE_ME placeholders. Create the D1 and KV" >&2
  echo "resources and paste their ids in before running this." >&2
  exit 1
fi

echo "Applying schema to $DB ..."
for f in migrations/[0-9]*.sql; do
  echo "  -> $f"
  npx wrangler d1 execute "$DB" --remote --file="$f"
done

echo
echo "Stripping the Maintain London seed ..."
npx wrangler d1 execute "$DB" --remote --command "
  DELETE FROM memberships   WHERE org_id = 'org-maintain-london';
  DELETE FROM organisations WHERE id     = 'org-maintain-london';
  DELETE FROM projects      WHERE id     = 'proj_sample_001';
  UPDATE suppliers SET org_id = NULL WHERE is_default = 1;
"

echo
echo "Verifying the database is clean ..."
npx wrangler d1 execute "$DB" --remote --command "
  SELECT 'organisations' AS tbl, COUNT(*) AS rows FROM organisations
  UNION ALL SELECT 'projects', COUNT(*) FROM projects
  UNION ALL SELECT 'memberships', COUNT(*) FROM memberships
  UNION ALL SELECT 'user', COUNT(*) FROM user
  UNION ALL SELECT 'default suppliers', COUNT(*) FROM suppliers WHERE is_default = 1;
"
echo
echo "Expect 0 organisations, 0 projects, 0 memberships, 0 users."
echo "The default suppliers are generic UK merchants and are kept on purpose."
