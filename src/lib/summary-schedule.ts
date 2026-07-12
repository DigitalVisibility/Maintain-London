/**
 * When is a client summary due?
 *
 * The cadence is configured per business and overridable per project. Two of the
 * cadences aren't calendar-based at all — `manual` (send when I say so) and
 * `milestone` (send when the work reaches a stage) — and they are first-class,
 * not the absence of a schedule. A roofer taking stage payments on "watertight"
 * rather than on dates is a normal way to run a job, not an edge case.
 *
 * Everything here works in the org's own timezone. Cron fires in UTC, and 16:00
 * in London is not 16:00 UTC for eight months of the year — get this wrong and
 * every summary in summer goes out an hour early.
 */

export type Cadence = 'manual' | 'daily' | 'weekly' | 'fortnightly' | 'monthly' | 'milestone';

export const CADENCES: Cadence[] = [
  'manual', 'daily', 'weekly', 'fortnightly', 'monthly', 'milestone',
];

export interface Schedule {
  cadence: Cadence;
  /** Weekly/fortnightly: ISO weekday, 1 = Mon … 7 = Sun. Monthly: day of month. */
  day: number;
  /** Local wall-clock "HH:MM". */
  time: string;
  /** Date the fortnightly cycle counts from (YYYY-MM-DD). */
  anchor?: string | null;
  timezone: string;
}

/** Anything carrying the schedule columns — an org, or a project's overrides. */
export interface ScheduleFields {
  summary_cadence?: string | null;
  summary_day?: number | null;
  summary_time?: string | null;
  summary_anchor?: string | null;
  timezone?: string | null;
}

/**
 * A project's effective schedule: its own overrides where set, the business
 * default otherwise. Timezone is always the business's — a project doesn't get
 * to be in a different country from the company running it.
 */
export function resolveSchedule(org: ScheduleFields, project?: ScheduleFields | null): Schedule {
  const cadence = (project?.summary_cadence ?? org.summary_cadence ?? 'weekly') as Cadence;
  return {
    cadence: CADENCES.includes(cadence) ? cadence : 'weekly',
    day: project?.summary_day ?? org.summary_day ?? 5,
    time: project?.summary_time ?? org.summary_time ?? '16:00',
    anchor: project?.summary_anchor ?? org.summary_anchor ?? null,
    timezone: org.timezone || 'Europe/London',
  };
}

/** Whether a project's row deviates from the business default at all. */
export function hasOverride(project: ScheduleFields): boolean {
  return project.summary_cadence != null || project.summary_day != null
    || project.summary_time != null || project.summary_anchor != null;
}

// ── Timezone maths ──────────────────────────────────────────────────────────

/** How far the zone is ahead of UTC at a given instant, in ms. */
function zoneOffset(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }).formatToParts(new Date(utcMs));

  const at = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  // Intl renders midnight as hour 24 in some locales; normalise.
  const asIfUTC = Date.UTC(at('year'), at('month') - 1, at('day'), at('hour') % 24, at('minute'), at('second'));
  return asIfUTC - utcMs;
}

/** A local wall-clock time in `timeZone`, as a UTC instant. */
function zonedToUtc(y: number, m: number, d: number, hh: number, mi: number, timeZone: string): number {
  const naive = Date.UTC(y, m - 1, d, hh, mi, 0);
  // The offset depends on the instant we're resolving, so resolve then refine —
  // one pass is enough except exactly on a DST boundary, two is always enough.
  let utc = naive - zoneOffset(naive, timeZone);
  utc = naive - zoneOffset(utc, timeZone);
  return utc;
}

interface LocalDate { y: number; m: number; d: number; weekday: number }

/** The local calendar date in `timeZone` at a given instant. */
function localDate(utcMs: number, timeZone: string): LocalDate {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone, hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit', weekday: 'short',
  }).formatToParts(new Date(utcMs));

  const at = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const WEEKDAYS: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

  return {
    y: Number(at('year')),
    m: Number(at('month')),
    d: Number(at('day')),
    weekday: WEEKDAYS[at('weekday')] ?? 1,
  };
}

function parseTime(time: string): { hh: number; mi: number } {
  const [h, m] = (time || '16:00').split(':');
  const hh = Math.min(23, Math.max(0, Number(h) || 0));
  const mi = Math.min(59, Math.max(0, Number(m) || 0));
  return { hh, mi };
}

/** Shift a local calendar date by whole days. */
function addDays(date: LocalDate, days: number): LocalDate {
  const shifted = new Date(Date.UTC(date.y, date.m - 1, date.d + days));
  return {
    y: shifted.getUTCFullYear(),
    m: shifted.getUTCMonth() + 1,
    d: shifted.getUTCDate(),
    weekday: ((shifted.getUTCDay() + 6) % 7) + 1, // JS Sun=0 → ISO Mon=1
  };
}

/** Whole days between two local dates. */
function daysBetween(from: LocalDate, to: LocalDate): number {
  const a = Date.UTC(from.y, from.m - 1, from.d);
  const b = Date.UTC(to.y, to.m - 1, to.d);
  return Math.round((b - a) / 86_400_000);
}

/** YYYY-MM-DD for a local date. */
export function toISODate(date: LocalDate): string {
  return `${date.y}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`;
}

// ── When did this schedule last come due? ───────────────────────────────────

export interface Occurrence {
  /** The instant it fell due. */
  at: number;
  /** The local date it covers up to (YYYY-MM-DD). */
  date: string;
}

/**
 * The most recent occurrence at or before `now`, or null for cadences that
 * aren't calendar-driven (`manual`, `milestone`) — those are pulled, not pushed.
 *
 * The cron sweep compares this against the project's `summary_last_fired_at`, so
 * a summary fires exactly once per occurrence no matter how often the sweep runs
 * or how long the worker was down.
 */
export function lastOccurrence(schedule: Schedule, nowMs: number): Occurrence | null {
  const { cadence, timezone } = schedule;
  if (cadence === 'manual' || cadence === 'milestone') return null;

  const { hh, mi } = parseTime(schedule.time);
  const today = localDate(nowMs, timezone);

  /** The occurrence on a given local date, if it has already passed. */
  const on = (date: LocalDate): Occurrence | null => {
    const at = zonedToUtc(date.y, date.m, date.d, hh, mi, timezone);
    return at <= nowMs ? { at, date: toISODate(date) } : null;
  };

  if (cadence === 'daily') {
    return on(today) ?? on(addDays(today, -1));
  }

  if (cadence === 'weekly' || cadence === 'fortnightly') {
    const targetDay = Math.min(7, Math.max(1, schedule.day || 5));

    // Walk back to the most recent local date falling on the target weekday
    // whose time has passed. At most 8 steps.
    let candidate: LocalDate | null = null;
    for (let back = 0; back <= 7; back++) {
      const date = addDays(today, -back);
      if (date.weekday !== targetDay) continue;
      if (on(date)) { candidate = date; break; }
    }
    if (!candidate) return null;

    if (cadence === 'fortnightly' && schedule.anchor) {
      // Only every other week counts. If the candidate falls in an "off" week,
      // step back one more week.
      const [ay, am, ad] = schedule.anchor.split('-').map(Number);
      if (ay && am && ad) {
        const anchor: LocalDate = { y: ay, m: am, d: ad, weekday: 1 };
        const weeks = Math.floor(daysBetween(anchor, candidate) / 7);
        if (Math.abs(weeks % 2) === 1) {
          const previous = addDays(candidate, -7);
          return on(previous);
        }
      }
    }

    return on(candidate);
  }

  if (cadence === 'monthly') {
    const dom = Math.min(28, Math.max(1, schedule.day || 1)); // 28 keeps every month valid
    const thisMonth: LocalDate = { ...today, d: dom };
    const due = on(thisMonth);
    if (due) return due;

    const prev = new Date(Date.UTC(today.y, today.m - 2, dom));
    return on({
      y: prev.getUTCFullYear(),
      m: prev.getUTCMonth() + 1,
      d: prev.getUTCDate(),
      weekday: 1,
    });
  }

  return null;
}

/** Today's date in the org's timezone (YYYY-MM-DD) — the period end for a manual send. */
export function todayIn(timeZone: string, nowMs: number): string {
  return toISODate(localDate(nowMs, timeZone));
}

/** The day after a date (YYYY-MM-DD) — a period starts where the last one ended. */
export function dayAfter(isoDate: string): string {
  const [y, m, d] = isoDate.split('-').map(Number);
  return toISODate(addDays({ y, m, d, weekday: 1 }, 1));
}

/** Human label for a cadence, for the settings UI. */
export function describeSchedule(schedule: Schedule): string {
  const DAYS = ['', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  switch (schedule.cadence) {
    case 'manual':      return 'No schedule — send a summary whenever you choose';
    case 'milestone':   return 'When a milestone is marked complete';
    case 'daily':       return `Every day at ${schedule.time}`;
    case 'weekly':      return `Every ${DAYS[schedule.day] ?? 'Friday'} at ${schedule.time}`;
    case 'fortnightly': return `Every other ${DAYS[schedule.day] ?? 'Friday'} at ${schedule.time}`;
    case 'monthly':     return `On day ${schedule.day} of the month at ${schedule.time}`;
  }
}
