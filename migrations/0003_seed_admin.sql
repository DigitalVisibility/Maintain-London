-- Seed admin user for Project Hub
-- Password should be changed after first login
-- The password hash below is for: "ChangeMeOnFirstLogin!"
-- Better-Auth will handle proper password hashing at runtime,
-- so create the admin via the signup API instead.
--
-- Run this after deployment:
--   curl -X POST https://maintainlondon.co.uk/api/auth/sign-up/email \
--     -H "Content-Type: application/json" \
--     -d '{"name":"Tom Admin","email":"admin@maintainlondon.co.uk","password":"CHANGE_THIS_PASSWORD"}'
--
-- Then promote to admin:
--   wrangler d1 execute maintain-london-db --command "UPDATE users SET role = 'admin' WHERE email = 'admin@maintainlondon.co.uk'"

-- Seed a sample project (replace with real data after deployment)
INSERT OR IGNORE INTO projects (id, name, address, postcode, lat, lng, client_name, status, created_at, updated_at)
VALUES (
  'proj_sample_001',
  'Sample Renovation Project',
  '123 Example Street, London',
  'SW1A 1AA',
  51.5014,
  -0.1419,
  'Sample Client',
  'active',
  datetime('now'),
  datetime('now')
);
