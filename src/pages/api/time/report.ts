import type { APIRoute } from 'astro';
import { queryAll } from '../../../lib/db';
import { can } from '../../../lib/capabilities';

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

  const rows = raw.map((r) => {
    const gross = r.clock_out ? (parseTs(r.clock_out) - parseTs(r.clock_in)) / 3600000 : 0;
    const net = Math.max(0, gross - (r.break_minutes || 0) / 60);
    return {
      id: r.id,
      project_id: r.project_id,
      project_name: r.project_name,
      user_id: r.user_id,
      user_name: r.user_name,
      clock_in: r.clock_in,
      clock_out: r.clock_out,
      break_minutes: r.break_minutes,
      worked_hours: Math.round(net * 100) / 100,
      clock_in_lat: r.clock_in_lat, clock_in_lng: r.clock_in_lng,
      clock_out_lat: r.clock_out_lat, clock_out_lng: r.clock_out_lng,
    };
  });

  return Response.json({ rows });
};
