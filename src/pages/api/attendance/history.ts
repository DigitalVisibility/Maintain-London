import type { APIRoute } from 'astro';
import { queryOne } from '../../../lib/db';
import { hasCap } from '../../../lib/capabilities';
import { expectedForProject, actualForProject, buildBoard, referenceMinutes } from '../../../lib/attendance';
import type { AttendanceStatus } from '../../../types/diary';

export const prerender = false;

/** List of 'YYYY-MM-DD' from → to inclusive (UTC), capped. */
function dateRange(from: string, to: string, cap = 62): string[] {
  const out: string[] = [];
  let d = new Date(from + 'T00:00:00Z');
  const end = new Date(to + 'T00:00:00Z');
  while (d <= end && out.length < cap) {
    out.push(d.toISOString().slice(0, 10));
    d = new Date(d.getTime() + 86400000);
  }
  return out;
}

/**
 * GET /api/attendance/history?project_id=&from=&to=
 * A person × day attendance grid for a site over a date range (default the last
 * 7 days). Managers/owners only.
 */
export const GET: APIRoute = async ({ locals, url }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  if (!hasCap(locals, 'manage_projects') || !locals.org) return new Response('Forbidden', { status: 403 });
  const orgId = locals.org.id;

  const projectId = url.searchParams.get('project_id');
  if (!projectId) return Response.json({ error: 'project_id is required' }, { status: 400 });

  const today = new Date().toISOString().slice(0, 10);
  const to = url.searchParams.get('to') || today;
  const from = url.searchParams.get('from') || new Date(new Date(to + 'T00:00:00Z').getTime() - 6 * 86400000).toISOString().slice(0, 10);
  const dates = dateRange(from, to);

  const now = new Date();
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  const site = await queryOne<{ lat: number | null; lng: number | null }>(
    env.DB, 'SELECT lat, lng FROM projects WHERE id = ?', [projectId]
  );

  // person key → { name, byDate: {date: status} }
  const people = new Map<string, { person_id: string | null; name: string; byDate: Record<string, AttendanceStatus> }>();

  for (const date of dates) {
    const expected = await expectedForProject(env.DB, orgId, projectId, date);
    const { clock, register } = await actualForProject(env.DB, projectId, date);
    const rows = buildBoard(expected, clock, register, referenceMinutes(date, today, nowMin), 10, site);
    for (const r of rows) {
      const key = r.person_id || `name:${r.name}`;
      if (!people.has(key)) people.set(key, { person_id: r.person_id, name: r.name, byDate: {} });
      people.get(key)!.byDate[date] = r.status;
    }
  }

  return Response.json({
    project_id: projectId,
    dates,
    people: [...people.values()].sort((a, b) => a.name.localeCompare(b.name)),
  });
};
