-- The workforce roster: the people a business puts on site.
--
-- Diary personnel used to be bare free-text names. This gives each business a
-- reusable list — seeded from their app users, grown as names are typed on site
-- — so the diary can offer a pick-list with predictive type-ahead, while still
-- letting a manager free-type a new/temp/agency worker. Each person carries a
-- default working pattern (days + start/end) that the rota and the live
-- attendance board measure actual clock-ins against.

CREATE TABLE IF NOT EXISTS people (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  name TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'operative',   -- operative | manager | subcontractor | visitor
  company TEXT,                             -- for agency/subbie
  user_id TEXT,                             -- optional link to an app login (memberships/user)
  phone TEXT,
  -- Default working pattern (the "expected hours" baseline).
  default_days TEXT,                        -- CSV of weekday numbers, Mon=1 … Sun=7 (e.g. '1,2,3,4,5')
  default_start TEXT,                       -- 'HH:MM'
  default_end TEXT,                         -- 'HH:MM'
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_people_org ON people(org_id, active);

-- Link a diary personnel row back to the roster (nullable — free-typed temp/
-- agency workers have no roster entry), and a per-person note ("arrived late").
ALTER TABLE entry_personnel ADD COLUMN person_id TEXT;
ALTER TABLE entry_personnel ADD COLUMN note TEXT;
