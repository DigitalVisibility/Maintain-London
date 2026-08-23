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

## Tier 1 — Fixes & safety (first)

- [ ] **1. Delete a diary entry (staff).** The DELETE API already allows
  owner/admin/manager, but there's **no button in the UI**, and the open entry
  auto-saves itself back every 30s (that's why "today's" won't delete). Add a
  delete control for staff + stop autosave re-creating a just-deleted entry.
  *(Tom 12)* — **M**
- [ ] **2. Lock the diary form down for operatives.** Today an operative can
  edit the date/time/site-manager header, add operatives, **and release content
  to the client** — the `release_to_client` capability exists but is never
  enforced. Hide/disable those controls for operatives **and** enforce it
  server-side. *(Tom 8, 9)* — **Security · M**
- [ ] **3. Multi-photo upload polish.** The gallery picker already accepts
  multiple files (that's why 39 came through); only the camera is one-at-a-time.
  Verify + tidy. *(Tom 13)* — **S**

## Tier 2 — Attendance engine (the core of Tom's feedback)

- [ ] **4. People roster** per business (seeded from team members + names
  already typed into diaries), each with a **default working pattern**.
  *(Tom 1, 2)* — **M**
- [ ] **5. Per-site rota** — assign people to a project, overriding days/hours
  where needed. *(new — agreed model)* — **M**
- [ ] **6. Diary personnel picker** — type-ahead from the roster + free-type for
  temp/agency, with a **per-operative note** field. *(Tom 2, 3)* — **M**
- [ ] **7. Actuals = clock-in + manager register.** Manager logs on-site people
  (incl. hours for non-app workers); both sources feed the timesheet.
  *(Tom 1, 4, 11)* — **M**
- [ ] **8. Live attendance board + flags** (on-time / late / no-show / left
  early): per-site view + owner all-sites overview; manager sees their site.
  *(Tom 5, 6)* — **M–L**
- [ ] **9. Timesheet from actuals** — roll clock sessions **and** manager-entered
  hours into the timesheet (diary labour is currently discarded). *(Tom 4)* — **M**
- [ ] **10. Dashboard attendance counts** — overall "operatives logged" box +
  per-project tile count. *(Tom 7)* — **M**

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
