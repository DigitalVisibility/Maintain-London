import type { APIRoute } from 'astro';
import { queryOne, execute, now } from '../../../lib/db';
import { canAccessProject } from '../../../lib/access';
import { hasCap } from '../../../lib/capabilities';
import { approveAndSend, type Summary } from '../../../lib/summary';
import type { Project } from '../../../types/diary';

export const prerender = false;

/** Load a summary and check the caller may act on its project. */
async function load(env: any, locals: App.Locals, id: string) {
  const summary = await queryOne<Summary>(env.DB, 'SELECT * FROM summaries WHERE id = ?', [id]);
  if (!summary) return { error: Response.json({ error: 'Not found' }, { status: 404 }) };

  if (!(await canAccessProject(env.DB, locals, summary.project_id))) {
    return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  // Sending a summary *is* releasing to the client.
  if (!hasCap(locals, 'release_to_client')) {
    return { error: Response.json({ error: 'Insufficient permissions' }, { status: 403 }) };
  }

  const project = await queryOne<Project>(env.DB, 'SELECT * FROM projects WHERE id = ?', [summary.project_id]);
  if (!project) return { error: Response.json({ error: 'Project not found' }, { status: 404 }) };

  return { summary, project };
}

/** GET /api/summaries/:id */
export const GET: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const found = await load(env, locals, params.id!);
  if ('error' in found) return found.error;
  return Response.json(found.summary);
};

/** PATCH /api/summaries/:id  { title?, narrative? } — edit the draft before sending. */
export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const found = await load(env, locals, params.id!);
  if ('error' in found) return found.error;

  if (found.summary.status === 'sent') {
    return Response.json({ error: 'This summary has already been sent.' }, { status: 409 });
  }

  const body = await request.json().catch(() => ({})) as { title?: string; narrative?: string };

  await execute(
    env.DB,
    'UPDATE summaries SET title = ?, narrative = ? WHERE id = ?',
    [
      body.title ?? found.summary.title,
      body.narrative ?? found.summary.narrative,
      found.summary.id,
    ]
  );

  return Response.json({ status: 'updated' });
};

/** POST /api/summaries/:id — approve: email the client and archive what was sent. */
export const POST: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  const found = await load(env, locals, params.id!);
  if ('error' in found) return found.error;

  if (found.summary.status === 'sent') {
    return Response.json({ error: 'This summary has already been sent.' }, { status: 409 });
  }

  const result = await approveAndSend(env, found.summary, found.project, user);
  if (!result.ok) return Response.json({ error: result.error }, { status: 502 });

  return Response.json({ status: 'sent', recipients: result.recipients });
};

/** DELETE /api/summaries/:id — dismiss a draft without sending it. */
export const DELETE: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const found = await load(env, locals, params.id!);
  if ('error' in found) return found.error;

  if (found.summary.status === 'sent') {
    return Response.json({ error: 'This summary has already been sent.' }, { status: 409 });
  }

  // Keep the row as 'skipped' rather than deleting it: the next period should
  // still start where this one ended, and a dismissed update is worth a record.
  await execute(
    env.DB,
    `UPDATE summaries SET status = 'skipped', approved_by = ?, approved_at = ? WHERE id = ?`,
    [locals.user.id, now(), found.summary.id]
  );

  return Response.json({ status: 'skipped' });
};
