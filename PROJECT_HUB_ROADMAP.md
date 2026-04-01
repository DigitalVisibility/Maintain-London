# Maintain London — Project Hub Roadmap

> Purpose-built project management platform for site teams and clients.
> Lives at `maintainlondon.co.uk/project-hub/`

---

## Architecture

| Decision | Choice |
|---|---|
| Users | Internal team only (5-30 users). Client portal in phase 2. |
| Infrastructure | All Cloudflare (D1 + R2 + Workers) — $0/month on free tier |
| App location | `maintainlondon.co.uk/project-hub/` — within existing Astro site |
| Mobile | Same responsive form. PWA for installability. |
| Auth | Better-Auth + D1 (email/password, 3 roles: admin, manager, operative) |
| Frontend | Astro 5 SSR + React islands + Nano Stores + Tailwind |
| Offline | Service Worker + IndexedDB + Background Sync API |

---

## MVP Phases (Phase 1: Internal Daily Log)

### Sprint 1 — Foundation ✅ COMPLETE

- [x] Install dependencies (@astrojs/cloudflare, better-auth, nanostores, idb)
- [x] Switch astro.config to `output: 'server'` with Cloudflare adapter
- [x] Create `wrangler.toml` with D1 + R2 + KV bindings
- [x] Create D1 migration files (12 tables + indexes + seed suppliers)
- [x] Create TypeScript types for all entities (`src/types/diary.ts`)
- [x] Set up Better-Auth (server config, API catch-all route, browser client)
- [x] Create auth middleware for `/project-hub/*` route guard
- [x] Build login page (`/project-hub/login`)
- [x] Build dashboard shell with sidebar nav + project cards (`/project-hub/`)
- [x] Add `export const prerender = true` to all 15 existing static pages
- [x] Verify build succeeds with 0 errors

**Key files created:**
- `wrangler.toml` — Cloudflare bindings
- `migrations/0001_initial_schema.sql` — Full DB schema
- `migrations/0002_seed_suppliers.sql` — Default UK suppliers
- `src/lib/auth.ts` — Better-Auth server config
- `src/lib/auth-client.ts` — Browser auth client
- `src/lib/db.ts` — D1 query helpers
- `src/middleware.ts` — Auth guard
- `src/layouts/HubLayout.astro` — App shell (sidebar + mobile tabs)
- `src/pages/project-hub/login.astro` — Login page
- `src/pages/project-hub/index.astro` — Dashboard
- `src/components/project-hub/LoginForm.tsx` — React login form

---

### Sprint 2 — Core Diary Form ✅ COMPLETE

- [x] Build diary entry form (React island) with all wireframe sections
- [x] Personnel manager component (add/remove operatives + hours)
- [x] Activity table + delay table components
- [x] Weather widget (OpenWeatherMap API integration)
- [x] Supplier select component (with defaults + add new)
- [x] Variations section (description + hours)
- [x] Materials required section (supplier + items + date needed)
- [x] Equipment hire section (equipment + supplier)
- [x] Materials delivered section (supplier + delivery notes)
- [x] Notes section (free text)
- [x] API routes: entries CRUD (`/api/entries/`)
- [x] API route: weather proxy (`/api/weather/`)
- [x] Project overview page (`/project-hub/project/[id]/`)
- [x] Diary entry list page (`/project-hub/project/[id]/diary/`)
- [x] New diary entry page (`/project-hub/project/[id]/diary/new`)
- [x] View/edit diary entry page (`/project-hub/project/[id]/diary/[entryId]`)

**Key files created:**
- `src/pages/api/entries/index.ts` — GET list + POST create (batch insert all sub-records)
- `src/pages/api/entries/[id].ts` — GET full entry + PUT update + DELETE
- `src/pages/api/weather/index.ts` — OpenWeatherMap proxy
- `src/components/project-hub/DiaryForm.tsx` — Main form (accordion sections, auto-save, duration calc)
- `src/components/project-hub/PersonnelManager.tsx` — Operatives + visitors
- `src/components/project-hub/ActivityTable.tsx` — Work completed + status
- `src/components/project-hub/DelayTable.tsx` — Delays + reasons + hours lost
- `src/components/project-hub/WeatherWidget.tsx` — Auto-populated weather
- `src/components/project-hub/SupplierSelect.tsx` — Dropdown with custom supplier option
- `src/components/project-hub/EntryList.tsx` — Diary entry list with date/time/status
- `src/pages/project-hub/project/[id]/index.astro` — Project overview + stats
- `src/pages/project-hub/project/[id]/diary/index.astro` — Diary entry list
- `src/pages/project-hub/project/[id]/diary/new.astro` — New entry form
- `src/pages/project-hub/project/[id]/diary/[entryId].astro` — Edit entry form

---

### Sprint 3 — Photos + Storage ✅ COMPLETE

- [x] R2 photo upload API (`/api/photos/upload`)
- [x] Photo serve + delete API (`/api/photos/[...key]`)
- [x] Photo gallery component (capture + upload + grid view + lightbox)
- [x] Delivery note + variation attachment support (file_type param)
- [x] File type validation (JPEG, PNG, WebP, HEIC, PDF) + 10MB size limit
- [x] Photo captions + linking to diary sections
- [x] Integrated PhotoGallery into DiaryForm (accordion section)

**Key files created:**
- `src/lib/r2.ts` — R2 storage helpers (validate, upload, get, delete)
- `src/pages/api/photos/upload.ts` — POST multipart upload to R2 + D1 metadata
- `src/pages/api/photos/[...key].ts` — GET serve file, DELETE file + metadata
- `src/components/project-hub/PhotoGallery.tsx` — Camera capture, upload progress, photo grid, lightbox, document list

---

### Sprint 4 — Offline + PWA ✅ COMPLETE

- [x] Service worker setup (manual `sw.js` — network-first caching + Background Sync)
- [x] IndexedDB offline store + sync queue (`src/lib/offline.ts`)
- [x] Background sync for queued entries + photos (with manual fallback)
- [x] Online/offline banner + sync status indicator
- [x] PWA manifest (`public/manifest.json` — icons, theme, standalone mode)
- [x] Nano Stores for offline state (`src/stores/offline.ts`)
- [x] Apple PWA meta tags (apple-mobile-web-app-capable, touch icon)
- [x] Offline-aware DiaryForm (queues saves when offline, syncs on reconnect)

**Key files created:**
- `public/manifest.json` — PWA manifest (standalone, portrait, brand-green theme)
- `public/sw.js` — Service worker (cache strategies, background sync handlers)
- `src/lib/offline.ts` — IndexedDB store via `idb` (sync queue + cached entries)
- `src/stores/offline.ts` — Nano Stores ($isOnline, $pendingSyncCount, $syncStatus)
- `src/components/project-hub/OfflineBanner.tsx` — Connection/sync status banner

---

### Sprint 5 — Reports + Polish ✅ COMPLETE

- [x] Summary report generator (branded HTML with print/PDF support)
- [x] Report API (`/api/reports/summary`) — daily + weekly report types
- [x] Report preview page (`/project-hub/project/[id]/report`)
- [x] "Copy yesterday" button to pre-fill diary form (personnel, activities, equipment)
- [x] Dashboard stats (entries this week, photos taken, delays logged)
- [x] Settings page (`/project-hub/settings`) with profile, PWA install, SW status
- [x] "Reports" button added to project overview page

**Key files created:**
- `src/lib/report-generator.ts` — HTML report builder (daily entry + weekly summary)
- `src/pages/api/reports/summary.ts` — GET report HTML by entry or week
- `src/components/project-hub/ReportPreview.tsx` — Report type selector, preview iframe, print/download
- `src/pages/project-hub/project/[id]/report.astro` — Report generation page
- `src/pages/project-hub/settings.astro` — Settings with profile, PWA install, sign out

---

### Sprint 6 — Testing + Deploy ✅ COMPLETE

- [x] Deployment guide with step-by-step Cloudflare provisioning commands
- [x] Admin seed migration (sample project + admin creation instructions)
- [x] Updated `/resources/apps/` page — "Coming Soon" replaced with live Project Hub link
- [x] Final build verification — 0 errors, all pages render correctly
- [ ] Provision Cloudflare D1, R2, KV (replace PLACEHOLDER IDs in `wrangler.toml`) — **manual step**
- [ ] Run D1 migrations on production — **manual step**
- [ ] Create admin account + deploy — **manual step**

**Key files created:**
- `DEPLOY.md` — Step-by-step deployment guide (provision, migrate, deploy, verify)
- `migrations/0003_seed_admin.sql` — Sample project + admin creation instructions

---

## Phase 2+ (Post-MVP)

These features are NOT in the MVP but are planned for future development:

- [ ] **Client Portal** — Approval workflow (manager submits, ops approves client-visible content)
- [ ] **Document Hub** — Central repository (contracts, quotes, invoices, drawings, manuals, handover packs)
- [ ] **Weekly Summary Emails** — Auto-generated and sent to clients
- [ ] **Gantt Chart** — Project schedule generated from scope of works
- [ ] **Labour Cost Tracking** — Hours x rates for each operative
- [ ] **Stage Payments** — Value of works completed tracking
- [ ] **AI Agent Summaries** — Daily log -> client-friendly narrative via Claude API (infrastructure wired in Phase 1)
- [ ] **Photo Auto-Tagging** — AI-powered descriptions for uploaded photos
- [ ] **Email Notifications** — Entry submission alerts, delay warnings
- [ ] **Multi-Editor** — Multiple concurrent editors on same diary entry

---

## Database Schema

12 tables in Cloudflare D1:

| Table | Purpose |
|---|---|
| `users` | Team members (managed by Better-Auth) |
| `sessions` | Auth sessions |
| `accounts` | Auth provider accounts |
| `verifications` | Email verification tokens |
| `projects` | Sites / renovation projects |
| `diary_entries` | Daily log records (one per project per day) |
| `entry_personnel` | Operatives + visitors on site |
| `entry_activities` | Work completed + status |
| `entry_delays` | Delays + reasons |
| `entry_variations` | Scope changes + hours |
| `entry_materials_required` | Materials/equipment to order |
| `entry_equipment_hire` | Equipment hire records |
| `entry_deliveries` | Materials delivered + notes |
| `entry_files` | Photo/file metadata (files in R2) |
| `suppliers` | Reference data (Travis Perkins, Howdens, etc.) |

Full schema: `migrations/0001_initial_schema.sql`

---

## Security Model

| Layer | Implementation |
|---|---|
| Auth | Better-Auth email/password, httpOnly secure cookies |
| Sessions | D1-stored, 7-day expiry, auto-refresh |
| Roles | admin (full), manager (project-scoped), operative (own entries) |
| API | Session cookie checked via middleware on all routes |
| Files | R2 private by default, presigned URLs (1hr expiry) |
| Input | Parameterised D1 queries, input sanitisation |
| Transport | HTTPS enforced (Cloudflare default) |

---

## Cost

| Service | Free Tier | Expected |
|---|---|---|
| Cloudflare Pages | 100k requests/day | $0 |
| Cloudflare D1 | 10GB, 5M reads/day | $0 |
| Cloudflare R2 | 10GB, 0 egress | $0 |
| OpenWeatherMap | 1,000 calls/day | $0 |
| Better-Auth | Open source | $0 |
| **Total** | | **$0/month** |
