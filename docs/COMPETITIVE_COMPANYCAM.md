# CompanyCam — competitive analysis & feature roadmap

> Researched August 2026. Sources: companycam.com/features, /pricing,
> their AI-tools blog, and third-party 2026 reviews (G2, Tooled Up Pro,
> FieldCamp, Roofing Software Guide).
>
> **Wider field:** [COMPETITIVE_FIELD_APPS.md](COMPETITIVE_FIELD_APPS.md) covers
> RelayCam/CrewCam, Onetrace, Raken, and the spatial tier (SiteCam, pin360,
> PinMy, SiteMarker, Dalux, Fieldwire, OpenSpace, Manifold). It's the source of
> Tier 4 below.
>
> **What shipped in 2026:** [COMPETITIVE_AGENTS_AND_FM.md](COMPETITIVE_AGENTS_AND_FM.md)
> covers the June–August 2026 window — Procore's agents and the DroneDeploy
> acquisition, MCP as the AEC interop layer, the AI-native OS newcomers (Sledge,
> conmeet), and the UK maintenance tier (Joblogic, FaultFixers, Plentific,
> Fixflo). Source of Tiers 5 and 6.

---

## 1. What CompanyCam actually is

A **photo-first documentation app** for trades. Everything else hangs off the
camera roll.

| Area | What they have |
|---|---|
| Capture | Unlimited photo/video, auto time + GPS stamp, unlimited cloud storage |
| Organise | Projects, tags, labels, project feed, checklists, "Pages" (a notebook) |
| Annotate | Draw, text, arrows, measurements burned onto the photo |
| Share | Galleries + live timelines behind a public link, client updates |
| AI | Voice-to-report, quick captions (talk-to-text), AI summary pages, voice-activated checklists, translation |
| Money | Take a card payment on site |
| Marketing | Photos → Google Business posts, social content, review requests (paid add-on) |
| Integrations | 60+ — QuickBooks, Jobber, JobNimbus, AccuLynx, ServiceTitan, Zapier, HubSpot |

**Pricing:** Core $63/mo (1 user, +$29/seat) · Crew $129 (3 users) · Scale $199
(3 users) · Enterprise custom. **AI is metered** — 20 credits on Core, 100 on
Crew, unlimited only on Scale/Enterprise. Marketing suite is a further $79–99/mo.
A 15-person firm pays roughly **$360–735/month for photo management**.

### Their AI flow, precisely

The thing worth copying is one loop:

> Walk the site → tap the shutter → hold and talk → AI writes it up.

Three named products come out of that same loop:

- **Walkthrough Note** — photos + spoken commentary → a client-ready document the
  office turns into a proposal.
- **Quick Captions** — a short voice note per photo becomes its caption.
- **Daily Logs** — end of day, photos + voice → a formatted progress report
  showing what was done and what's outstanding, editable before sending.

### Where they're weak (from their own reviewers)

- **Not a management system.** "Doesn't schedule jobs, dispatch techs, or send
  invoices." No contract sum, no variations, no valuations, no programme.
- **Expensive per seat**, and the useful AI is gated to the $199 tier.
- **Weak offline** — reviewers repeatedly flag poor behaviour on bad signal.
- **Photos are compressed** for storage.
- **US-shaped.** No CIS, no VAT reverse charge, no JCT/RIBA vocabulary, no
  Building Safety Act golden-thread thinking.

---

## 2. Where we already stand

We are **not behind CompanyCam** — we're a different, deeper product that happens
to have a shallower camera.

Already shipped that they simply do not have: diary as structured data, client
portal with per-item release control, tiered approvals with one-tap email
decisions, a numbered variations register feeding a live interim valuation,
client invoices + VAT receipts, programme (Gantt), procurement, document hub,
timesheets with geo clock-in, multi-tenant orgs with per-role capabilities, AI
client summaries on a configurable cadence, offline-first PWA, push notifications.

**The gap is not features. It is the first three seconds of input.** Their user
opens the app, shoots, talks, and is done. Ours opens a form. That is the whole
of what we need to close — and once we close it, our data model does things
theirs structurally cannot.

---

## 3. The build list

### Tier 1 — Close the capture gap

This is the answer to "why can't we add these": we can. Nothing here is
speculative; the pieces are already in the repo.

**1.1 Voice notes on site**
Hold-to-talk button on the diary form and in the photo gallery. `MediaRecorder`
→ webm/opus blob → R2 (we already have `lib/r2.ts`) → transcribe. Queue the audio
in IndexedDB when offline and transcribe on sync — this is where we beat them
outright, since poor-signal behaviour is their most-cited complaint.

**1.2 Transcription**
Cloudflare **Workers AI Whisper** (`@cf/openai/whisper-large-v3-turbo`), which
keeps us on the existing all-Cloudflare stack. **$0.00051 per audio minute**, and
Workers AI includes 10,000 neurons/day free (~240 audio minutes/day on standard
Whisper) before you pay anything. A site team recording 20 minutes a day costs
about **1p a month**. *(Note: the Claude Messages API does not accept audio — it
takes text, images and PDFs. Speech-to-text has to be a separate step. Workers AI
is the cheapest one that doesn't add a new vendor.)*

**1.3 Voice + photos → a filled diary entry (not just prose)**
This is the feature to be proud of. Claude receives the transcript *and the
photos* (vision) and returns the **structured** entry — activities with status,
delays with reasons and hours lost, personnel, materials delivered, variations —
as a draft the operative confirms with one tap.

CompanyCam's AI produces a *document*. Ours produces *rows in a database* that
then flow into the variations register, the valuation, the client update and the
invoice. Same input, and everything downstream comes free. That is the moat.

**1.4 Photo auto-captioning (Claude vision)**
Every uploaded photo gets a caption and tags without anyone typing. Already on
the roadmap as "Photo Auto-Tagging" — vision is a direct API call, no new vendor.

**1.5 Site walkthrough → quote pack**
Their "Walkthrough Note", but finished. Walk an unsold job, shoot and talk; out
comes a scoped, sectioned draft — rooms, works, provisional quantities, flagged
unknowns — that the office prices. We have no lead/estimate object yet, so this
needs a `quotes` table that graduates into a `project` on acceptance. **Biggest
new-revenue feature on this list** — it shortens the sales cycle, not just the
admin.

**1.6 Gloved-hands capture UI**
Full-bleed camera, one enormous shutter, hold-anywhere-to-talk, no keyboard
required for a complete day's entry. Ergonomics, not features — and it's the
actual reason people love their app.

### Tier 2 — Photo features at parity

**2.1 Annotation** — draw, arrow, text, and a rough measure on a photo (canvas
overlay, flattened on save, original kept).

**2.2 Burned-in stamp** — date/time, GPS, project, and *weather* (we already pull
it; they don't). Makes a photo defensible in a dispute.

**2.3 Before/after + same-angle re-shoot** — ghost the earlier photo over the
viewfinder so progress shots line up. Strong for marketing and for valuations.

**2.4 Project photo timeline** — scrollable by date/room/trade/tag, with the
diary context attached to each shot.

**2.5 Tokenised share links** — a read-only gallery link for a client, architect
or insurer who has no login. We have the portal; this is the no-account version.

**2.6 Search photos by content** — "show me every shot of the consumer unit",
answered off the AI-generated tags.

**2.7 No compression by default** — they compress; we store the original in R2.
Say so out loud in marketing.

### Tier 3 — Above and beyond (things they can't follow us into)

These all exploit the fact that we own the contract, the money and the programme.
CompanyCam would have to build a whole product to compete on any of them.

**3.1 Voice → priced variation.** "The client's asked for two extra spots in the
hallway" becomes a numbered draft in the variations register, routed for
approval, landing in the next valuation. Spoken change to billed change, no
office in the middle.

**3.2 Photo-evidenced valuations.** Every % complete figure links to the photos
that justify it. Kills the "prove it" argument on interim payments.

**3.3 AI snagging list.** Walk the job at handover; vision produces a defect
schedule with location, trade and severity, which becomes assignable tasks.

**3.4 Compliance capture (UK).** Scaffold handover, permits, plant checks, RAMS
sign-off, toolbox talks — spoken, photographed, timestamped, geolocated. This is
the record HSE actually asks for, and no US photo app has it.

**3.5 Golden-thread / handover pack.** One button: every drawing, certificate,
photo and diary day assembled into an indexed handover bundle. Building Safety
Act tailwind.

**3.6 Multilingual sites.** Operative speaks Polish, Romanian, Portuguese; Whisper
transcribes, Claude writes the diary in English and can read it back in their
language. They have "translation"; we'd have it end-to-end through the record.

**3.7 Ask the project.** Client or PM asks "when was the first fix signed off?"
and gets an answer cited to a diary day and a photo. Retrieval over our own record.

**3.8 Dispute / insurance pack.** Export a chronological, timestamped, GPS-tagged
bundle for a claim or adjudication. Legal-grade version of their "timeline".

**3.9 WhatsApp / SMS ingest.** UK site teams already send photos on WhatsApp.
Meet them there, file it into the right project automatically.

**3.10 Xero + CIS.** The outstanding Xero integration, plus CIS deduction and VAT
domestic reverse charge on subcontractor payments. Table stakes here, absent from
every US competitor.

**3.11 Toolbox talks + safety observations as objects.** Raken makes these
first-class: a talk with an attendance list, an observation with a severity, an
incident report. Ours would be spoken — run the talk, record it, transcribe it,
everyone taps to sign, filed against project and date. Nearly free once 1.1/1.2
land, and it's the record the HSE actually asks for.

**3.12 Production tracking.** Units installed vs units planned, per day, per
activity. We own the programme and the valuation, so this replaces someone
eyeballing a "% complete" with something counted on site. Raken has the
counting; nobody in that tier has the valuation to feed it into.

### Tier 4 — Spatial (where on the job, not just which job)

From the second competitor sweep — see
[COMPETITIVE_FIELD_APPS.md](COMPETITIVE_FIELD_APPS.md). The photo-app tier
(CompanyCam, RelayCam, Raken) organises photos on two axes only: project and
time. A separate category — SiteCam, pin360, PinMy, SiteMarker, Dalux, Fieldwire,
OpenSpace — adds a third, *location on the job*, and none of the photo apps have
followed. This is the largest single gap the sweep found, and most of the
groundwork is already in the repo.

**4.1 GPS photo map.** `entry_files` already carries `lat`/`lng` (added in
`migrations/0026_voice_ai.sql`); `projects` already carries them; the app already
requests geolocation at clock-in. What's missing is capturing the fix at shutter
time and a map view — pins clustered by proximity, tap a pin for the photo, its
caption and its diary day. Small enough to ride along with the 1.6 capture-UI
work. Best for external works, roofs, grounds, estates and multi-building sites.

**4.2 Plan pins.** Upload a floor or site plan (PDF page or image) against a
project; tap where you're standing; the photo pins there. Store `plan_x` /
`plan_y` as 0–1 fractions of the plan so pins survive any zoom, screen size or
re-render. One pin carries photo, caption, voice note — and later the snag, the
variation, the valuation line. *That downstream is the differentiator: everyone
else's pin terminates in a PDF report.*

**4.3 Location timeline.** SiteCam's better idea — a timeline per *pinned spot*
rather than per project. Before / during / after at the same location, which is
also what makes 2.3 (same-angle re-shoot) worth building.

**4.4 Snags on the plan.** Upgrade 3.3 from a list to placed defects with
severity colours (pin360's critical/high/medium/low), assigned with a deadline,
subcontractor answering with a photo. **Note the pricing floor:** Dalux Field
Basic gives snagging-on-a-drawing away *free* and has a large UK install base, so
a snag list *without* a location is weaker than the free option. Ours earns its
place by falling out of an AI walkthrough instead of manual tapping.

**4.5 Photo-required checklists.** An item can't be ticked without a photo.
RelayCam and Manifold both lean on this; it's a one-line rule that makes
checklists as defensible as the photos.

**Deliberately out of scope:** 360/SLAM auto-registration (OpenSpace — needs a
hard-hat camera), phone LiDAR and auto-generated floor plans (Manifold — that's a
surveying product), KMZ/GIS overlays and survey-grade Bluetooth GPS (SiteMarker —
civils), BIM/IFC viewing (Dalux, PinMy — wrong market tier).

*Confirmed by sweep 3: Procore bought DroneDeploy for **$845M cash** on 29 July
2026, explicitly so AI can "see the site, understand what changed, and trigger
action." Spatial is strategic, not cosmetic.*

### Tier 5 — The agent layer

From the third sweep — see
[COMPETITIVE_AGENTS_AND_FM.md](COMPETITIVE_AGENTS_AND_FM.md). Between June and
August 2026 the industry moved from *AI that drafts a document* to *agents that
act*, and MCP became the AEC interoperability layer in public: Revizto shipped an
MCP server on 28 July, Autodesk shipped official MCP for Fusion plus a cloud data
server, Procore has one. **All of them are enterprise platforms. Nobody at the
trades/SME tier has this.** Every AI feature in Tier 1 above is a generator —
input, draft, human sends. That was the frontier in sweep 1; it is now the floor.

**5.1 MCP server over the project record — the one to be early on.** Expose diary
days, photos and captions, variations, valuations, programme, timesheets,
documents and compliance records as MCP tools, per-tenant and capability-scoped.
A PM or client then points *their own* Claude at the project and asks anything.

Why us, specifically: we're already on `@anthropic-ai/sdk` and Workers (MCP is
Anthropic's protocol, Workers is a first-class host for a remote server), the
authorisation model already exists in `src/lib/capabilities.ts`, and — the point
— **our data is rows, not documents.** Everything sweep 1 said about the moat
("theirs produces a document, ours produces rows") cashes out here: rows are
queryable by an agent, PDFs aren't. This is what finally monetises that decision.
Read-only first, per-tenant tokens, everything logged; write tools later.

**5.2 "Ask the project" (3.7) becomes a client of 5.1** rather than a bespoke
feature — build once, use twice.

**5.3 Cited answers by default.** Alloovium's entire product is cited answers over
project documents. Anywhere the AI states a fact, link the diary day, photo or
document behind it. Small, and it's becoming an expectation rather than polish.

**5.4 Skills — per-org AI instructions.** Procore's tell: the differentiator is
shifting from what the AI can draft to what a firm can *teach* it. Let a business
write in plain English how they want a diary day written, what counts as a
variation, what their sign-off rules are — applied on every project. It's a prompt
fragment in the DB and a settings page, with disproportionate retention value.

**5.5 Scheduled agents, not buttons.** Not twenty; four that run on a trigger:
**day-close** (nothing filed for an active site — chase, and draft from the photos
and clock-ins that do exist), **variation watcher** (reads the day's diary and
offers to raise one, i.e. 3.1 in reverse), **valuation assembler** (monthly, with
photo evidence attached), **compliance chaser** (RAMS unsigned, certificate
expiring, no toolbox talk this week).

### Tier 6 — Maintenance, not just construction

The UK FM tier — Joblogic, FaultFixers, Plentific — is built around an object we
do not have at all: **the asset**. Everything of ours hangs off project → diary
day. For planned and reactive maintenance across a property portfolio the durable
object is the asset, not the project. This is the largest new object on any of the
three sweeps, and it's the difference between a construction diary and a
maintenance platform.

**6.1 Asset register + QR tags.** Assets per site (boiler, AHU, lift, fire door),
with service history, certificates and expiry. Print a QR tag; scan it on site to
get the full record, or raise a job against it. Joblogic does PPM "to asset level"
with QR tagging; FaultFixers sells QR asset scanning as a headline. Pairs with
4.2 — a pin on the plan and a tag on the plant are two routes to one record.

**6.2 PPM schedules.** Recurring planned works generating jobs automatically.
Follows directly from 6.1.

**6.3 SLA / response clocks.** Target response and target fix on reactive jobs,
with a countdown and a breach flag. Standard across the FM tier, absent from every
construction photo app.

**6.4 Managing-agent portal integration — distribution, not just plumbing.**
Fixflo and BigChange integrated in 2026 so live repair status flows from the
contractor's job system into the agent's portal and they stop ringing to ask.
Maintain London's clients *are* those agents, so being the system that feeds their
portal is a cheaper route to a second customer than selling cold. **Ask Tom which
portals his clients actually use before building anything.**

---

## 4. Cost of the AI features

| Piece | Service | Cost |
|---|---|---|
| Transcription | Workers AI `@cf/openai/whisper-large-v3-turbo` | $0.00051 / audio min (10k neurons/day free) |
| Diary structuring | Claude, `claude-opus-5` | $5 / $25 per Mtok |
| Photo captions | Claude vision — cheap tier is fine | Haiku 4.5 at $1 / $5 per Mtok |
| Storage | R2 (already ours) | £0 egress |

A 20-person firm running voice diaries daily lands in the **low tens of pounds a
month**, against **$360–735/month** for CompanyCam alone — and CompanyCam meters
its AI on the two cheaper tiers. Unlimited voice-and-photo capture as a *standard*
feature, not a credit pack, is a real positioning wedge.

---

## 5. Suggested order

1. **1.1 + 1.2** — record audio, get a transcript. Everything else stands on it.
2. **1.4** — photo auto-captions. Immediate visible payoff, small surface.
3. **1.3** — voice + photos → structured diary draft. The headline feature.
4. **1.6 + 2.1 + 2.2 + 4.1** — capture UI, annotation, stamping, and the GPS photo
   map. The map is cheap here because the capture UI is already asking for a
   geolocation fix; bolting it on later means touching the same code twice.
5. **5.1 + 5.2 + 5.3** — the MCP server (read-only), with "Ask the project" built
   on top of it and citations throughout. Small build, unique position at this
   market tier, and it's the thing with a clock on it.
6. **4.2 + 4.3** — plan pins and the per-location timeline. The biggest gap the
   second sweep found, and it makes 2.3, 2.4 and 3.2 materially better.
7. **3.1 + 5.4** — voice → variation, plus per-org Skills so it applies *their*
   rules for what counts as one.
8. **4.4** — snags on the plan (with 3.3's AI walkthrough behind it).
9. **6.1 + 6.2 + 6.3** — asset register, PPM, SLA clocks. Big, but it's what makes
   this a maintenance platform rather than a construction diary.
10. **1.5**, re-pitched. Handoff and CompanyCam both do photo/voice → estimate
    already, so don't compete on takeoff accuracy — win on the accepted quote
    *graduating into a project* with contract sum, programme, variations and
    valuation already wired up. Sell the graduation, not the takeoff.
11. Then pick from Tier 2/3 by what the live client asks for.

---

## 6. Two housekeeping notes

- `src/lib/ai.ts` pins `claude-opus-4-8`. Current default is **`claude-opus-5`**
  (same $5/$25 pricing, adaptive thinking on by default).
- `src/lib/approvals.ts` is sitting in the working tree with an **unresolved merge
  conflict** (`UU`) from the master merge. Worth resolving before building on it.
