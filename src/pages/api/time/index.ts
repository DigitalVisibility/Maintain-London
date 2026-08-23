import type { APIRoute } from 'astro';
import { queryAll, queryOne, execute, generateId, now } from '../../../lib/db';
import { can, isStaff } from '../../../lib/capabilities';
import { canAccessProject } from '../../../lib/access';

export const prerender = false;

/**
 * GET /api/time?active=1        → the caller's current open session (or null)
 * GET /api/time?project_id=xxx  → sessions for a project (managers/owners)
 */
export const GET: APIRoute = async ({ locals, url }) => {
  const { env } = locals.runtime;
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  if (url.searchParams.get('active')) {
    const active = await queryOne(
      env.DB,
      `SELECT * FROM time_sessions WHERE user_id = ? AND status IN ('active','on_break') ORDER BY clock_in DESC LIMIT 1`,
      [user.id]
    );
    return Response.json(active ?? null);
  }

  const projectId = url.searchParams.get('project_id');
  if (projectId) {
    // A timesheet exposes staff names, hours and clock-in/out GPS coordinates —
    // internal, and a client has no business seeing it even for their own job.
    // Staff only, and only for a project in their org.
    if (!isStaff(locals.role)) return new Response('Forbidden', { status: 403 });
    if (!(await canAccessProject(env.DB, locals, projectId))) {
      return new Response('Forbidden', { status: 403 });
    }

    const rows = await queryAll(
      env.DB,
      'SELECT * FROM time_sessions WHERE project_id = ? AND org_id = ? ORDER BY clock_in DESC LIMIT 100',
      [projectId, locals.org?.id ?? '']
    );
    return Response.json(rows);
  }
  return Response.json([]);
};

/** POST /api/time  { project_id, lat?, lng? } — clock in */
export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });
  if (!can(locals.role, 'clock_time')) return new Response('Forbidden', { status: 403 });
  const orgId = locals.org?.id;
  if (!orgId) return Response.json({ error: 'No active organisation' }, { status: 400 });

  const body = await request.json().catch(() => ({})) as {
    project_id?: string; lat?: number; lng?: number;
    offline?: boolean; clock_in?: string; clock_out?: string; break_minutes?: number;
  };
  if (!body.project_id) return Response.json({ error: 'project_id required' }, { status: 400 });

  const project0 = await queryOne<{ id: string }>(
    env.DB, 'SELECT id FROM projects WHERE id = ? AND org_id = ?', [body.project_id, orgId]
  );
  if (!project0) return Response.json({ error: 'Project not found' }, { status: 404 });

  // A completed session recorded offline (clocked in/out with no signal) and
  // synced later. Store the real timestamps rather than "now".
  if (body.offline && body.clock_in && body.clock_out) {
    const toStamp = (s: string) => {
      // The client sends UTC 'YYYY-MM-DD HH:MM:SS' — treat the space form as UTC
      // (append Z) so the stored time is correct whatever the server timezone.
      const iso = s.includes('T') || s.endsWith('Z') ? s : s.replace(' ', 'T') + 'Z';
      const d = new Date(iso);
      return isNaN(d.getTime()) ? s : d.toISOString().slice(0, 19).replace('T', ' ');
    };
    await execute(
      env.DB,
      `INSERT INTO time_sessions (id, org_id, project_id, user_id, user_name, clock_in, clock_out, break_minutes, clock_in_lat, clock_in_lng, status, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'completed', ?)`,
      [generateId(), orgId, body.project_id, user.id, user.name ?? null,
       toStamp(body.clock_in), toStamp(body.clock_out), body.break_minutes ?? 0,
       body.lat ?? null, body.lng ?? null, now()]
    );
    return Response.json({ status: 'completed', offline: true }, { status: 201 });
  }

  // One open session at a time.
  const open = await queryOne<{ id: string }>(
    env.DB, `SELECT id FROM time_sessions WHERE user_id = ? AND status IN ('active','on_break')`, [user.id]
  );
  if (open) return Response.json({ error: 'You are already clocked in. Clock out first.' }, { status: 409 });

  const id = generateId();
  await execute(
    env.DB,
    `INSERT INTO time_sessions (id, org_id, project_id, user_id, user_name, clock_in, clock_in_lat, clock_in_lng, status, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'active', ?)`,
    [id, orgId, body.project_id, user.id, user.name ?? null, now(), body.lat ?? null, body.lng ?? null, now()]
  );
  return Response.json({ id, status: 'active' }, { status: 201 });
};
