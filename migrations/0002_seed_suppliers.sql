-- Seed default suppliers
-- Run with: wrangler d1 execute maintain-london-db --file=./migrations/0002_seed_suppliers.sql

INSERT OR IGNORE INTO suppliers (id, name, category, is_default) VALUES
  ('sup_travis', 'Travis Perkins', 'materials', 1),
  ('sup_howdens', 'Howdens', 'materials', 1),
  ('sup_screwfix', 'Screwfix', 'materials', 1),
  ('sup_toolstation', 'Toolstation', 'materials', 1),
  ('sup_wickes', 'Wickes', 'materials', 1),
  ('sup_jewson', 'Jewson', 'materials', 1),
  ('sup_selco', 'Selco', 'materials', 1),
  ('sup_hss', 'HSS Hire', 'equipment', 1),
  ('sup_sunbelt', 'Sunbelt Rentals', 'equipment', 1),
  ('sup_speedy', 'Speedy Hire', 'equipment', 1),
  ('sup_brandonsunbelt', 'Brandon Hire Station', 'equipment', 1);
