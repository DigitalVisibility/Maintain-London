# Project Hub — Deployment Guide

## Prerequisites

- Node.js 22+ (see `.nvmrc`)
- Wrangler CLI: `npm install -g wrangler`
- Cloudflare account with Pages access
- Logged in: `wrangler login`

---

## Step 1: Provision Cloudflare Resources

Run these commands to create the required resources:

```bash
# Create D1 database
wrangler d1 create maintain-london-db
# Copy the database_id from the output

# Create R2 bucket
wrangler r2 bucket create maintain-london-files

# Create KV namespace (used for Astro sessions)
wrangler kv namespace create SESSION
# Copy the id from the output
```

## Step 2: Update wrangler.toml

Replace the placeholder IDs with the real values from Step 1:

```toml
[[d1_databases]]
database_id = "YOUR_ACTUAL_D1_ID"

[[kv_namespaces]]
id = "YOUR_ACTUAL_KV_ID"
```

Generate and set the auth secret:

```bash
# Generate a secure secret
openssl rand -base64 32

# Update wrangler.toml [vars] section:
BETTER_AUTH_SECRET = "your-generated-secret"
BETTER_AUTH_URL = "https://maintainlondon.co.uk"
```

## Step 3: Run D1 Migrations

```bash
# Apply schema
wrangler d1 execute maintain-london-db --remote --file=migrations/0001_initial_schema.sql

# Seed default suppliers
wrangler d1 execute maintain-london-db --remote --file=migrations/0002_seed_suppliers.sql

# Seed sample project
wrangler d1 execute maintain-london-db --remote --file=migrations/0003_seed_admin.sql
```

## Step 4: Build & Deploy

```bash
# Install dependencies
npm install

# Build the project
npm run build

# Deploy to Cloudflare Pages
wrangler pages deploy dist/
```

## Step 5: Create Admin Account

After deployment, create the first admin user:

```bash
# Sign up via API
curl -X POST https://maintainlondon.co.uk/api/auth/sign-up/email \
  -H "Content-Type: application/json" \
  -d '{"name":"Tom","email":"admin@maintainlondon.co.uk","password":"YOUR_SECURE_PASSWORD"}'

# Promote to admin role
wrangler d1 execute maintain-london-db --remote \
  --command "UPDATE users SET role = 'admin' WHERE email = 'admin@maintainlondon.co.uk'"
```

## Step 6: Verify

1. Visit `https://maintainlondon.co.uk/project-hub/login`
2. Log in with the admin account
3. Verify the dashboard loads with the sample project
4. Create a test diary entry
5. Upload a test photo
6. Generate a report
7. Check PWA install prompt on mobile
8. Test offline: enable airplane mode, create entry, reconnect, verify sync

---

## Ongoing Operations

### Add a new user
```bash
# They sign up at /project-hub/login, then promote if needed:
wrangler d1 execute maintain-london-db --remote \
  --command "UPDATE users SET role = 'manager' WHERE email = 'user@example.com'"
```

### Add a new project
```bash
wrangler d1 execute maintain-london-db --remote \
  --command "INSERT INTO projects (id, name, address, postcode, status, created_at, updated_at) VALUES ('proj_UNIQUE_ID', 'Project Name', '123 Address', 'SW1A 1AA', 'active', datetime('now'), datetime('now'))"
```

### Run future migrations
```bash
wrangler d1 execute maintain-london-db --remote --file=migrations/XXXX_migration_name.sql
```

---

## Cost

| Service | Free Tier | Status |
|---|---|---|
| Cloudflare Pages | 100k requests/day | $0 |
| Cloudflare D1 | 10GB, 5M reads/day | $0 |
| Cloudflare R2 | 10GB, 0 egress | $0 |
| OpenWeatherMap | 1,000 calls/day | $0 |
| **Total** | | **$0/month** |
