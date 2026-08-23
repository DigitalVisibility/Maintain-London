# Competitor sweep #2 — beyond CompanyCam

> Researched August 2026. Companion to [COMPETITIVE_COMPANYCAM.md](COMPETITIVE_COMPANYCAM.md).
> Prompted by two named competitors (relaycam.com, crewcam.com) and the question
> "can we plot photos on a map / site plan?"
>
> Pricing marked *(3P)* comes from third-party comparison pages rather than the
> vendor's own pricing page — treat as indicative.

---

## 1. The two you named

### RelayCam and CrewCam are the same company

`crewcam.com` is a parked domain selling action-camera accessories — not a
competitor. The real product is **crewcamapp.com**, and it now **301-redirects to
relaycam.com**. Same tagline on both ("Job photo app every company needs"), same
blog, same product. They rebranded CrewCam → RelayCam. So this is *one*
competitor, not two.

### RelayCam — what it actually is

Headline: *"All photos, one spot."* A deliberately thin CompanyCam clone.

| | |
|---|---|
| Capture | Time + location stamped photos, video, unlimited storage |
| Organise | Projects, tags, labels, real-time feed |
| Annotate | Markup on photo |
| Accountability | Photo-required checklists, per-member permissions |
| Share | Shareable reports, photo galleries |
| Integrations | ProLine, Buildertrend, Roofr (3 — vs CompanyCam's 60+) |
| Pricing | **$39/mo** up to 2 users · **$89** up to 5 · **$224** up to 15 · annual ≈18% off |

Their pitch is liability: *"time and location stamped so you can save your butt
and avoid getting the finger pointed at you."*

**The one thing worth noting:** their pricing page lists **"AI Walk & Talk and
CoPilot — early access"** on *every* tier including the $39 one. It isn't on the
homepage, so it's unreleased or barely released. That is the same walk-and-talk
loop CompanyCam sells and that we're building in Phase 1 — and RelayCam is
pricing it as standard, not metered credits. Confirms two things: the voice loop
is becoming table stakes fast, and **metering it (CompanyCam's model) is the
weakness to attack, not the feature itself.**

**Verdict: nothing to copy.** Every RelayCam feature is either already ours or
already in Tier 1/2 of the existing plan. Their per-seat economics are the story
— $224/mo for 15 users is roughly a third of CompanyCam. If we ever price
against the low end of this market, RelayCam is the number to beat, not
CompanyCam.

---

## 2. The real finding — nobody in the photo-app tier does *space*

Every "jobsite photo app" (CompanyCam, RelayCam, Raken, PHOTO iD, SiteCapture)
organises photos on **two axes: project and time**. A feed, a date filter, some
tags.

There is a separate, largely non-overlapping category that organises photos on a
**third axis: where on the job**. That category barely markets to trades — it
sells to main contractors, surveyors and inspectors. It is the gap you spotted,
and it's the single biggest thing in this whole sweep.

### Who does it, and how

| Product | Spatial method | Notes | Price |
|---|---|---|---|
| **SiteCam** | Pin photos to floor plan per level; **GPS map view for outdoor/linear jobs**; timeline per pinned location (before/during/after at the same spot) | Closest to what we'd build. Offline, web + mobile, PDF/URL reports | £22/user/mo *(3P)* |
| **pin360** | Photos, 360° panoramas and scans pinned to PDF plans; severity pins (critical/high/med/low); branded share links with external comment threads | UK, camera-agnostic (Insta360/Theta/GoPro Max). Free tier | £29 / £99 / £249 / £999 per mo |
| **SiteMarker** | Geotagged pins on a **real map**, with PDF/image/**KMZ** overlays auto-aligned by position and scale; Bluetooth GPS for survey-grade precision | Pins → daily report. Strong for external/linear works | Not published |
| **PinMy** | Pins on drawings, PDFs, photos, **3D IFC models** and maps — each pin carries comments, markup, video, **voice notes**, docs and tasks | Already pairs pins with voice — the combination we're heading for | Not published |
| **SitePlan** | Navigate PDF plans *and* satellite map by phone GPS; photos auto-located on both | Purely spatial | Not published |
| **Dalux Field Basic** | Snags placed on a drawing or federated **BIM model**, photo attached, assigned with a deadline, subcontractor responds in-app | **Free, no limits.** Huge UK/EU install base. Sets the floor price for snagging | £0 |
| **Fieldwire** | Tasks dropped onto blueprints with photos attached; plan versioning | The commercial-site standard | £46–88/user/mo *(3P)* |
| **OpenSpace** | Hard-hat 360 camera, **walk normally** — SLAM auto-pins every frame to the plan. Street View for the site. 25k sq ft in 10 min, viewable in ~15 min | The premium end. No manual pinning at all | Enterprise |
| **Manifold** | **3D scanning on any phone** (no LiDAR needed, ±½") → auto-generated 2D floor plans; photo-required punch lists; reports structured by room and phase | Directly attacks CompanyCam's LiDAR-gated Scale tier | $16–24/user/mo *(3P)* |

### The pattern

The cheap end (SiteCam, SitePlan) does **GPS-on-a-map**, which costs almost
nothing to build. The mid end (pin360, PinMy, Dalux, Fieldwire) does
**tap-to-pin on an uploaded drawing**, which is a canvas and a pair of
normalised coordinates. Only the top end (OpenSpace) does automatic spatial
registration, which needs a 360 camera and SLAM.

**The first two are cheap for us, and we're most of the way there already.**

---

## 3. Also worth knowing about

**Onetrace** *(UK — the most relevant non-photo competitor here)*
Cloud platform for **subcontractors**: custom forms, photo evidence, timesheets,
material tracking, **variation tracking**, drawing annotations, branded reports,
approvals, signed documents. Strong in fire protection / passive fire
compliance. **£180/mo for 5 seats**, full features from the entry tier.

This is the closest thing to *us* that turned up — same "documentation +
compliance + workforce in one place" thesis, same UK market. Differences that
matter: they have drawing annotation and we don't; we have the contract, the
valuation, the client portal and the AI, and they don't. Worth watching.

**Raken** — the daily-report specialist. Weather/labour/equipment/materials on a
templated daily, plus **toolbox talks, safety observations, incident reports**
and production tracking (units installed vs planned). ~$15–25/user/mo *(3P)*,
quote-gated. Their toolbox-talk and observation flows are more mature than
anything in our diary; production tracking is a real idea we don't have.

**PHOTO iD (U Scope)** — AI-assisted photo metadata and heavily templated
inspection reports. Insurance/restoration angle.

**FieldFuze** — $0/month, unlimited users, monetised on 2.9% payment processing.
Worth knowing the floor exists.

**JobNimbus / AccuLynx** ($150–600/mo) and **Buildertrend** ($499+/mo) — CRM-led,
US residential/roofing. Not our shape.

---

## 4. What to actually take

Ranked by (value to us) ÷ (cost to build).

### A. Photos on a map + photos on a site plan — **do this**

This is the recommendation. It splits into two layers that share one UI.

**Layer 1 — GPS map.** Nearly free. `entry_files` already has `lat`/`lng`
(added in `migrations/0026_voice_ai.sql`), `projects` already has `lat`/`lng`,
and the app already asks for geolocation at clock-in. What's missing is a map
component and capturing the fix at shutter time. Pins cluster by proximity, tap
a pin → the photo, its caption, its diary day. For external works, roofs,
grounds, estates and multi-building sites this is useful on day one.

**Layer 2 — plan pins.** Upload a floor plan or site plan (PDF page or image) to
the project, tap the spot on the plan where you're standing, and the photo pins
there. Storage is two floats — `plan_x`, `plan_y` as 0–1 fractions of the plan —
so the pin survives any zoom, screen size or re-render. The same pin carries the
photo, the caption, the voice note and, later, the snag.

Why this is the right pick for *us* specifically:

- **It closes our last structural gap versus the spatial tier**, at a fraction of
  what OpenSpace-style capture would cost.
- **Pins compose with everything we already own.** A pin isn't just a photo — it
  can be a snag, a variation, a valuation line, a compliance record. Nobody in
  section 2 has anything downstream of the pin except a PDF report.
- **It makes same-angle re-shoot (2.3) and the photo timeline (2.4) better.**
  SiteCam's timeline is per *pinned location*, which beats a flat project
  timeline: progress at *this* spot, over time.
- **Photo-evidenced valuations (3.2) become evidenced by room.** "First fix,
  second bedroom, 80%" links to the pins in that room.

**Do not** build 360/SLAM. That's OpenSpace's moat, it needs hardware, and no
London maintenance contractor is wearing a hard-hat Insta360.

### B. Snags placed on the plan — **strong follow-on**

Tier 3.3 (AI snagging) is currently planned as a *list*. Dalux gives snagging
away free precisely *because* it's placed on a drawing — a snag list without a
location is a weaker product than the free option. Once pins exist, snags-on-plan
is a small increment, and ours would fall out of an AI walkthrough rather than
manual tapping. Assign, deadline, subcontractor responds with a photo, sign off.

### C. Severity pins — cheap, borrowed from pin360

Critical / high / medium / low as pin colour. Trivial to add, makes the plan view
readable at a glance, and feeds priority into tasks.

### D. Toolbox talks, safety observations, incidents — borrowed from Raken

Tier 3.4 (compliance capture) mentions toolbox talks in passing. Raken makes them
a first-class object with attendance. Given voice capture, ours could be: run the
talk, record it, transcribe it, everyone taps to sign, filed against the project
and the date. Strong for the HSE record and nearly free once 1.1/1.2 land.

### E. Production tracking — borrowed from Raken

Units installed vs units planned, per day. We already have the programme and the
valuation, so this closes the loop between "what was done today" and "% complete"
without anyone eyeballing a percentage.

### F. Photo-required checklists — RelayCam / Manifold

An item cannot be ticked without a photo. One rule, real accountability, and it
makes checklists defensible the same way our photos are.

### G. Explicitly **not** taking

- 360/SLAM capture (OpenSpace) — hardware-dependent, wrong customer.
- Phone LiDAR / 3D scanning and auto-generated floor plans (Manifold) —
  impressive, but it's a surveying product. Revisit only if clients start asking
  for measured surveys.
- KMZ/GIS overlays and Bluetooth survey GPS (SiteMarker) — civils, not us.
- BIM/IFC model viewing (Dalux, PinMy) — enormous build, wrong market tier.
- CRM / estimating / payments (JobNimbus, Buildertrend, Jobber) — different
  product.

---

## 5. Effect on pricing posture

| Product | 15 users |
|---|---|
| CompanyCam Core + seats | ~$469/mo (+ $79–99 marketing, AI metered) |
| CompanyCam Scale | $199 + seats, unlimited AI |
| RelayCam Premium | **$224/mo** |
| Fieldwire Pro | ~£690/mo |
| Onetrace | £180/mo for 5 seats |
| pin360 Pro | £99/mo |
| Dalux Field Basic | £0 (snagging only) |

Two things fall out. The photo-only tier has collapsed toward **$200–250/mo for
15 users**, so photo management alone cannot be what we charge for. And Dalux
gives away snagging-on-a-drawing entirely, so plan pins have to ship *with* the
platform, never as a paid add-on. Our price has to be justified by the contract,
the money and the AI — which is exactly where the existing plan already points.

---

## 6. Effect on the roadmap

Added to [COMPETITIVE_COMPANYCAM.md](COMPETITIVE_COMPANYCAM.md) as **Tier 4 —
Spatial (4.1–4.5)**, plus **3.11 / 3.12** in Tier 3. Suggested timing: after
Phase 1 lands, alongside the Tier 2 photo work — the GPS layer in particular is
small enough to ride along with the capture-UI build rather than waiting.

---

## Sources

- [relaycam.com](https://relaycam.com) · [relaycam.com/pricing](https://relaycam.com/pricing) · [crewcamapp.com](https://www.crewcamapp.com/) (redirects)
- [SiteCam](https://sitecam.io/construction-photo-app/) · [pin360](https://pin360.io/) · [SiteMarker](https://www.sitemarker.com/) · [PinMy](https://play.google.com/store/apps/details?id=co.pinmy) · [SitePlan](https://apps.apple.com/us/app/siteplan/id1461758214)
- [Dalux Field Basic](https://www.dalux.com/en-gb/field-basic-snagging/) · [OpenSpace Capture](https://www.openspace.ai/products/capture/)
- [Onetrace — CompanyCam alternatives](https://onetrace.com/journal/companycam-alternatives) · [Manifold — CompanyCam alternatives](https://www.scanmanifold.com/blog-posts/best-companycam-alternatives-2026) · [SelectHub — Raken](https://www.selecthub.com/p/construction-management-software/raken/)
