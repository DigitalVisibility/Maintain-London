# Schedule of Works — Tom's field testing (Maintain London)

Source: Tom's emails while testing the app on live Maintain London jobs. This is
a living checklist; Tom will keep sending short notes as things come up.

Effort key: **S** ≈ half-day · **M** ≈ 1–2 days · **L** ≈ 3+ days.

---

## The attendance model (agreed)

Three layers, so "timesheets vs clocking" stops being confusing:

1. **The plan (rota / expected hours).** Every person has a **default working
   pattern** (days + start/end, e.g. 9–5 Mon–Fri), which can be **overridden
   per site/week** when they're assigned to a job.
2. **The actual attendance.** Two sources, both count and both feed the
   timesheet: **clock in/out** for people with the app, and the **manager's
   register** for anyone without it (agency, subbies).
3. **The live board.** Plan vs actual, at a glance — per site and an owner
   overview — flagging on-time / late / no-show / left early.

Result: clocking = actuals = timesheet (what you pay); the schedule = the
yardstick that drives the flags; the manager only manually logs people who
can't clock themselves, and those hours still reach the timesheet.

---

## Tier 1 — Fixes & safety (first) ✅ DONE (commit 68e675f)

- [x] **1. Delete a diary entry (staff).** "Delete entry" button in the save bar
  for owner/admin/manager; a `deleted` guard stops autosave re-creating it.
  *(Tom 12)*
- [x] **2. Lock the diary form down for operatives.** Operatives can't edit the
  header (time/site-manager), add/edit personnel, or see the client-visibility
  section — enforced in the UI **and** server-side (closed the gap where
  `release_to_client` was never checked). *(Tom 8, 9)*
- [x] **3. Multi-photo upload.** Verified already working — the gallery picker
  takes multiple files at once (camera is one-at-a-time by nature). No fix
  needed. *(Tom 13)*

## Tier 2 — Attendance engine ✅ DONE (LIVE on both — commit ed4a891)

- [x] **4. People roster** — per-business, auto-seeded from app users, each with
  a default working pattern (Team → Workforce). *(Tom 1, 2)*
- [x] **5. Per-site rota** — assign people to a project (Rota section on the
  project page), with per-job day/hour overrides. *(agreed model)*
- [x] **6. Diary personnel picker** — type-ahead from the roster, free-type temp/
  agency, per-operative note. *(Tom 2, 3)* — shipped in 2a.
- [x] **7. Actuals = clock-in + manager register**, both feeding the timesheet.
  *(Tom 1, 4, 11)*
- [x] **8. Live attendance board + flags** (on-time / late / no-show / left-early
  / present / extra): per-site on the project page, org overview on the
  dashboard. *(Tom 5, 6)*
- [x] **9. Timesheet from actuals** — clock sessions + manager-logged diary hours,
  with no double-counting for anyone who clocked. *(Tom 4)*
- [x] **10. Dashboard attendance** — "On site today" overview (overall + per-site
  present/expected/late/absent). *(Tom 7)*

## Tier 3 — Navigation & photos

- [ ] **11. Clickable dashboard stats** — click "39 photos" / entries to drill
  in, instead of opening each job. *(Tom 15)* — **M**
- [ ] **12. Project-level photo gallery** aggregating all diary photos for a job.
  *(Tom 14)* — **M**

## Tier 4 — Clocking reminders & offline (heaviest)

- [ ] **13. Offline clock in/out** — extend the offline queue (only diary
  entries + photos sync offline today; clocking posts straight to the server).
  *(Tom 11)* — **L**
- [ ] **14. Clock reminders** — "don't forget to clock in/out". Push vs email
  TBD. *(Tom 10)* — **L**

---

## Notes / findings from the code check
- The delete "can't delete today's entry" is autosave re-creating the draft, not
  a real guard — see `DiaryForm.tsx` autosave + `UNIQUE(project_id, date)`.
- `release_to_client` is defined but **never enforced** — operatives can vet and
  release to the client today. (Tier 1 item 2 closes this.)
- `GET /api/time?project_id=` already returns sessions but has no UI — a cheap
  foothold for the live board (item 8).
- Diary labour lives in `entry_personnel(name, hours, …)` (free-text, no link to
  users) and is never aggregated anywhere (item 9).
