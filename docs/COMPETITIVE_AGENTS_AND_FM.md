# Competitor sweep #3 — what shipped in 2026, and the UK maintenance tier

> Researched 24 August 2026. Third in the series, after
> [COMPETITIVE_COMPANYCAM.md](COMPETITIVE_COMPANYCAM.md) (sweep 1) and
> [COMPETITIVE_FIELD_APPS.md](COMPETITIVE_FIELD_APPS.md) (sweep 2).
>
> Deliberately biased toward **recency over coverage** — the question was
> "is someone shipping something we should be early on", not "list the market
> again". Window is roughly June–August 2026.

---

## 0. The headline

Two things changed in this industry in the last eight weeks, and both are
directly actionable for us.

**1. The category moved from "AI writes a document" to "agents that act."**
Procore shipped 20 pre-built agents on 23 July and previewed *Skills* — teach the
AI your own standards in plain language. Every AI feature in our Tier 1 plan is
still a *generator*: input → draft → human sends. That was the frontier in
sweep 1. It is now the floor.

**2. MCP became the AEC interoperability layer, in public, this quarter.**
Revizto shipped an MCP server on 28 July so ChatGPT, Claude and Copilot can query
live project data. Autodesk shipped official MCP for Fusion plus a cloud data
server. Procore has one. AMC Bridge built a cross-platform MCP connector as a
proof of concept.

**This is the "be early" item, and it is ours to take.** Every one of those is an
enterprise platform serving main contractors. Nobody at the trades/SME tier has
an MCP server. We are already on Anthropic's stack, and our whole stated moat is
that we hold *structured rows* rather than documents — which is exactly what an
agent can query and a PDF cannot. See §4.A.

**And a validation:** Procore bought DroneDeploy for **$845M cash on 29 July**,
explicitly to let AI "see the site, understand what changed, and trigger action."
That is sweep 2's spatial thesis, confirmed at the highest possible price.

---

## 1. What actually shipped (June–August 2026)

| Date | Who | What | Why it matters to us |
|---|---|---|---|
| 23 Jul | **Procore** | Digital Coworker packages; agent library to ~20 (Submittal Review, RFI, Contract Review, Deep Search, **Daily Log**); **Skills** — encode your own SOPs in plain language | Agents, not generators. Haskell reported submittal review going from 7 days to ~10 minutes |
| 28 Jul | **Revizto** | **MCP server** + properties API + developer portal — connect Claude/ChatGPT/Copilot to live project data, no custom integration | The interop pattern. "Which fire doors are missing certification?" answered from live data |
| 29 Jul | **Procore** | **Acquires DroneDeploy, $845M cash** (funded by an upsized $825M convertible on 4 Aug) | 400M photos + 126M drawings + 20 trillion sq ft of visual data. Spatial is now strategic, not a feature |
| 21 Jul | **Handoff** | **H1** autonomous residential blueprint takeoff — full sets in ~2 hours, 81.6% on their own benchmark vs ~55% for general models | Direct threat to our 1.5. See §3 |
| Jul | **Trimble** | Accubid Anywhere: AI takeoff for MEP — auto-scale, symbol recognition, conduit auto-routing. Claims 60% time saving | Takeoff is commoditising fast |
| 4 Aug | **Provision** | Scope Agent — scope-of-work extraction from drawings/specs, 97% claimed accuracy | Scope extraction as a product category |
| Jul | **Alloovium** (YC S26) | Compliance layer that reads project docs and returns **cited** answers; live on ~$400M of Australian projects | *Citations* is the right pattern for our 3.7 |
| Jul | **Sledge** | AI-native construction OS, bid→build→paid, private beta, ~$20M project volume under management | See §2 — our real competitive set |
| 5 Aug | **conmeet** | €6M seed, AI-centric OS for **trades firms of 10–500 people**, DACH | Same. Same size customer as us |
| 2026 | **CompanyCam** | Acquired **Beam Finance**; added AI estimating, payments, invoicing, document signing. Dropped the 3-user minimum on Core | They are walking into *our* territory — money — while we walk into theirs |
| 2026 | **Fixflo × BigChange** | Integration pushing live repair status from the contractor's job system into the managing agent's portal | A distribution channel. See §4.C |
| Jan 2026 | **Elyos AI** (London, YC) | €11.1M / $13M raised. Autonomous agents answering inbound calls, booking and rescheduling jobs, qualifying leads, dispatching engineers. Plus a **Field Engineer Agent** — job details, status updates, site notes, hands-free | Front-office automation, a category we don't touch at all |

Also noted, not actionable: TerraFirma $100M Series A (remote-operated plant),
Monumental $32M Series B (bricklaying robots, 150+ deployed), Nemetschek closed
the HCSS acquisition, Higharc $95M Series C (plans → 3D → material takeoff).

---

## 2. The competitive set we didn't know we had

Sweeps 1 and 2 measured us against **photo apps** and **spatial apps**. That was
the wrong frame. The products actually built like us are the new **AI-native
operating systems**:

- **Sledge** — "runs the field, the office, and the whole company." Invoices,
  emails, bank activity, jobsite photos, contracts, change orders, lien waivers,
  schedules and payments all flow in; it organises the work, drafts the next
  step, sends the follow-up. Founded by someone still running a $100M concrete
  contractor. QuickBooks/Outlook/Gmail/Stripe.
- **conmeet** — explicitly targeting **trades firms with 10–500 employees**.
  That is precisely our customer, in a different country, with €6M behind it.

Both are betting the same bet we are: that the winner is the system holding
*everything*, with AI on top — not the best camera. That's reassuring about the
strategy and alarming about the clock. Neither is in the UK yet.

**What separates us from them right now:** they're US/DACH and have no CIS, no
VAT reverse charge, no JCT vocabulary, no Building Safety Act. Our UK-specific
plumbing (Tier 3.10, 3.4, 3.5) is not a nice-to-have — it's the moat that buys
time against better-funded companies building the same shape of product.

---

## 3. What this changes about the existing plan

**1.5 (walkthrough → quote pack) has been overtaken.** Handoff already generates
an estimate from a photo, a drawing, a walkthrough video **or a voice note**,
with contractor pricing rules baked in, and shipped an autonomous blueprint
takeoff model in July. CompanyCam bought Beam and now does AI estimating too.
This is no longer a differentiator — it's catch-up, and the bar is high.

*Recommendation:* keep it, drop it down the order, and narrow the claim. Don't
try to beat Handoff at estimating accuracy. Win on the thing they can't do: the
accepted quote **becomes the project**, with the contract sum, the programme, the
variations register and the valuation already wired up. Sell the graduation, not
the takeoff.

**3.7 (Ask the project) got much more important and should be built with
citations.** Alloovium's whole product is cited answers over project documents.
Cited-by-default is table stakes now, not polish — and it's the natural front end
for the MCP work in §4.A.

**Tier 4 (spatial) is confirmed.** An $845M acquisition is about as strong a
signal as this industry produces.

**Tier 1 needs an agent layer above it.** Our voice→diary→variation→valuation
chain is well designed but entirely human-triggered. Procore's Skills is the
tell: the differentiator is shifting from *what the AI can draft* to *what the
firm can teach it about how they work*.

---

## 4. What to take

### A. An MCP server over the project record — **the "be early" item**

**Do this one.** It's the highest ratio of strategic value to build cost on any
of the three sweeps.

Expose the project record — diary days, photos and captions, variations,
valuations, programme, timesheets, documents, compliance records — as MCP tools
with proper per-tenant, per-role auth. Then:

- A PM or client points **their own Claude** at the project and asks anything.
- Our own "Ask the project" (3.7) becomes a client of the same server rather than
  a bespoke feature — build once, use twice.
- Our agents (§4.B) call the same tools, so there's one authorisation surface and
  one audit trail rather than three.

Why we're unusually well placed:

- We're already on `@anthropic-ai/sdk` and Cloudflare Workers — MCP is Anthropic's
  own protocol and Workers is a first-class place to host a remote MCP server.
- **Our data is already rows, not documents.** Every sweep-1 note about the moat
  ("CompanyCam's AI produces a document, ours produces rows") cashes out here:
  rows are queryable by an agent, PDFs are not. This is the feature that finally
  *monetises* the structured-data decision.
- Multi-tenant orgs with per-role capabilities already exist in
  `src/lib/capabilities.ts` — the hard part of scoping an MCP server is
  authorisation, and ours is built.

Risk to respect: an MCP server is a data-exfiltration surface. Read-only first,
per-tenant tokens, capability-scoped tools, everything logged. Write tools only
after that's proven.

### B. Agents, not just generators — with Skills

Procore's split is worth copying at our scale. Not 20 agents; three or four that
run on a trigger rather than a button:

- **Day-close agent** — evening: nothing filed for an active site? Chase the site
  manager, draft from whatever photos and clock-ins exist, wait for confirmation.
- **Variation watcher** — reads the day's diary and flags "that sounds like a
  variation, shall I raise it?" instead of waiting to be asked (3.1 in reverse).
- **Valuation assembler** — monthly: assemble the interim application, with the
  photo evidence attached (4.x + 3.2).
- **Compliance chaser** — scaffold handover due, RAMS unsigned, certificate
  expiring, no toolbox talk this week.

And the **Skills** idea: let a business write, in plain English, how *they* want
a diary day written, what counts as a variation, what their sign-off rules are —
then apply it on every project. Cheap to build (it's a per-org prompt fragment in
the DB), and it's the sort of thing that makes a system hard to leave.

### C. Asset register with QR tags — the missing spine for *maintenance*

The UK FM tier (Joblogic, FaultFixers, Plentific) is built around something we
don't have at all: **the asset**. Joblogic does PPM schedules "to asset level"
with asset registers and **QR code tagging**; FaultFixers sells QR asset scanning
as a headline feature. Scan the tag on the boiler, the AHU, the lift, the fire
door → its full history, its certificates, its next service, raise a job against
it.

We are a *maintenance* contractor's app with no asset object. Everything hangs off
project → diary day. For planned and reactive maintenance across a property
portfolio, the durable object is the asset, not the project.

This is also the piece that makes sweep 2's plan pins pay off twice: a pin on a
plan and a QR tag on the plant are two routes to the same record.

Sized honestly, this is the biggest new object on any of the three lists — a real
schema addition (assets, asset↔project, service history, certificate expiry) —
but it's the difference between a construction diary and a maintenance platform.

### D. Managing-agent integration as distribution

The Fixflo × BigChange integration is the interesting move: managing agents live
in Fixflo, and the contractor's job system pushes live repair status into it so
agents stop ringing to ask. Maintain London's clients are exactly those agents.

Being the contractor system that feeds their portal is a **distribution channel**,
not just an integration — and it's a much cheaper route to a second customer than
selling the app cold. Worth a conversation with Tom about which portals his
clients actually use before building anything.

### E. Small borrows

- **SLA / response-time clocks** on reactive jobs (Joblogic, Plentific) — target
  response and target fix, with a countdown and a breach flag. Standard in the FM
  tier, absent from every construction photo app.
- **PPM schedules** — recurring planned works generating jobs automatically.
  Follows directly from C.
- **Cited answers by default** (Alloovium) — anywhere the AI states a fact about
  the project, link the diary day, photo or document it came from.

### F. Explicitly not taking

- **Front-office voice agents** (Elyos) — answering the phone and booking jobs is
  a real category with £10M+ behind it, but it's a different product with a
  different buyer. Integrate one day; don't build it.
- **AI takeoff / estimating accuracy** (Handoff H1, Trimble, Bobyard, Togal) —
  see §3. Compete on what happens *after* acceptance.
- **Robotics, drones, smart glasses** — smart glasses grew 167% YoY and Meta holds
  90%+, but nothing here needs a headset. Hands-free is already solved for us by
  hold-to-talk on a phone that operatives already own.
- **BIM/IFC agents** — research benchmarks (IFCMemoryBench, 32.4% accuracy;
  DrawingVQA) say this is not ready even for the people building it.

---

## 5. Golden thread — sharper requirements

Worth recording, because Tier 3.5 is aimed correctly but the detail has firmed up.
For higher-risk buildings the software must support: a digital record started
*before* work begins and continuously updated; **mobile capture of inspections,
installations and defects at the point of work** (described in the sources as the
only credible way to satisfy it in practice); a defined export and handover
process at Gateway 3; and **contractually guaranteed data portability**.

Our voice-and-photo capture loop *is* point-of-work capture. The two gaps are the
handover export and a portability guarantee — the second of which costs nothing
but a line in the contract and is a genuine differentiator against platforms that
would rather lock the data in.

---

## 6. Revised recommendation

Ranked by (strategic value) ÷ (build cost), for insertion into the plan:

1. **MCP server, read-only** (§4.A) — small build, unique position, and it makes
   3.7 fall out for free. **The one to be early on.**
2. **Cited answers everywhere** (§4.E) — small, and it's becoming an expectation.
3. **Skills / per-org AI instructions** (§4.B) — a prompt fragment in the DB and a
   settings page. Disproportionate retention value.
4. **Asset register + QR tags** (§4.C) — the largest build here, and the one that
   turns this from a construction-diary product into a maintenance platform.
5. **Scheduled agents** (§4.B) — day-close and compliance chaser first.
6. **SLA clocks + PPM schedules** (§4.E) — follow the asset register.
7. **Managing-agent portal integration** (§4.D) — talk to Tom before building.
8. **Demote 1.5** below the above, and re-pitch it as quote→project graduation.

Added to the plan as **Tier 5 — The agent layer** and **Tier 6 — Maintenance,
not just construction**.

---

## Sources

- [Procore — Digital Coworker packages & Skills](https://www.procore.com/press/procore-introduces-digital-coworker-packages-expands-ai-agent-library-and-previews-skills-to-help-construction-teams-put-ai-to-work) · [Procore/DroneDeploy + monthly roundup](https://www.nomic.ai/newsletter/ai-in-the-built-world/august-2026) · [DeadFront August 2026 AI roundup](https://www.deadfront.ai/blog/august-2026-ai-construction-roundup)
- [Revizto MCP server](https://revizto.com/resources/blog/introducing-mcp-server) · [AEC Magazine on Revizto's API/MCP](https://aecmag.com/news/revizto-opens-project-data-to-external-ai-platforms-via-new-api-and-mcp-server/) · [Autodesk on making MCP enterprise-ready](https://adsknews.autodesk.com/en/views/how-autodesk-helped-make-the-model-context-protocol-enterprise-ready/)
- [Handoff — estimates from photos/voice](https://www.handoff.ai/instant-ai-estimates) · [Sledge](https://www.getsledge.com/) · [Elyos AI](https://elyos.ai/)
- [Joblogic features](https://www.joblogic.com/features/) · [FaultFixers QR asset scanning](https://www.faultfixers.com/feature/asset-qr-code-scanning) · [Plentific](https://www.plentific.com/) · [Fixflo](https://www.fixflo.com/)
- [CompanyCam 2026 tier changes / Beam acquisition](https://www.scanmanifold.com/blog-posts/companycam-bloat-2026-what-you-are-paying-for) · [Golden thread requirements for software](https://www.firesafetyevent.com/news/what-the-building-safety-act-s-golden-thread-really-requires-from-your-software)
