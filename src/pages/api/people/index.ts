import type { APIRoute } from 'astro';
import { queryAll, execute, generateId, now } from '../../../lib/db';
import { hasCap, isStaff } from '../../../lib/capabilities';
import type { Person } from '../../../types/diary';

export const prerender = false;

/**
 * Keep the roster in step with the business's app users. Idempotent: each app
 * user maps to one deterministic person id, so re-running never duplicates and a
 * person a manager has since removed (active = 0) stays removed.
 */
async function syncFromMembers(db: D1Database, orgId: string): Promise<void> {
  const members = await queryAll<{ user_id: string; role: string; name: string | null }>(
    db,
    `SELECT m.user_id, m.role, u.name FROM memberships m
       JOIN user u ON u.id = m.user_id
      WHERE m.org_id = ? AND m.role <> 'client'`,
    [orgId]
  ).catch(() => []);
  for (const m of members) {
    const rosterRole = m.role === 'operative' ? 'operative' : 'manager';
    await execute(
      db,
      `INSERT OR IGNORE INTO people (id, org_id, name, role, user_id, active, created_at)
       VALUES (?, ?, ?, ?, ?, 1, ?)`,
      [`seed-${orgId}-${m.user_id}`, orgId, m.name || 'Team member', rosterRole, m.user_id, now()]
    ).catch(() => {});
  }
}

/** GET /api/people — the active workforce roster for the business. */
export const GET: APIRoute = async ({ locals }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  if (!isStaff(locals.role) || !locals.org) return new Response('Forbidden', { status: 403 });

  await syncFromMembers(env.DB, locals.org.id);
  const people = await queryAll<Person>(
    env.DB,
    'SELECT * FROM people WHERE org_id = ? AND active = 1 ORDER BY name',
    [locals.org.id]
  );
  return Response.json(people);
};

/**
 * POST /api/people — add someone to the roster (agency/subbie/temp, or a person
 * without an app login). Managers/owners only.
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  if (!locals.user || !locals.org) return new Response('Unauthorized', { status: 401 });
  if (!hasCap(locals, 'manage_projects')) return new Response('Forbidden', { status: 403 });

  const body = await request.json().catch(() => ({})) as Partial<Person>;
  const name = (body.name || '').trim();
  if (!name) return Response.json({ error: 'Name is required' }, { status: 400 });

  const id = generateId();
  await execute(
    env.DB,
    `INSERT INTO people (id, org_id, name, role, company, phone, default_days, default_start, default_end, default_rate, active, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
    [
      id, locals.org.id, name, body.role || 'operative', body.company?.trim() || null,
      body.phone?.trim() || null, body.default_days || null, body.default_start || null,
      body.default_end || null, body.default_rate ?? null, now(),
    ]
  );
  return Response.json({ id, name, role: body.role || 'operative', company: body.company || null }, { status: 201 });
};
