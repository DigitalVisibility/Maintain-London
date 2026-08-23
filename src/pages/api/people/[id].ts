import type { APIRoute } from 'astro';
import { queryOne, execute } from '../../../lib/db';
import { hasCap } from '../../../lib/capabilities';
import type { Person } from '../../../types/diary';

export const prerender = false;

const FIELDS = ['name', 'role', 'company', 'phone', 'default_days', 'default_start', 'default_end'] as const;

/** PATCH /api/people/:id — edit a roster person (managers/owners). */
export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const { env } = locals.runtime;
  if (!locals.user || !locals.org) return new Response('Unauthorized', { status: 401 });
  if (!hasCap(locals, 'manage_projects')) return new Response('Forbidden', { status: 403 });

  const person = await queryOne<Person>(env.DB, 'SELECT * FROM people WHERE id = ?', [params.id]);
  if (!person || person.org_id !== locals.org.id) return new Response('Not found', { status: 404 });

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
  await execute(env.DB, `UPDATE people SET ${sets.join(', ')} WHERE id = ?`, values);
  return Response.json({ success: true });
};

/** DELETE /api/people/:id — remove from the roster (soft — keeps history). */
export const DELETE: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  if (!locals.user || !locals.org) return new Response('Unauthorized', { status: 401 });
  if (!hasCap(locals, 'manage_projects')) return new Response('Forbidden', { status: 403 });

  const person = await queryOne<Person>(env.DB, 'SELECT * FROM people WHERE id = ?', [params.id]);
  if (!person || person.org_id !== locals.org.id) return new Response('Not found', { status: 404 });

  await execute(env.DB, 'UPDATE people SET active = 0 WHERE id = ?', [params.id]);
  return Response.json({ success: true });
};
