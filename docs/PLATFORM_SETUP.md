# Project Dash — Platform Setup & Cutover Guide

This guide turns the code on the **`project-dash`** branch into a live, separate
platform at **projectdash.app**, with each business on its own subdomain
(e.g. `maintainlondon.projectdash.app`).

The golden rule, above everything else:

> **Project Dash must use its OWN database (D1), file storage (R2) and session
> store (KV). Never point it at the Maintain London resources.**

**This rule was reversed on 25 August 2026, and the earlier version of this
document said the opposite.** It told you to share Maintain London's database,
bucket and sessions. That was written when Maintain London was tenant #1 of your
own group, and it caused real damage before it was caught — see
[PRODUCT_SEPARATION.md](PRODUCT_SEPARATION.md) §3.3. Two reasons it is now wrong:

- **Tom is a competitor to your subscribers.** Maintain London is a London
  maintenance contractor; so are the businesses signing up. "My job costs sit in
  the same database as a rival's?" is a lost sales call, and "the queries are
  scoped properly" is a losing answer even though it's true.
- **A shared database couples the two products.** Anything written from the Dash
  deployment — a test business, a renamed org, an uploaded logo — lands in Tom's
  live data and changes what his site shows.

Your existing `maintainlondon.co.uk` site keeps deploying from `master` and keeps
its own `maintain-london-db`, `maintain-london-files` and KV. Project Dash is a
separate deployment from the `project-dash` branch with a separate everything.

---

## How it works (the 60-second version)

- **One deployment, many businesses.** The web address decides the business: the
  bit before `projectdash.app` is the business's *slug*. `maintainlondon`
  (slug) → `maintainlondon.projectdash.app`.
- **The subdomain is the boss.** It pins which business you're in and overrides
  any saved choice. You only get in if you're a member of that business (or an
  agency super-admin). Everyone else is walled out — that's the isolation.
- **The apex is the platform.** `projectdash.app` shows the Project Dash landing.
  `www`, `agency`, `app`, etc. are reserved and can't be a business.
- **One sign-in, many businesses.** The session cookie is shared across
  `*.projectdash.app`, so an agency login works everywhere — but each subdomain
  still only shows the one business, and only to its members.

The single switch that turns "platform mode" on is the **`PLATFORM_DOMAIN`**
environment variable. Set it on the Project Dash deployment; leave it unset on
the Maintain London one.

---

## Part 1 — Get the domains into Cloudflare

1. In the **same Cloudflare account** as the current site, add **`projectdash.app`**
   as a website (zone). Point the domain's nameservers at the ones Cloudflare
   gives you (at your registrar). Wait for it to go "Active".
2. Do the same for **`projectdash.co.uk`** (we'll redirect it to `.app` in Part 5).

---

## Part 2 — Create the Project Dash Pages project

1. Cloudflare Dashboard → **Workers & Pages → Create → Pages → Connect to Git**.
2. Pick the **same repository** as the existing site.
3. Set the **Production branch** to **`project-dash`** (not `master`).
4. Build settings (same as the existing project):
   - Build command: `npm run build`
   - Build output directory: `dist`
5. Name it something like `project-dash`. Create it (the first build may fail
   until we add the bindings below — that's fine).

---

## Part 3 — Bind the SAME database, files and sessions

First create Dash's own resources (once):

```bash
npx wrangler login
npx wrangler d1 create project-dash-db
npx wrangler r2 bucket create project-dash-files
npx wrangler kv namespace create SESSION
```

Paste the printed D1 and KV ids into the `REPLACE_ME_*` placeholders in
[wrangler.toml](../wrangler.toml). Then on the **project-dash** Pages project →
**Settings → Bindings**, add:

| Type | Variable name | Points at (NEW — create it) |
|------|---------------|------------------------------|
| D1 database | `DB` | `project-dash-db` |
| R2 bucket | `R2` | `project-dash-files` |
| KV namespace | `SESSION` | the new Project Dash namespace |
| Workers AI | `AI` | *(no resource to pick — just add the binding)* |

**Double-check none of these say `maintain-london`.** That is the golden rule
from the top of the page. If a binding here points at a Maintain London
resource, Tom's live data is inside your SaaS.

**`AI` is new** (Aug 2026). It powers Whisper transcription for site voice notes.
Add it as a **Workers AI** binding named `AI`; unlike the others it has nothing to
point at. Without it, voice notes still record and store — they just come back
marked "couldn't transcribe" and retryable, rather than failing silently.

---

## Part 4 — Environment variables & secrets

On the **project-dash** Pages project → **Settings → Environment variables**, add
these to **Production** (and Preview if you use it):

| Name | Value | Notes |
|------|-------|-------|
| `PLATFORM_DOMAIN` | `projectdash.app` | **The switch.** Turns on subdomain-per-business mode. |
| `BETTER_AUTH_SECRET` | *(a NEW random value)* | Must **not** match the Maintain London site. The databases are separate now, so a shared secret buys nothing and would make one product's session cookies valid against the other. Generate with `openssl rand -base64 32`. Mark it **encrypted/secret**. |
| `RESEND_API_KEY` | *(same as current site)* | Sends invites/summaries. Secret. |
| `ANTHROPIC_API_KEY` | *(same as current site)* | Drafts client summaries. Secret. |
| `CRON_SECRET` | *(same as the summary cron worker)* | Secret. |

`ANTHROPIC_API_KEY` now does more than the client summaries: it also writes the
photo captions, the voice-to-diary write-ups and the quote scopes. Without it
those features return a clear "not configured" error rather than misbehaving.

Notes:
- **You do not need to set `BETTER_AUTH_URL` here.** On the platform the app
  authenticates against whatever subdomain you're on, so `BETTER_AUTH_URL` isn't
  used for sign-in. (`PLATFORM_DOMAIN` is the only variable that matters for the
  split.)
- `PLATFORM_DOMAIN` is **not** in `wrangler.toml`, so the dashboard value is used
  cleanly. Leave `PLATFORM_DOMAIN` **unset** on the Maintain London project so it
  stays in its normal single-domain mode.

Re-deploy the project after adding these (Deployments → Retry/Deploy, or push a
commit — **do not** use the dashboard "Rollback").

---

## Part 4b — Build the database

Dash's D1 starts empty. The migrations were written for Maintain London's
database and seed it as tenant #1 — `0006` inserts `org-maintain-london` and
attaches every existing row to it, `0003` inserts a sample project — so they
can't just be replayed. [`scripts/bootstrap-dash-db.sh`](../scripts/bootstrap-dash-db.sh)
runs the schema in order and then strips those seeds back out:

```bash
./scripts/bootstrap-dash-db.sh
```

It refuses to run while `wrangler.toml` still contains `REPLACE_ME`
placeholders, so it cannot accidentally target the wrong database. When it
finishes it prints a row count: expect **0 organisations, 0 projects, 0
memberships, 0 users**. The generic UK merchant suppliers from `0002` are kept
as platform defaults, with `org_id` set to NULL.

The first business is then created through signup rather than SQL.

---

## Part 5 — Custom domains (this is where the subdomains come alive)

On the **project-dash** Pages project → **Custom domains → Set up a domain**, add
**both**:

1. `projectdash.app` — the apex/landing.
2. `*.projectdash.app` — the **wildcard** that gives every business its subdomain.

Cloudflare will create the matching DNS records for you (a `CNAME` for the apex
and a wildcard `CNAME *`). If it doesn't, add in the `projectdash.app` zone:

- `CNAME  @  <your-project>.pages.dev`  (proxied)
- `CNAME  *  <your-project>.pages.dev`  (proxied)

**`projectdash.co.uk` → `projectdash.app` redirect:** in the `projectdash.co.uk`
zone, add a **Redirect Rule**: when hostname ends with `projectdash.co.uk`,
301-redirect to `https://projectdash.app` (preserve path/query).

---

## Part 6 — The summary cron

The two products now need **two** cron workers, because they no longer share a
database. Deploy a second copy of `workers/summary-cron` pointed at
**`https://projectdash.app`**, with its own `CRON_SECRET` matching the one you
set in Part 4.

**Leave the existing worker pointed at `maintainlondon.co.uk`.** Repointing it at
Dash would stop Tom's nightly client summaries. The emails build their links from
each business's own subdomain, so recipients land in the right place either way.

---

## Part 7 — Check the business slugs (they are the subdomains)

A business's **slug** is its subdomain. Dash starts with **no businesses** — the
first one is created at signup, and its slug is derived from the name it gives.

Maintain London is **not** a business on this platform. It stays on
`maintainlondon.co.uk` with Project Hub. If you want it on Dash later as a real
subscriber, it signs up like anyone else and gets a fresh, empty tenant.

Owners can change their own slug any time from **Settings → Branding** (it's
validated for format, reserved names and uniqueness). To set one directly:

```bash
npx wrangler d1 execute project-dash-db --remote   --command "UPDATE organisations SET slug = 'newslug' WHERE id = 'org-...'"
```

Slugs must be lowercase letters/numbers/hyphens, and can't be a reserved name
(`www`, `app`, `agency`, `admin`, `api`, `mail`, …).

---

## Part 8 — Test checklist

Visit these and confirm:

- [ ] `https://projectdash.app` → the **Project Dash landing**.
- [ ] Sign up a **test business** → it gets its own slug and subdomain.
- [ ] `https://<that-slug>.projectdash.app` → a login branded with **its** name
      and colour, not Maintain London's green.
- [ ] Sign in there → you're in that business's app, and the address stays on
      that subdomain.
- [ ] `https://maintainlondon.co.uk/project-hub` still works and is **untouched**
      by everything above.
- [ ] While signed in, visit a **different** business's subdomain you're *not* a
      member of → you're sent to the **"Choose a business"** page, **not** into
      their data. (This is the isolation working.)
- [ ] Agency super-admin signs in at `https://projectdash.app` → lands on the
      **agency dashboard**; entering a business works.
- [ ] Send a **client invite** → the email link points at
      `…projectdash.app` (the business's subdomain), and accepting it works.
- [ ] A **client** signs in on their business's subdomain → sees only their
      portal.
- [ ] `https://projectdash.co.uk` → redirects to `https://projectdash.app`.

---

## Rollback / safety

- The Maintain London site (`maintainlondon.co.uk`, from `master`) is a separate
  deployment and is **not affected**. If anything on Project Dash misbehaves, the
  existing site keeps running.
- To pause the platform, you can remove the custom domains from the project-dash
  Pages project, or unset `PLATFORM_DOMAIN` (which reverts it to single-domain,
  cookie-based behaviour).

---

## Known limitations / follow-ups

- **Email sending domain.** Emails still go out via the verified
  `mail.maintainlondon.co.uk` envelope (the display name is each business's name).
  For a cleaner platform identity, verify **`projectdash.app`** (or
  `mail.projectdash.app`) in Resend and update the envelope in
  `src/lib/email.ts`. Deliverability works either way today.
- **Duplicate business names.** New-business slugs are derived from the name, and
  slugs must be unique. Two businesses with the same name would collide — pick a
  distinct name or set the slug manually.
- **Legacy marketing pages.** The old Maintain London marketing pages
  (`/services`, `/about`, `/portfolio`, `/contact`, `/resources`) still build on
  this branch but aren't linked from the Project Dash landing. Deleting them from
  the `project-dash` branch is optional cleanup.
