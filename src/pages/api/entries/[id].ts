import type { APIRoute } from 'astro';
import { now, queryAll, queryOne, execute, batch } from '../../../lib/db';
import { canAccessProject } from '../../../lib/access';
import { hasCap, isStaff } from '../../../lib/capabilities';
import { buildChildDeletes, buildChildInserts } from '../../../lib/diary-children';
import { syncDiaryVariations } from '../../../lib/variations';
import type {
  DiaryEntry, DiaryEntryFull, EntryPersonnel, EntryActivity,
  EntryDelay, EntryVariation, EntryMaterialRequired, EntryEquipmentHire,
  EntryDelivery, EntryFile, Project,
} from '../../../types/diary';

export const prerender = false;

/** GET /api/entries/:id — get a full diary entry with all related data */
export const GET: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  // The raw diary is internal — it carries delays, hidden notes and unvetted
  // content. Clients only ever see the released report.
  if (!isStaff(locals.role)) return new Response('Forbidden', { status: 403 });

  const { id } = params;
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 });

  const entry = await queryOne<DiaryEntry>(env.DB, 'SELECT * FROM diary_entries WHERE id = ?', [id]);
  if (!entry) return Response.json({ error: 'Entry not found' }, { status: 404 });

  if (!(await canAccessProject(env.DB, locals, entry.project_id))) {
    return new Response('Forbidden', { status: 403 });
  }

  const [personnel, activities, delays, variations, materials, equipment, deliveries, files, project] =
    await Promise.all([
      queryAll<EntryPersonnel>(env.DB, 'SELECT * FROM entry_personnel WHERE entry_id = ?', [id]),
      queryAll<EntryActivity>(env.DB, 'SELECT * FROM entry_activities WHERE entry_id = ?', [id]),
      queryAll<EntryDelay>(env.DB, 'SELECT * FROM entry_delays WHERE entry_id = ?', [id]),
      queryAll<EntryVariation>(env.DB, 'SELECT * FROM entry_variations WHERE entry_id = ?', [id]),
      queryAll<EntryMaterialRequired>(env.DB, 'SELECT * FROM entry_materials_required WHERE entry_id = ?', [id]),
      queryAll<EntryEquipmentHire>(env.DB, 'SELECT * FROM entry_equipment_hire WHERE entry_id = ?', [id]),
      queryAll<EntryDelivery>(env.DB, 'SELECT * FROM entry_deliveries WHERE entry_id = ?', [id]),
      queryAll<EntryFile>(env.DB, 'SELECT * FROM entry_files WHERE entry_id = ?', [id]),
      queryOne<Project>(env.DB, 'SELECT * FROM projects WHERE id = ?', [entry.project_id]),
    ]);

  const full: DiaryEntryFull = {
    ...entry,
    personnel,
    activities,
    delays,
    variations,
    materials_required: materials,
    equipment_hire: equipment,
    deliveries,
    files,
    project: project ?? undefined,
  };

  return Response.json(full);
};

/** PUT /api/entries/:id — update a diary entry (replace all sub-records) */
export const PUT: APIRoute = async ({ locals, params, request }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const { id } = params;
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 });

  const existing = await queryOne<DiaryEntry>(env.DB, 'SELECT * FROM diary_entries WHERE id = ?', [id]);
  if (!existing) return Response.json({ error: 'Entry not found' }, { status: 404 });

  if (!hasCap(locals, 'edit_diary') || !(await canAccessProject(env.DB, locals, existing.project_id))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const body = await request.json();
  const timestamp = now();
  const statements: { sql: string; params: unknown[] }[] = [];

  // Preserve the original release timestamp; stamp it the first time it's released.
  const released = body.client_released ? 1 : 0;
  const releasedAt = released
    ? (existing.client_released_at ?? timestamp)
    : null;

  // Update main entry
  statements.push({
    sql: `UPDATE diary_entries SET
          date = ?, start_time = ?, end_time = ?, site_manager = ?,
          weather_temp = ?, weather_wind = ?, weather_humidity = ?,
          weather_condition = ?, weather_icon = ?,
          notes = ?, status = ?,
          client_released = ?, client_released_at = ?, weather_visible = ?, notes_visible = ?,
          updated_at = ?
          WHERE id = ?`,
    params: [
      body.date, body.start_time, body.end_time, body.site_manager,
      body.weather_temp ?? null, body.weather_wind ?? null, body.weather_humidity ?? null,
      body.weather_condition ?? null, body.weather_icon ?? null,
      body.notes ?? null, body.status ?? existing.status,
      released, releasedAt, body.weather_visible ? 1 : 0, body.notes_visible ? 1 : 0,
      timestamp, id,
    ],
  });

  // Replace the sub-records wholesale (simpler than diffing), but carry each
  // row's id across so photos and approvals that reference a variation or a
  // delivery still point at it after the save.
  statements.push(...buildChildDeletes(id));
  statements.push(...buildChildInserts(id, body, timestamp));

  await batch(env.DB, statements);

  // A variation noted on the diary becomes a draft in the register (idempotent —
  // each line is promoted once). Runs after the save so it sees the stored rows,
  // and never blocks the response on the notification email.
  const promote = syncDiaryVariations(
    env,
    { id, project_id: existing.project_id, org_id: locals.org?.id ?? null },
    Array.isArray(body.variations) ? body.variations : [],
    { id: locals.user.id, name: locals.user.name ?? null }
  );
  const ctx = locals.runtime.ctx;
  if (ctx?.waitUntil) ctx.waitUntil(promote); else await promote;

  return Response.json({ id, status: 'updated' });
};

/** DELETE /api/entries/:id */
export const DELETE: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  // Only admins and managers can delete. Check the role held in the active org,
  // not the account-level one.
  if (locals.role === 'client' || locals.role === 'operative') {
    return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const { id } = params;
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 });

  const existing = await queryOne<DiaryEntry>(env.DB, 'SELECT * FROM diary_entries WHERE id = ?', [id]);
  if (!existing) return Response.json({ error: 'Entry not found' }, { status: 404 });

  if (!(await canAccessProject(env.DB, locals, existing.project_id))) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  // CASCADE deletes will remove all sub-records
  await execute(env.DB, 'DELETE FROM diary_entries WHERE id = ?', [id]);
  return Response.json({ status: 'deleted' });
};
