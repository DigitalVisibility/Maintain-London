import type { APIRoute } from 'astro';
import { generateId, now, queryAll, batch } from '../../../lib/db';
import { canAccessProject } from '../../../lib/access';
import { hasCap, isStaff } from '../../../lib/capabilities';
import { buildChildInserts } from '../../../lib/diary-children';
import { syncDiaryVariations } from '../../../lib/variations';
import type { DiaryEntry } from '../../../types/diary';

export const prerender = false;

/** GET /api/entries?project_id=xxx — list entries for a project */
export const GET: APIRoute = async ({ locals, url }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  // The raw diary is internal: clients see released days through the report,
  // never the underlying entries.
  if (!isStaff(locals.role)) return new Response('Forbidden', { status: 403 });

  const projectId = url.searchParams.get('project_id');
  if (!projectId) {
    return Response.json({ error: 'project_id is required' }, { status: 400 });
  }

  if (!(await canAccessProject(env.DB, locals, projectId))) {
    return new Response('Forbidden', { status: 403 });
  }

  const entries = await queryAll<DiaryEntry>(
    env.DB,
    'SELECT * FROM diary_entries WHERE project_id = ? ORDER BY date DESC',
    [projectId]
  );

  return Response.json(entries);
};

/** POST /api/entries — create a new diary entry with all sub-records */
export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  const body = await request.json();

  if (!hasCap(locals, 'edit_diary') || !(await canAccessProject(env.DB, locals, body.project_id))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // Releasing to the client is a manager/owner action. Someone without
  // `release_to_client` (an operative) can create the day's diary, but nothing
  // they create is visible to the client until a manager releases it.
  if (!hasCap(locals, 'release_to_client')) {
    body.client_released = false;
    body.weather_visible = false;
    body.notes_visible = false;
    for (const key of ['personnel', 'activities', 'delays', 'variations', 'materials_required', 'equipment_hire', 'deliveries']) {
      if (Array.isArray(body[key])) body[key] = body[key].map((it: any) => ({ ...it, client_visible: false }));
    }
  }

  const entryId = generateId();
  const timestamp = now();

  const statements: { sql: string; params: unknown[] }[] = [];

  // Main entry
  statements.push({
    sql: `INSERT INTO diary_entries (id, project_id, created_by, date, start_time, end_time, site_manager,
          weather_temp, weather_wind, weather_humidity, weather_condition, weather_icon,
          notes, status, client_released, client_released_at, weather_visible, notes_visible,
          created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      entryId, body.project_id, user.id, body.date, body.start_time, body.end_time,
      body.site_manager, body.weather_temp ?? null, body.weather_wind ?? null,
      body.weather_humidity ?? null, body.weather_condition ?? null, body.weather_icon ?? null,
      body.notes ?? null, body.status ?? 'draft',
      body.client_released ? 1 : 0, body.client_released ? timestamp : null,
      body.weather_visible ? 1 : 0, body.notes_visible ? 1 : 0,
      timestamp, timestamp,
    ],
  });

  statements.push(...buildChildInserts(entryId, body, timestamp));

  try {
    await batch(env.DB, statements);
  } catch (err: any) {
    if (err?.message?.includes('UNIQUE constraint')) {
      return Response.json({ error: 'An entry already exists for this project and date' }, { status: 409 });
    }
    throw err;
  }

  // Promote any variation lines on the new entry into draft register entries.
  const promote = syncDiaryVariations(
    env,
    { id: entryId, project_id: body.project_id, org_id: locals.org?.id ?? null },
    Array.isArray(body.variations) ? body.variations : [],
    { id: user.id, name: user.name ?? null }
  );
  const ctx = locals.runtime.ctx;
  if (ctx?.waitUntil) ctx.waitUntil(promote); else await promote;

  return Response.json({ id: entryId, status: 'created' }, { status: 201 });
};
