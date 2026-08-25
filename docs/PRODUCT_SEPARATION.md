# Project Hub vs Project Dash — where the line goes

> Written 24 August 2026, after the competitor sweeps
> ([1](COMPETITIVE_COMPANYCAM.md) · [2](COMPETITIVE_FIELD_APPS.md) ·
> [3](COMPETITIVE_AGENTS_AND_FM.md)) turned into a roadmap that assumes
> paying subscribers.

---

## 1. The two products

| | **Project Hub** | **Project Dash** |
|---|---|---|
| Who it's for | Maintain London — Tom | Subscribers: other contractors |
| Who pays | Tom, to his budget | Many businesses, monthly |
| Who decides scope | Tom | You |
| Success = | Tom's operation runs on it | Signups, retention, churn |
| Lives at | maintainlondon.co.uk/project-hub | projectdash.app (subdomain per business) |
| Deploys from | `master` | `project-dash` |

**The relationship that works:** Tom is a **design partner**, not a customer of
Project Dash. He funds and pressure-tests features on live jobs; the proven ones
graduate into Dash generalised. His feedback is worth a great deal precisely
because it's real — but he is n=1, and n=1 does not set a product roadmap for
strangers. *(That cuts against the advice earlier in this project's history to
prioritise by what Tom asks for. For Hub, that's still right. For Dash, it isn't.)*

**The failure mode to avoid:** Dash becomes "Maintain London's app, resold."
Every prospect can smell that, and it shows up in exactly the places §3 lists.

---

## 2. What is already separated (more than expected)

- **Deployments and domains.** Two Cloudflare Pages projects, two branches, one
  `PLATFORM_DOMAIN` switch. Documented in [PLATFORM_SETUP.md](PLATFORM_SETUP.md).
- **Tenancy.** `organisations` + `memberships`, subdomain pins the active org,
  membership gates entry. Real isolation, not cookie-scoping.
- **Authorisation.** `canAccessProject` is now enforced across 32 API routes —
  entries, photos, reports, documents, financials, variations, invoices,
  programme, procurement, messages, time. The endpoints that don't use it
  (gallery, attendance, quotes, time report, document folders, voice, people)
  were spot-checked and scope by `org_id` or `canAccessEntry` instead. **The
  "isolation is staged / trusted tenants only" warning in the older notes is out
  of date** — the per-record checks landed.
- **Emails and invoices are already per-tenant.** `lib/email.ts` reads
  `org.brand_color` with a neutral `PLATFORM_COLOR` fallback;
  `lib/invoice-document.ts` uses the org's colour.

That's a genuinely good foundation. The gaps are narrower than they look.

---

## 3. What the clone would inherit — measured, not guessed

**The approach is decided: clone the repo and split.** The products aren't
conceptually entangled — it's one codebase that becomes two.

So this section isn't an argument against that. It's the list of Maintain London
specifics currently sitting in the code that a clone would carry into the SaaS on
day one. **The sequencing point that matters: fix 3.1 and 3.2 *before* you clone,
so the work happens once instead of twice.** Everything else can be done on
either side of the split.

### 3.1 The UI is hardcoded Maintain London green

**173 occurrences of `#AEDE4A` across 48 files** in `src/components/project-hub/`
and `src/pages/project-hub/` — buttons, focus rings, links, active states.
`organisations.brand_color` exists and is set per business, and the *emails* honour
it, but the app itself ignores it.

Every subscriber's app is Maintain London's brand colour. This is the single most
visible "this is someone else's product" signal in the whole codebase.

*Fix:* one CSS custom property (`--brand`) set from the resolved org on the layout,
then a mechanical find-and-replace of the literal. Half a day, almost entirely
sed. Worth doing early precisely because it gets harder with every new component.

### 3.2 Generated reports say "Maintain London"

`src/lib/report-generator.ts` hardcodes the literal string `Maintain London` in the
brand slot of both the daily report and the weekly summary (lines ~165 and ~367).

These are the documents a subscriber sends **to their own clients**. A competitor's
name on them is not a cosmetic bug, it's a refund request. **Hard blocker on taking
money.**

### 3.3 The database has to split too

The current golden rule in [PLATFORM_SETUP.md](PLATFORM_SETUP.md) — "Project Dash
MUST use the same D1 as the existing site" — was written when Maintain London was
tenant #1 of your own group. **A clone-and-split makes it obsolete, and that
document needs rewriting**, or someone follows it later and wires the SaaS back
into Tom's database.

Dash gets a **fresh, empty D1 + R2**: no `org-maintain-london` seed row, no
Maintain London branding defaults, no live client data in the tables you demo
from. That's a benefit of splitting, not a cost.

There's also a commercial argument that makes it non-negotiable rather than merely
tidy:

> **Tom is a competitor to your prospects.** Maintain London is a London
> maintenance and renovation contractor. Your subscribers will be London
> maintenance and renovation contractors. "So my job costs, my client list and my
> photos sit in the same database as a rival's?" gets asked on a sales call, and
> "the queries are scoped properly" is a losing answer even though it's true.

Separate databases turn that from an objection into a selling point.

### 3.4 No commercial layer at all

Verified: **zero** Stripe/billing/subscription/plan/trial code. The 41 "subscri"
hits in the codebase are all *push* subscriptions.

Concretely missing:
- **Self-serve signup.** `POST /api/org` is `isPlatformAdmin` only — a business
  only exists if you create it by hand. Fine for the first ten customers
  (sales-led onboarding is a feature at that stage), fatal at a hundred.
- **Billing.** No Stripe, no plans, no seats, no trial, no dunning, no cancellation.
- **Plan gating.** `capabilities.ts` gates by *role*, not by *plan*. There is no
  way to say "this business is on Starter, so no AI agents."
- **Usage metering.** AI spend per org is untracked. It's pennies today; it's a
  P&L line at a hundred businesses, and it's the thing that decides whether
  "unlimited AI" is a promise you can keep.

---

## 4. The split — how to do it cleanly

**Decided: clone the repo, split, develop separately.** Hub stays where it is and
serves Tom. Dash becomes its own repo, own Cloudflare project, own D1, own R2, own
domain — and stops being a branch of a builder's marketing site, which is the
right shape for something you're selling.

### Do these before you clone (once, not twice)

1. **De-brand the UI** (§3.1) — 173 literals, 48 files, mostly sed.
2. **De-brand generated reports** (§3.2) — org name and logo in the brand slot.
3. Anything else in the working tree worth having on both sides — the voice/AI
   Phase 1 work, the unresolved `src/lib/approvals.ts` conflict.

Both products want all of that, and after the split each fix costs double.

### At the clone

- Fresh D1 + R2, no Maintain London seed (§3.3).
- Strip the Maintain London **marketing site** — `Hero`, `Footer`, `Navigation`,
  `Testimonials`, `WhyChooseUs`, `BrochurePromo`, the services/areas/blog pages,
  `contact.ts`, and the ML schema/OG tags in `Layout.astro`. That's the bulk of
  the "Maintain London" hits in the codebase and none of it belongs in a SaaS.
- Move the app off `/project-hub/` to the domain root — the path only exists
  because it was a subfolder of a builder's website.
- Rewrite [PLATFORM_SETUP.md](PLATFORM_SETUP.md); its central instruction becomes
  wrong the moment you split.
- Rename the product surface: "Project Hub" appears in UI copy and email
  subjects.

### The one real cost, stated once

Two repos drift. A bug fixed in one is not fixed in the other, and within a couple
of months they're different enough that porting stops being a cherry-pick. That's
the accepted trade for independence — worth naming so it isn't a surprise later.

Two things blunt it cheaply: keep the commit that splits them tagged in both, so
`git log` from that point tells you what each side gained; and when you fix
something genuinely shared (auth, tenancy, offline sync), fix it in Dash first,
since that's the one with paying users.

---

## 5. Gate list before taking a single subscription

Ordered. Nothing below the line ships to a paying stranger.

1. **De-brand the UI** (§3.1) — `--brand` from the org, kill the 173 literals.
   *Do it before the clone.*
2. **De-brand generated reports** (§3.2) — org name and logo in the brand slot.
   *Hard blocker. Also before the clone.*
3. **Stand up Dash's own D1 + R2**, empty, and rewrite PLATFORM_SETUP.
4. **Self-serve signup** — org creation without a platform admin, slug claim,
   email verification, first-run wizard. The onboarding auto-fill that pulls a
   logo from a website (`lib/onboarding.ts`) is already the good bit of this.
5. **Billing** — Stripe, plans, seats, trial, cancellation.
6. **Plan gating** — a `plan` on `organisations`, checked alongside capability.
7. **Usage metering per org** — AI minutes and tokens, so pricing is grounded.
8. **Trust surface** — DPA, GDPR/processor terms, backup and restore that has
   actually been tested, a security page. Subscribers ask; Tom never did.
9. **Data export** — for churn, and because the Building Safety Act work in
   [sweep 3](COMPETITIVE_AGENTS_AND_FM.md) wants guaranteed portability anyway.

Items 1, 2 and 4 are days. 5–7 are the real project.

---

## 6. Pricing — what the sweeps actually bought us

The three sweeps produced comparable numbers. For 15 users:

| | 15 users | Model |
|---|---|---|
| CompanyCam Core + seats | ~$469/mo | Per seat, **AI metered**, marketing +$79–99 |
| CompanyCam Scale | $199 + seats | Unlimited AI only at the top |
| RelayCam Premium | **$224/mo** | Banded by user count |
| Fieldwire Pro | ~£690/mo | Per seat |
| Onetrace | £180/mo (5 seats) | Full features from entry tier |
| pin360 Pro | £99/mo | Flat |
| Joblogic / Procore / Plentific | quote-gated | Sales-led |
| Dalux Field Basic | £0 | Free snagging |

Three readings:

- **Per-seat pricing is the most-cited complaint in every review of CompanyCam
  read across all three sweeps.** Banded or flat per-business pricing is a
  positioning wedge, not just a preference — it also stops customers rationing
  logins, which kills the daily-capture habit the whole product depends on.
- **Metered AI is the second complaint.** Our AI genuinely costs pennies per
  business per month (Workers AI Whisper at $0.00051/audio-min; Claude for the
  structuring). **"Unlimited AI on every plan" is a promise we can actually keep
  and they can't** — but only once §3.4's metering exists to prove it.
- **The photo-only tier has collapsed to ~$200–250/mo.** Photo management alone
  can't be what Dash charges for. The price is justified by the contract, the
  money, the compliance record and the agent layer — which is where the roadmap
  already points.

---

## 7. How to run the two from here

- **Feature flow is one-way, and manual after the split.** Hub proves, Dash
  generalises — but once the repos are separate that's a deliberate re-write, not
  a merge. Never build a Dash feature *for* Tom; never port a Tom-specific
  request into Dash without first asking what the generic version is.
- **Tom's asks land in [FEEDBACK_TOM.md](FEEDBACK_TOM.md)** as they do now.
  Dash's roadmap lives in the competitive docs. Two lists, deliberately.
- **Anything client-facing must be tenant-branded from the first commit** —
  reports, emails, invoices, portal, share links, PDF exports. The rule that
  would have prevented §3.2.
- **Get a second design partner.** The strongest thing missing from all three
  sweeps isn't a feature — it's a second real business using this. One is a
  bespoke build; two is a product.
