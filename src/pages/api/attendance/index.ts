import type { APIRoute } from 'astro';
import { queryAll } from '../../../lib/db';
import { hasCap } from '../../../lib/capabilities';
import { expectedForProject, actualForProject, buildBoard, referenceMinutes } from '../../../lib/attendance';
import type { AttendanceRow } from '../../../types/diary';

export const prerender = false;

interface Summary {
  expected: number;
  present: number;
  on_time: number;
  late: number;
  absent: number;
  extra: number;
}

/** Roll a board's rows up into per-project counts. */
function summarise(rows: AttendanceRow[]): Summary {
  return {
    expected: rows.filter((r) => r.status !== 'extra').length,
    present: rows.filter((r) => r.present).length,
    on_time: rows.filter((r) => r.status === 'on_time').length,
    late: rows.filter((r) => r.status === 'late').length,
    absent: rows.filter((r) => r.status === 'absent').length,
    extra: rows.filter((r) => r.status === 'extra').length,
  };
}

/**
 * GET /api/attendance — plan vs actual for the day.
 *   ?project_id=…  → the full board for one site.
 *   (no project)   → a one-line summary for every active project, plus totals.
 * ?date=YYYY-MM-DD overrides today. Managers/owners only.
 */
export const GET: APIRoute = async ({ locals, url }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  if (!hasCap(locals, 'manage_projects') || !locals.org) return new Response('Forbidden', { status: 403 });
  const orgId = locals.org.id;

  const today = new Date().toISOString().slice(0, 10);
  const date = url.searchParams.get('date') || today;

  const d = new Date();
  const nowMin = d.getUTCHours() * 60 + d.getUTCMinutes();
  const refMin = referenceMinutes(date, today, nowMin);

  const projectId = url.searchParams.get('project_id');

  if (projectId) {
    const expected = await expectedForProject(env.DB, orgId, projectId, date);
    const { clock, register } = await actualForProject(env.DB, projectId, date);
    const rows = buildBoard(expected, clock, register, refMin);
    return Response.json({ date, project_id: projectId, rows, summary: summarise(rows) });
  }

  const projects = await queryAll<{ id: string; name: string }>(
    env.DB,
    "SELECT id, name FROM projects WHERE org_id = ? AND status = 'active' ORDER BY name",
    [orgId]
  );

  const out: (Summary & { project_id: string; project_name: string })[] = [];
  for (const p of projects) {
    const expected = await expectedForProject(env.DB, orgId, p.id, date);
    const { clock, register } = await actualForProject(env.DB, p.id, date);
    const rows = buildBoard(expected, clock, register, refMin);
    const s = summarise(rows);
    out.push({ project_id: p.id, project_name: p.name, ...s });
  }

  const totals = {
    present: out.reduce((n, o) => n + o.present, 0),
    expected: out.reduce((n, o) => n + o.expected, 0),
    late: out.reduce((n, o) => n + o.late, 0),
    absent: out.reduce((n, o) => n + o.absent, 0),
  };

  return Response.json({ date, projects: out, totals });
};
