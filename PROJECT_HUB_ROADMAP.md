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

### Shipped since the MVP

- [x] **Client Portal** — Released-day updates, approvals inbox, message thread (`portal/[id].astro`)
- [x] **Vetting & release** — Per-item + per-photo client visibility; a day is only visible once released
- [x] **Approvals workflow** — Tiered auto / manager / client limits, emailed one-tap decide links (`approval_requests`)
- [x] **Messaging** — Per-project thread, staff + client
- [x] **Multi-tenancy** — Organisations, memberships, per-org branding
- [x] **Per-role capability toggles** — Settings → Role access (`role_capabilities`)
- [x] **Agency / platform super-admin tier** — Oversee all businesses
- [x] **Time tracking** — Clock in/out with geo, breaks, timesheet reports
- [x] **Email** — Resend, wired for invitations + approvals

### Still outstanding

- [ ] **Document Hub** — Central repository (contracts, quotes, invoices, drawings, manuals, handover packs)
- [ ] **Weekly Summary Emails** — Auto-generated and sent to clients
- [ ] **Gantt Chart** — Project schedule generated from scope of works
- [ ] **Labour Cost Tracking** — Hours x rates for each operative
- [ ] **Stage Payments** — Value of works completed tracking
- [ ] **AI Agent Summaries** — Daily log -> client-friendly narrative via Claude API
- [ ] **Photo Auto-Tagging** — AI-powered descriptions for uploaded photos
- [ ] **Email Notifications** — Entry submission alerts, delay warnings
- [ ] **Multi-Editor** — Multiple concurrent editors on same diary entry

---

## Client feedback — July 2026

Feedback from the first live project, plus three hand-drawn wireframes (invoice
summary, files grid, variations register). Several of these were already on the
Phase 2+ list above; the sequencing below supersedes it. Cross-references are
noted so nothing gets built twice.

### Phase 0 — Fix what's broken ✅ COMPLETE

- [x] **Photos never displayed.** R2 keys contain slashes; callers percent-encode
      them and Astro's rest param does not decode `%2F`, so the serving route
      404'd every image. Decode the key. (`api/photos/[...key].ts`)
- [x] Same bug silently broke **photo client-visibility** (PATCH matched 0 rows,
      D1 still reported success) and **photo deletes** (removed nothing).
- [x] **Project authorisation.** Reports, photos and entries authenticated but
      never authorised — a signed-in client could read another business's data by
      changing an id in the URL, and could get the un-redacted internal report by
      dropping `audience=client`. New `lib/access.ts` is the single answer to
      "may this user touch this project?".
- [x] **Stable child-row ids** (`lib/diary-children.ts`) — saving an entry used to
      regenerate every child id, so nothing could reference a variation or a
      delivery. Hard blocker for everything below.
- [x] `getWeekEnd` dropped Sunday from the weekly report in any timezone ahead of UTC.

### Phase 1 — Photos ✅ COMPLETE

- [x] Photos on **Variations** and **Materials Delivered** rows (per-row attach,
      `entry_files.linked_to`) — *client asked for this explicitly*
- [x] Row photos render against their row in the report; the general Photos
      section holds only the day's unattached photos
- [x] Client portal shows released, ticked photos **inline** rather than only
      behind a report link
- [x] **No maximum photo count.** The client suggested a cap of 4/day; we
      deliberately did not implement one — the day a problem is uncovered is the
      day the record needs the most photos. Instead: unlimited upload, curated
      client-visible selection, and a soft advisory above 10.

### Phase 2a — Client update automation ✅ COMPLETE

- [x] Cron infrastructure — **sidecar Cloudflare Worker** (`workers/summary-cron/`).
      Pages has no cron triggers; the sidecar owns the clock and nothing else, so
      the live deployment was never touched. It calls `POST /api/summaries/run`
      with a shared secret; all the logic stays in the app.
- [x] **Claude drafts the client-facing narrative** (`lib/ai.ts`, `claude-opus-4-8`)
      so the update arrives *written* — something to scan and approve, not raw data
      still to be written up. A failed draft still lands in the queue with the error
      shown, to be written by hand rather than vanishing.
      *(supersedes "Weekly Summary Emails" + "AI Agent Summaries" above)*
- [x] Approval queue → edit → approve → email the client → **archive the exact
      HTML that was sent** to R2. Nothing reaches a client unapproved.
- [x] **The schedule is configurable, not hard-coded.** Friday 16:00 is the
      default, not the product's opinion: cadence is `manual · daily · weekly ·
      fortnightly · monthly · milestone`, set per business and overridable per
      project (payment terms are per contract, not per company).
- [x] **Milestones** (`project_milestones`) — a completed milestone drafts an
      update covering the work since the last one. Defined once here because this
      is also what Phase 4's **stage payments** hang off; two parallel objects
      would drift apart.
- [x] Timezone-correct: schedules are wall-clock in the org's zone, so 4pm stays
      4pm through the clock change. (Cron runs UTC — get this wrong and every
      summer summary goes out an hour early.)

### Phase 2b — Notifications (outstanding)

- [ ] **Message notifications** — a new message currently notifies nobody. Email +
      unread badge, digested so it doesn't become noise.
      *(supersedes "Email Notifications" above)*

### Phase 3 — Variations → approvals → invoicing ✅ COMPLETE

- [x] **Variations register** (`variations` table) — numbered per project (0001,
      0002 …), each with net / VAT / total and status Draft → Pending → Approved /
      Rejected. Only *approved* variations count toward the contract sum, which is
      the figure Phase 4's valuation reads.
- [x] **A diary variation auto-creates a draft** in the register and emails the
      office to price it — idempotent (each diary line promoted once, via a stable
      id + unique index). This is the workflow gap the client reported: "if someone
      enters a variation on the site diary it doesn't prompt an approval request".
      Nothing goes to the client automatically — it becomes a draft to reword and
      price, exactly per his "a quick check, a quick reword, and sending".
- [x] **Raising a variation reuses the existing approval engine** (extracted to
      `lib/approvals.ts`) — same tiered logic, same one-tap emailed decide link.
      The decision (in-app or via the link) flows back onto the register.
- [x] **Per-project routing** (`projects.variation_approval`): default `client`
      (every variation needs the client's sign-off, since it changes the bill),
      or `tiered` (follow the project's spend limits — small ones auto-approve).
- [x] Running totals (approved / pending / draft / rejected) on the project page.
- [x] **CSV export** — package-agnostic, imports into Xero/QuickBooks/Sage/a sheet.
      Direct Xero push is the follow-on (client chose CSV first).
- [x] VAT: 20 / 5 / 0 % selectable per variation; net + VAT = total, stored and
      reconciled to the penny.
- [ ] **Direct Xero integration** — the follow-on to the CSV. Package: Xero.

**Security:** every variation route authorises the *project* (canAccessProject),
not just the org — clients can't see another client's variations, drafts are
hidden from clients entirely, and recording/raising is gated behind `view_costs`
(clients don't have it). Verified by attacking as one client against another.

### Phase 4 — Financials & client portal build-out ✅ COMPLETE

- [x] **Interim-valuation model** per the invoice wireframe, computed live
      (`lib/financials.ts`, unit-tested to the penny against the sketch):
      revised contract sum = quote + **approved** variations; value of work done =
      % complete × revised sum; **next instalment = value of work done − paid to
      date**; balance outstanding = revised − paid. Nothing is stored but the
      quote, the % complete, and the invoices — so it can't drift from the register
      or the payments.
- [x] **% complete** per project (a slider on the financials panel); **quoted net
      + VAT rate** per project.
- [x] **Client invoices / instalments / deposit** (`invoices` table) —
      draft → sent → paid, sequential numbering per business (seedable so it aligns
      with the firm's existing books). "Raise next instalment" bills the exact
      computed figure. Issuing an invoice emails the client (tenant identity).
- [x] **Client portal financial cards** — contract sum, % complete, paid to date,
      balance outstanding; a paid-vs-due invoice list; a "N variations awaiting your
      approval" banner linking to the approvals section. Drafts and the internal
      register never reach the client; the costs API is gated behind `view_costs`,
      which clients don't have.
      *(supersedes "Stage Payments" above)*
- [x] Export is the register CSV (Phase 3); **no live-spreadsheet sync** — the
      client suggested it, but two-way sync is a conflict factory.

- [x] **Client-facing invoice + receipt PDFs** (`lib/invoice-document.ts`) — a full
      VAT invoice (trading address, VAT number, bank details, terms) and a paid
      receipt with a PAID stamp, A4 print-perfect → the browser's Save-as-PDF makes
      a real file. Company details come from a new profile (Settings → Company
      details). Client-reachable, drafts never shown to a client, receipt only once
      paid.

Still open: **direct Xero** is the natural follow-on to the CSV export.

### Phase 5 — Document Hub ✅ COMPLETE

- [x] Folder grid per wireframe (`documents` table): Drawings, Interior Finishes,
      Kitchen, Bathrooms, Superseded, Contracts, Handovers, Progress Pics,
      Financials. Project-level files, distinct from the diary-scoped `entry_files`.
- [x] Per-file **client-visible** control, with a sensible per-folder default
      (contracts/handovers/progress pics/financials shared; drawings/superseded
      internal), applied server-side so nothing leaks by accident.
- [x] Client portal **Documents** area (visible files only) + **Progress reports**
      (the exact sent summaries, from the R2 archive — the client's "progress file").
- [x] Serve authorises via the documents table (only keys we issued) and re-checks
      client-visibility. Verified: cross-business and cross-client both 403.

### Phase 6 — Schedules ✅ COMPLETE

- [x] **Programme** (`programme_tasks`) — a lightweight Gantt: tasks with dates as
      bars, status not-started/in-progress/complete. Client-visible by default →
      becomes the client's "project schedule" in the portal.
- [x] **Procurement** (`procurement_items`) — item / supplier / required-by /
      status (to-order/ordered/delivered). Internal by default.
- [x] **Financial schedule** — reuses the Phase 4 valuation + invoice timeline (no
      second copy of the money).
      *(supersedes "Gantt Chart" above)*

### Documentation ✅ COMPLETE

- [x] `docs/ADMIN_MANUAL.md`, `docs/USER_MANUAL.md` rewritten and
      `docs/CLIENT_MANUAL.md` created — plain-English, step-by-step, covering the
      whole current system for owners, site teams, and customers.

---

## Tier 1 — Voice & camera capture ✅ COMPLETE (Aug 2026)

Built to close the one gap CompanyCam actually wins on: the first three seconds
of input. See `docs/COMPETITIVE_COMPANYCAM.md` for the analysis this came from.
**Project Dash branch only — not merged to master.**

- [x] **Voice notes** (`voice_notes`, `lib/transcribe.ts`, `api/voice/*`) —
      hold-to-talk *and* tap-to-latch (site workers wear gloves), iOS-safe mime
      detection, mic tracks always released, 5-minute cap.
      Transcription is **Cloudflare Workers AI Whisper**
      (`@cf/openai/whisper-large-v3-turbo`) — stays on the existing stack, no new
      vendor, ~$0.0005/audio minute. *The Claude API does not accept audio;
      speech-to-text has to be its own step.*
- [x] **Offline-first voice.** Audio queues in IndexedDB and transcribes on sync.
      `POST /api/voice` accepts the optimistic id the UI already showed, so a
      background-sync event firing twice — which they do — produces one note, not
      two copies of the same sentence in the day's record.
- [x] **Voice + photos → a structured draft** (`lib/diary-ai.ts`, `api/drafts/*`,
      `claude-opus-5`). The competitive point: their AI writes a *document*, ours
      writes *rows* — activities, delays, personnel, materials, variations — which
      flow on into the register, the valuation and the invoice.
      **Always proposed, never applied.** The draft merges into the diary form and
      a human presses save; a site diary is evidence and the operative stays its
      author. Anything the model couldn't place lands in `uncertain`, shown above
      the form and never merged — nothing is silently dropped.
- [x] **Photo auto-captioning** (`lib/vision.ts`, `api/photos/caption.ts`,
      `claude-haiku-4-5`). `ai_caption` sits *beside* the human `caption`, never
      over it. Batched, per-file authorised, one bad photo can't sink a batch.
      HEIC and PDF are skipped rather than failed — vision takes neither.
- [x] **Capture mode** (`project/[id]/capture`) — full-screen viewfinder, 84px
      shutter, per-photo voice notes, GPS + shutter-time stamping, background
      uploads so bursts stay responsive. Falls back to the file input when
      `getUserMedia` is denied or unavailable rather than showing a black screen.
      A GET never creates an entry; "today" is resolved in the org's timezone.
- [x] **Quotes** (`quotes`, `quote_items`, `quote_files`, `lib/quotes.ts`,
      `lib/quote-ai.ts`) — the missing pre-project object. Walk a job you're
      *pricing*, shoot and talk, and Claude proposes a sectioned scope grouped by
      room. **It never prices** — that's the estimator's job. Its most valuable
      output is `assumptions`: every unknown the walkthrough surfaced but couldn't
      resolve. Money is computed in integer pence, never stored. On acceptance the
      quote converts to a project and its net becomes `quoted_net`, so the
      valuation reads the figure the client signed. Conversion is idempotent.

### Fixed along the way (pre-existing, found during integration)

- **Background photo sync had never worked.** `sw.js` posted `item.formData`, but
  FormData cannot be stored in IndexedDB so `queuePhotoUpload` never saved it —
  every background-synced photo posted an empty body. Masked because the manual
  `processQueue()` fallback does it correctly.
- **Multi-photo upload dropped all but the last.** `PhotoGallery` appended to a
  `files` prop captured at render, which never changed during the upload loop.
  Harmless one photo at a time; guaranteed loss with burst capture.
- Voice route helpers moved to `lib/voice-access.ts` — a route importing values
  from a sibling route holds only by accident of bundling.

### Manual steps before this works in production

1. Enable **Workers AI** on the Cloudflare account (`[ai]` binding is in
   `wrangler.toml`) and deploy.
2. Apply `migrations/0026_voice_ai.sql` and `0027_quotes.sql` to production D1.
3. Confirm `ANTHROPIC_API_KEY` is set on the Project Dash Pages project.
4. **Test camera and microphone on a real iPhone and a real Android.** The code
   handles the known traps (`playsInline`, `audio/mp4` on iOS, track cleanup,
   insecure-context fallback) but none of it has been exercised on a handset.

---

## Database Schema

23 tables in Cloudflare D1. The core diary set is below; multi-tenancy
(`organisations`, `memberships`, `role_capabilities`), the client portal
(`project_clients`, `approval_requests`, `messages`), auth (`user`, `session`,
`account`, `verification`, `invitations`) and `time_sessions` are added by
migrations 0004–0010.

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
| Roles | owner, admin, manager, operative, client — per organisation (`memberships`) |
| Capabilities | `lib/capabilities.ts` + per-org overrides (`role_capabilities`) |
| Authentication | Middleware resolves `locals.user` / `org` / `role` on every Hub page + data API |
| **Authorisation** | **`lib/access.ts` — every data route must ask "may this user touch this project?". Staff: their org. Client: linked via `project_clients`, released + client-visible content only.** |
| Files | R2 private; served only via `/api/photos/*`, which resolves the key through D1 first (so only keys we issued can be served) and re-checks release + visibility for clients |
| Input | Parameterised D1 queries, input sanitisation |
| Transport | HTTPS enforced (Cloudflare default) |

> ⚠️ **A signed-in session is not authorisation.** Reports, photos and entries once
> checked only that *someone* was logged in, which let a client of one business read
> another's data by changing an id in the URL. Any new data route must call
> `canAccessProject()` (or `canAccessEntry()` / `canReadFile()`) — not just `locals.user`.

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
