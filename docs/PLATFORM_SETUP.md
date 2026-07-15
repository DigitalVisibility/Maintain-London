# Project Dash — Platform Setup & Cutover Guide

This guide turns the code on the **`project-dash`** branch into a live, separate
platform at **projectdash.app**, with each business on its own subdomain
(e.g. `maintain-london.projectdash.app`).

The golden rule, above everything else:

> **The Project Dash deployment must use the SAME database (D1), file storage
> (R2) and session store (KV) as the existing Maintain London site.**
> Every business — Maintain London included — is a tenant *inside* that one
> database. Never point Project Dash at a new/empty database.

Your existing `maintainlondon.co.uk` site is untouched by all of this. It keeps
deploying from `master` and keeps working exactly as before. Project Dash is a
*second* deployment of the same code from the `project-dash` branch.

---

## How it works (the 60-second version)

- **One deployment, many businesses.** The web address decides the business: the
  bit before `projectdash.app` is the business's *slug*. `maintain-london`
  (slug) → `maintain-london.projectdash.app`.
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

On the **project-dash** Pages project → **Settings → Bindings** (a.k.a. Functions
→ bindings), add these, pointing at the **existing** resources:

| Type | Variable name | Points at (existing) |
|------|---------------|----------------------|
| D1 database | `DB` | `maintain-london-db` |
| R2 bucket | `R2` | `maintain-london-files` |
| KV namespace | `SESSION` | the same KV the current site uses |

Double-check these are the **existing** database/bucket/namespace, not new ones.
This is the golden rule from the top of the page.

---

## Part 4 — Environment variables & secrets

On the **project-dash** Pages project → **Settings → Environment variables**, add
these to **Production** (and Preview if you use it):

| Name | Value | Notes |
|------|-------|-------|
| `PLATFORM_DOMAIN` | `projectdash.app` | **The switch.** Turns on subdomain-per-business mode. |
| `BETTER_AUTH_SECRET` | *(same value as the current site)* | Must match — sessions live in the shared DB, so the secret has to be identical or logins won't validate. Mark it **encrypted/secret**. |
| `RESEND_API_KEY` | *(same as current site)* | Sends invites/summaries. Secret. |
| `ANTHROPIC_API_KEY` | *(same as current site)* | Drafts client summaries. Secret. |
| `CRON_SECRET` | *(same as the summary cron worker)* | Secret. |

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

The nightly "client summary" cron worker just needs to reach an endpoint that
shares the same database. Point its target URL at **`https://projectdash.app`**
(or leave it on the existing site — both share the DB). Make sure its
`CRON_SECRET` matches the one you set in Part 4. The emails it sends already
build their links from each business's own subdomain, so recipients land in the
right place automatically.

---

## Part 7 — Check the business slugs (they are the subdomains)

A business's **slug** is its subdomain. Current values:

| Business | Slug → subdomain |
|----------|------------------|
| Maintain London | `maintain-london` → `maintain-london.projectdash.app` |
| Test business - Anti-Damp | `test-business-anti-damp` → `…` |

If you'd prefer `maintainlondon.projectdash.app` (no hyphen), rename the slug —
it instantly becomes the new subdomain. From the project folder:

```bash
npx wrangler d1 execute maintain-london-db --remote \
  --command "UPDATE organisations SET slug = 'maintainlondon' WHERE id = 'org-maintain-london'"
```

Slugs must be lowercase letters/numbers/hyphens, and can't be a reserved name
(`www`, `app`, `agency`, `admin`, `api`, `mail`, …).

---

## Part 8 — Test checklist

Visit these and confirm:

- [ ] `https://projectdash.app` → the **Project Dash landing**.
- [ ] `https://maintain-london.projectdash.app` → a **login branded "Maintain London"**.
- [ ] Sign in there → you're in Maintain London's app, and the address stays on
      that subdomain.
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
