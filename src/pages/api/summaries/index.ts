import type { APIRoute } from 'astro';
import { queryAll, queryOne } from '../../../lib/db';
import { canAccessProject } from '../../../lib/access';
import { hasCap, isStaff } from '../../../lib/capabilities';
import { createDraft, type Summary } from '../../../lib/summary';
import { resolveSchedule, todayIn } from '../../../lib/summary-schedule';
import type { Project, Organisation } from '../../../types/diary';

export const prerender = false;

/**
 * GET /api/summaries?project_id=       — one project's summaries
 * GET /api/summaries?status=draft      — everything awaiting approval, org-wide
 */
export const GET: APIRoute = async ({ locals, url }) => {
  const { env } = locals.runtime;
  if (!locals.user || !locals.org) return new Response('Unauthorized', { status: 401 });
  if (!isStaff(locals.role)) return new Response('Forbidden', { status: 403 });

  const projectId = url.searchParams.get('project_id');
  const status = url.searchParams.get('status');

  if (projectId) {
    if (!(await canAccessProject(env.DB, locals, projectId))) {
      return new Response('Forbidden', { status: 403 });
    }
    const rows = await queryAll<Summary>(
      env.DB,
      'SELECT * FROM summaries WHERE project_id = ? ORDER BY created_at DESC',
      [projectId]
    );
    return Response.json(rows);
  }

  // The approval queue: every draft across the business, newest first.
  const rows = await queryAll<Summary & { project_name: string }>(
    env.DB,
    `SELECT s.*, p.name AS project_name
       FROM summaries s JOIN projects p ON p.id = s.project_id
      WHERE s.org_id = ? ${status ? 'AND s.status = ?' : ''}
      ORDER BY s.created_at DESC`,
    status ? [locals.org.id, status] : [locals.org.id]
  );
  return Response.json(rows);
};

/**
 * POST /api/summaries  { project_id }
 * Draft a summary right now, whatever the schedule says — the escape hatch for
 * businesses that don't want a cadence at all.
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  if (!locals.user || !locals.org) return new Response('Unauthorized', { status: 401 });

  const body = await request.json().catch(() => ({})) as { project_id?: string };
  if (!body.project_id) return Response.json({ error: 'project_id required' }, { status: 400 });

  if (!hasCap(locals, 'release_to_client') || !(await canAccessProject(env.DB, locals, body.project_id))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const project = await queryOne<Project>(env.DB, 'SELECT * FROM projects WHERE id = ?', [body.project_id]);
  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

  const org = await queryOne<Organisation & Record<string, any>>(
    env.DB, 'SELECT * FROM organisations WHERE id = ?', [locals.org.id]
  );
  const schedule = resolveSchedule(org ?? {}, project as any);

  const summary = await createDraft(env, {
    project,
    periodEnd: todayIn(schedule.timezone, Date.now()),
    trigger: 'manual',
  });

  if (!summary) {
    return Response.json(
      { error: 'A draft is already waiting for approval on this project.' },
      { status: 409 }
    );
  }

  return Response.json(summary, { status: 201 });
};
