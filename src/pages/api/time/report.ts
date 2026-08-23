import type { APIRoute } from 'astro';
import { queryAll } from '../../../lib/db';
import { can } from '../../../lib/capabilities';
import { labourForPeriod } from '../../../lib/attendance';

export const prerender = false;

interface Row {
  id: string; project_id: string; project_name: string; user_id: string; user_name: string | null;
  clock_in: string; clock_out: string | null; break_minutes: number;
  clock_in_lat: number | null; clock_in_lng: number | null;
  clock_out_lat: number | null; clock_out_lng: number | null;
}

function parseTs(ts: string): number {
  return new Date(ts.replace(' ', 'T') + 'Z').getTime();
}

/**
 * GET /api/time/report?from=&to=&project_id=&user_id=
 * Completed sessions for the active org with net worked hours — for payroll
 * (per worker) and billing (per project). Returns rows with geolocation for the map.
 */
export const GET: APIRoute = async ({ locals, url }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  if (!can(locals.role, 'view_costs')) return new Response('Forbidden', { status: 403 });
  const orgId = locals.org?.id;
  if (!orgId) return Response.json({ rows: [] });

  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const projectId = url.searchParams.get('project_id');
  const userId = url.searchParams.get('user_id');

  let sql = `SELECT t.*, p.name AS project_name
               FROM time_sessions t JOIN projects p ON p.id = t.project_id
              WHERE t.org_id = ? AND t.status = 'completed'`;
  const params: unknown[] = [orgId];
  if (from) { sql += ' AND date(t.clock_in) >= date(?)'; params.push(from); }
  if (to) { sql += ' AND date(t.clock_in) <= date(?)'; params.push(to); }
  if (projectId) { sql += ' AND t.project_id = ?'; params.push(projectId); }
  if (userId) { sql += ' AND t.user_id = ?'; params.push(userId); }
  sql += ' ORDER BY t.clock_in DESC';

  const raw = await queryAll<Row>(env.DB, sql, params);

  // Hourly rates, so hours can be costed. Keyed by the person's app user and by
  // their roster id (for manager-logged labour).
  const rateRows = await queryAll<{ id: string; user_id: string | null; default_rate: number | null }>(
    env.DB, 'SELECT id, user_id, default_rate FROM people WHERE org_id = ? AND default_rate IS NOT NULL', [orgId]
  );
  const rateByUser = new Map(rateRows.filter((r) => r.user_id).map((r) => [r.user_id as string, r.default_rate as number]));
  const rateByPerson = new Map(rateRows.map((r) => [r.id, r.default_rate as number]));
  const cost = (hours: number, rate?: number) => (rate != null ? Math.round(hours * rate * 100) / 100 : null);

  const rows = raw.map((r) => {
    const gross = r.clock_out ? (parseTs(r.clock_out) - parseTs(r.clock_in)) / 3600000 : 0;
    const net = Math.max(0, gross - (r.break_minutes || 0) / 60);
    const worked = Math.round(net * 100) / 100;
    return {
      id: r.id,
      project_id: r.project_id,
      project_name: r.project_name,
      user_id: r.user_id,
      user_name: r.user_name,
      clock_in: r.clock_in,
      clock_out: r.clock_out,
      break_minutes: r.break_minutes,
      worked_hours: worked,
      cost: cost(worked, rateByUser.get(r.user_id)),
      clock_in_lat: r.clock_in_lat, clock_in_lng: r.clock_in_lng,
      clock_out_lat: r.clock_out_lat, clock_out_lng: r.clock_out_lng,
    };
  });

  const labourRaw = await labourForPeriod(env.DB, orgId, from, to, projectId);
  const labour = labourRaw.map((l) => ({ ...l, cost: cost(l.hours, l.person_id ? rateByPerson.get(l.person_id) : undefined) }));

  // CSV export for payroll/accounting.
  if (url.searchParams.get('format') === 'csv') {
    const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const lines = [['Type', 'Worker', 'Project', 'Date', 'Clock in', 'Clock out', 'Break (min)', 'Hours', 'Cost'].join(',')];
    for (const r of rows) lines.push([esc('Clock'), esc(r.user_name), esc(r.project_name), esc(r.clock_in?.slice(0, 10)), esc(r.clock_in), esc(r.clock_out), esc(r.break_minutes), esc(r.worked_hours), esc(r.cost ?? '')].join(','));
    for (const l of labour) lines.push([esc('Diary'), esc(l.name), esc(l.project_name), esc(l.date), '', '', '', esc(l.hours), esc(l.cost ?? '')].join(','));
    return new Response(lines.join('\r\n'), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="timesheet_${from || 'all'}_${to || 'all'}.csv"`,
      },
    });
  }

  return Response.json({ rows, labour });
};
