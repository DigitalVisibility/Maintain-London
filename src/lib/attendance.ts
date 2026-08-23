/**
 * The attendance engine: plan vs actual.
 *
 *  - PLAN     — who's expected on a site today, from the rota (or a person's
 *               default working pattern), with expected start/end times.
 *  - ACTUAL   — who actually turned up: clock in/out (app users) and the
 *               manager's register (diary personnel, incl. non-app workers).
 *  - STATUS   — comparing the two: on-time, late, absent, left-early, present
 *               (manager-logged, no clock time), or extra (there but not planned).
 *
 * The same actuals feed the timesheet: clock hours for app users, manager-logged
 * hours for everyone else — never both for the same person on the same day.
 *
 * Time note: expected times and stored clock times are compared as plain
 * wall-clock HH:MM. Good enough for late/absent flags; not tz-adjusted.
 */

import { queryAll } from './db';
import type { AttendanceRow, AttendanceStatus } from '../types/diary';

/** Weekday for a 'YYYY-MM-DD' date, Mon=1 … Sun=7 (UTC, deterministic). */
export function weekdayOf(date: string): number {
  const d = new Date(date + 'T00:00:00Z').getUTCDay(); // 0=Sun … 6=Sat
  return d === 0 ? 7 : d;
}

/** '1,2,3' → [1,2,3]. Empty/absent → [] (caller decides the default). */
export function parseDays(csv?: string | null): number[] {
  if (!csv) return [];
  return csv.split(',').map((s) => parseInt(s.trim(), 10)).filter((n) => n >= 1 && n <= 7);
}

/** 'HH:MM' → minutes past midnight, or null. */
export function minutesOf(hhmm?: string | null): number | null {
  if (!hhmm) return null;
  const m = hhmm.match(/^(\d{1,2}):(\d{2})/);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

/** Minutes-of-day from a stored timestamp 'YYYY-MM-DD HH:MM:SS' (or ISO). */
function minutesOfTs(ts?: string | null): number | null {
  if (!ts) return null;
  const part = ts.includes('T') ? ts.split('T')[1] : ts.split(' ')[1];
  return minutesOf(part);
}

export interface ExpectedPerson {
  person_id: string;
  name: string;
  company: string | null;
  role: string;
  user_id: string | null;
  days: number[];
  start: string | null;
  end: string | null;
}

export interface ClockActual {
  user_id: string; user_name: string | null; clock_in: string; clock_out: string | null;
  clock_in_lat: number | null; clock_in_lng: number | null;
}

/** Straight-line distance between two lat/lng points, in metres (haversine). */
export function haversineMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * R * Math.asin(Math.sqrt(a)));
}
export interface RegisterActual { person_id: string | null; name: string; hours: number | null; note: string | null; }

/** Who is expected on a project on a given date (rota overrides person defaults). */
export async function expectedForProject(
  db: D1Database, orgId: string, projectId: string, date: string
): Promise<ExpectedPerson[]> {
  const rows = await queryAll<{
    person_id: string; name: string; company: string | null; role: string; user_id: string | null;
    days: string | null; start_time: string | null; end_time: string | null;
  }>(
    db,
    `SELECT r.person_id, p.name, p.company, p.role, p.user_id,
            COALESCE(r.days, p.default_days) AS days,
            COALESCE(r.start_time, p.default_start) AS start_time,
            COALESCE(r.end_time, p.default_end) AS end_time
       FROM project_rota r JOIN people p ON p.id = r.person_id
      WHERE r.project_id = ? AND r.org_id = ? AND p.active = 1`,
    [projectId, orgId]
  );
  const wd = weekdayOf(date);
  return rows
    .map((r) => {
      // No days configured → default to weekdays (Mon–Fri) so people aren't
      // silently dropped off the board.
      const days = parseDays(r.days);
      const effectiveDays = days.length ? days : [1, 2, 3, 4, 5];
      return {
        person_id: r.person_id, name: r.name, company: r.company, role: r.role, user_id: r.user_id,
        days: effectiveDays, start: r.start_time, end: r.end_time,
      };
    })
    .filter((p) => p.days.includes(wd));
}

/** Actual attendance on a project on a date: clock sessions + the manager's register. */
export async function actualForProject(
  db: D1Database, projectId: string, date: string
): Promise<{ clock: ClockActual[]; register: RegisterActual[] }> {
  const [clock, register] = await Promise.all([
    queryAll<ClockActual>(
      db,
      `SELECT t.user_id, u.name AS user_name, t.clock_in, t.clock_out, t.clock_in_lat, t.clock_in_lng
         FROM time_sessions t LEFT JOIN user u ON u.id = t.user_id
        WHERE t.project_id = ? AND date(t.clock_in) = date(?)`,
      [projectId, date]
    ),
    queryAll<RegisterActual>(
      db,
      `SELECT ep.person_id, ep.name, ep.hours, ep.note
         FROM entry_personnel ep JOIN diary_entries de ON de.id = ep.entry_id
        WHERE de.project_id = ? AND de.date = ? AND ep.role = 'operative'`,
      [projectId, date]
    ),
  ]);
  return { clock, register };
}

function statusFor(
  present: boolean, clockedIn: string | null, clockedOut: string | null,
  expStart: number | null, expEnd: number | null, refMin: number, grace: number
): AttendanceStatus {
  if (!present) {
    if (refMin < 0) return 'upcoming';
    if (expStart !== null && refMin >= expStart) return 'absent';
    return 'upcoming';
  }
  if (clockedIn) {
    const ci = minutesOfTs(clockedIn);
    if (expStart !== null && ci !== null && ci > expStart + grace) return 'late';
    if (clockedOut && expEnd !== null) {
      const co = minutesOfTs(clockedOut);
      if (co !== null && co < expEnd - grace) return 'left_early';
    }
    return 'on_time';
  }
  return 'present';
}

/**
 * Build the board for one site+date. `refMin` is "now" in minutes-of-day for a
 * live day; pass a large number for a past date (everything has elapsed) or a
 * negative for a future date (nothing's due yet).
 */
export function buildBoard(
  expected: ExpectedPerson[], clock: ClockActual[], register: RegisterActual[],
  refMin: number, grace = 10, site?: { lat: number | null; lng: number | null } | null, offsiteThreshold = 300
): AttendanceRow[] {
  // How far the clock-in was from the site (metres), and whether that's "off-site".
  const geo = (lat: number | null, lng: number | null): { offsite: boolean; distance_m: number | null } => {
    if (site?.lat == null || site?.lng == null || lat == null || lng == null) return { offsite: false, distance_m: null };
    const d = haversineMeters(lat, lng, site.lat, site.lng);
    return { offsite: d > offsiteThreshold, distance_m: d };
  };

  // Collapse a person's clock sessions into earliest-in / latest-out.
  const clockByUser = new Map<string, { clock_in: string; clock_out: string | null; name: string | null; lat: number | null; lng: number | null }>();
  for (const c of clock) {
    const prev = clockByUser.get(c.user_id);
    if (!prev) clockByUser.set(c.user_id, { clock_in: c.clock_in, clock_out: c.clock_out, name: c.user_name, lat: c.clock_in_lat, lng: c.clock_in_lng });
    else {
      if (c.clock_in < prev.clock_in) { prev.clock_in = c.clock_in; prev.lat = c.clock_in_lat; prev.lng = c.clock_in_lng; }
      if (c.clock_out && (!prev.clock_out || c.clock_out > prev.clock_out)) prev.clock_out = c.clock_out;
    }
  }
  const registerByPerson = new Map<string, RegisterActual>();
  for (const r of register) if (r.person_id) registerByPerson.set(r.person_id, r);

  const usedUsers = new Set<string>();
  const usedPersons = new Set<string>();
  const rows: AttendanceRow[] = [];

  for (const e of expected) {
    const c = e.user_id ? clockByUser.get(e.user_id) : undefined;
    if (c && e.user_id) usedUsers.add(e.user_id);
    const r = registerByPerson.get(e.person_id);
    if (r) usedPersons.add(e.person_id);
    const present = !!c || !!r;
    const expStart = minutesOf(e.start);
    const expEnd = minutesOf(e.end);
    const g = c ? geo(c.lat, c.lng) : { offsite: false, distance_m: null };
    rows.push({
      person_id: e.person_id, name: e.name, company: e.company,
      expected_start: e.start, expected_end: e.end,
      clocked_in: c?.clock_in ?? null, clocked_out: c?.clock_out ?? null,
      present, source: c ? 'clock' : r ? 'register' : null,
      hours: r?.hours ?? null, note: r?.note ?? null,
      status: statusFor(present, c?.clock_in ?? null, c?.clock_out ?? null, expStart, expEnd, refMin, grace),
      offsite: g.offsite, distance_m: g.distance_m,
    });
  }

  // Present but not planned for today → "extra".
  for (const [userId, c] of clockByUser) {
    if (usedUsers.has(userId)) continue;
    const g = geo(c.lat, c.lng);
    rows.push({
      person_id: null, name: c.name || 'Unknown', company: null,
      expected_start: null, expected_end: null,
      clocked_in: c.clock_in, clocked_out: c.clock_out, present: true,
      source: 'clock', hours: null, note: null, status: 'extra',
      offsite: g.offsite, distance_m: g.distance_m,
    });
  }
  for (const r of register) {
    if (r.person_id && usedPersons.has(r.person_id)) continue;
    if (r.person_id && expected.some((e) => e.person_id === r.person_id)) continue;
    rows.push({
      person_id: r.person_id, name: r.name, company: null,
      expected_start: null, expected_end: null,
      clocked_in: null, clocked_out: null, present: true,
      source: 'register', hours: r.hours, note: r.note, status: 'extra',
    });
  }

  return rows;
}

/** "Now" in minutes-of-day for the board, given the date being viewed vs today (UTC). */
export function referenceMinutes(date: string, todayUtc: string, nowMinutesUtc: number): number {
  if (date < todayUtc) return 100000; // fully elapsed
  if (date > todayUtc) return -1;     // not due yet
  return nowMinutesUtc;
}

export interface LabourRow {
  project_id: string; project_name: string; date: string;
  name: string; person_id: string | null; hours: number; note: string | null;
}

/**
 * Manager-logged labour (diary personnel hours) for the timesheet — EXCLUDING
 * any person/day already covered by a clock session, so app users who clock in
 * are never counted twice.
 */
export async function labourForPeriod(
  db: D1Database, orgId: string, from?: string | null, to?: string | null, projectId?: string | null
): Promise<LabourRow[]> {
  let sql = `SELECT ep.person_id, ep.name, ep.hours, ep.note, de.date, de.project_id,
                    pr.name AS project_name, pl.user_id AS person_user_id
               FROM entry_personnel ep
               JOIN diary_entries de ON de.id = ep.entry_id
               JOIN projects pr ON pr.id = de.project_id
               LEFT JOIN people pl ON pl.id = ep.person_id
              WHERE pr.org_id = ? AND ep.role = 'operative' AND ep.hours IS NOT NULL AND ep.hours > 0`;
  const params: unknown[] = [orgId];
  if (from) { sql += ' AND de.date >= date(?)'; params.push(from); }
  if (to) { sql += ' AND de.date <= date(?)'; params.push(to); }
  if (projectId) { sql += ' AND de.project_id = ?'; params.push(projectId); }

  const rows = await queryAll<LabourRow & { person_user_id: string | null }>(db, sql, params);

  // Which (user, day) pairs already have a clock session — those diary hours are
  // the same shift, so drop them to avoid double counting.
  let cSql = `SELECT user_id, date(clock_in) AS d FROM time_sessions
               WHERE org_id = ? AND status = 'completed'`;
  const cParams: unknown[] = [orgId];
  if (from) { cSql += ' AND date(clock_in) >= date(?)'; cParams.push(from); }
  if (to) { cSql += ' AND date(clock_in) <= date(?)'; cParams.push(to); }
  if (projectId) { cSql += ' AND project_id = ?'; cParams.push(projectId); }
  const clocked = await queryAll<{ user_id: string; d: string }>(db, cSql, cParams);
  const clockedSet = new Set(clocked.map((c) => `${c.user_id}|${c.d}`));

  return rows
    .filter((r) => !(r.person_user_id && clockedSet.has(`${r.person_user_id}|${r.date}`)))
    .map((r) => ({
      project_id: r.project_id, project_name: r.project_name, date: r.date,
      name: r.name, person_id: r.person_id, hours: r.hours, note: r.note,
    }));
}
