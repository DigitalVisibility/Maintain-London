import type { APIRoute } from 'astro';
import { queryOne, execute } from '../../../lib/db';
import { hasCap } from '../../../lib/capabilities';

export const prerender = false;

const FIELDS = ['days', 'start_time', 'end_time'] as const;

/** PATCH /api/rota/:id — edit a person's days/times on a project (managers/owners). */
export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const { env } = locals.runtime;
  if (!locals.user || !locals.org) return new Response('Unauthorized', { status: 401 });
  if (!hasCap(locals, 'manage_projects')) return new Response('Forbidden', { status: 403 });

  const row = await queryOne<{ org_id: string }>(env.DB, 'SELECT * FROM project_rota WHERE id = ?', [params.id]);
  if (!row || row.org_id !== locals.org.id) return new Response('Not found', { status: 404 });

  const body = await request.json().catch(() => ({})) as Record<string, unknown>;
  const sets: string[] = [];
  const values: unknown[] = [];
  for (const f of FIELDS) {
    if (body[f] !== undefined) {
      sets.push(`${f} = ?`);
      const v = body[f];
      values.push(typeof v === 'string' ? (v.trim() || null) : v);
    }
  }
  if (sets.length === 0) return Response.json({ error: 'Nothing to update' }, { status: 400 });
  values.push(params.id);
  await execute(env.DB, `UPDATE project_rota SET ${sets.join(', ')} WHERE id = ?`, values);
  return Response.json({ success: true });
};

/** DELETE /api/rota/:id — remove a person from a project's rota (managers/owners). */
export const DELETE: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  if (!locals.user || !locals.org) return new Response('Unauthorized', { status: 401 });
  if (!hasCap(locals, 'manage_projects')) return new Response('Forbidden', { status: 403 });

  const row = await queryOne<{ org_id: string }>(env.DB, 'SELECT * FROM project_rota WHERE id = ?', [params.id]);
  if (!row || row.org_id !== locals.org.id) return new Response('Not found', { status: 404 });

  await execute(env.DB, 'DELETE FROM project_rota WHERE id = ?', [params.id]);
  return Response.json({ success: true });
};
