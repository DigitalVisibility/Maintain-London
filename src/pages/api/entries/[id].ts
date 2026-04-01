import type { APIRoute } from 'astro';
import { generateId, now, queryAll, queryOne, execute, batch } from '../../../lib/db';
import type {
  DiaryEntry, DiaryEntryFull, EntryPersonnel, EntryActivity,
  EntryDelay, EntryVariation, EntryMaterialRequired, EntryEquipmentHire,
  EntryDelivery, EntryFile, Project,
} from '../../../types/diary';

export const prerender = false;

/** GET /api/entries/:id — get a full diary entry with all related data */
export const GET: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { id } = params;
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 });

  const entry = await queryOne<DiaryEntry>(env.DB, 'SELECT * FROM diary_entries WHERE id = ?', [id]);
  if (!entry) return Response.json({ error: 'Entry not found' }, { status: 404 });

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
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  const { id } = params;
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 });

  const existing = await queryOne<DiaryEntry>(env.DB, 'SELECT * FROM diary_entries WHERE id = ?', [id]);
  if (!existing) return Response.json({ error: 'Entry not found' }, { status: 404 });

  const body = await request.json();
  const timestamp = now();
  const statements: { sql: string; params: unknown[] }[] = [];

  // Update main entry
  statements.push({
    sql: `UPDATE diary_entries SET
          date = ?, start_time = ?, end_time = ?, site_manager = ?,
          weather_temp = ?, weather_wind = ?, weather_humidity = ?,
          weather_condition = ?, weather_icon = ?,
          notes = ?, status = ?, updated_at = ?
          WHERE id = ?`,
    params: [
      body.date, body.start_time, body.end_time, body.site_manager,
      body.weather_temp ?? null, body.weather_wind ?? null, body.weather_humidity ?? null,
      body.weather_condition ?? null, body.weather_icon ?? null,
      body.notes ?? null, body.status ?? existing.status, timestamp, id,
    ],
  });

  // Delete + re-insert sub-records (simpler than diffing)
  const subTables = [
    'entry_personnel', 'entry_activities', 'entry_delays', 'entry_variations',
    'entry_materials_required', 'entry_equipment_hire', 'entry_deliveries',
  ];
  for (const table of subTables) {
    statements.push({ sql: `DELETE FROM ${table} WHERE entry_id = ?`, params: [id] });
  }

  // Re-insert personnel
  if (Array.isArray(body.personnel)) {
    for (const p of body.personnel) {
      statements.push({
        sql: `INSERT INTO entry_personnel (id, entry_id, name, role, hours, company, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        params: [generateId(), id, p.name, p.role ?? 'operative', p.hours ?? null, p.company ?? null, timestamp],
      });
    }
  }

  // Re-insert activities
  if (Array.isArray(body.activities)) {
    for (const a of body.activities) {
      statements.push({
        sql: `INSERT INTO entry_activities (id, entry_id, task, description, status, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        params: [generateId(), id, a.task, a.description ?? null, a.status ?? 'active', timestamp],
      });
    }
  }

  // Re-insert delays
  if (Array.isArray(body.delays)) {
    for (const d of body.delays) {
      statements.push({
        sql: `INSERT INTO entry_delays (id, entry_id, task, reason, hours_lost, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        params: [generateId(), id, d.task, d.reason, d.hours_lost ?? null, timestamp],
      });
    }
  }

  // Re-insert variations
  if (Array.isArray(body.variations)) {
    for (const v of body.variations) {
      statements.push({
        sql: `INSERT INTO entry_variations (id, entry_id, description, hours_required, created_at) VALUES (?, ?, ?, ?, ?)`,
        params: [generateId(), id, v.description, v.hours_required ?? null, timestamp],
      });
    }
  }

  // Re-insert materials required
  if (Array.isArray(body.materials_required)) {
    for (const m of body.materials_required) {
      statements.push({
        sql: `INSERT INTO entry_materials_required (id, entry_id, supplier, items, date_required, created_at) VALUES (?, ?, ?, ?, ?, ?)`,
        params: [generateId(), id, m.supplier, m.items, m.date_required ?? null, timestamp],
      });
    }
  }

  // Re-insert equipment hire
  if (Array.isArray(body.equipment_hire)) {
    for (const e of body.equipment_hire) {
      statements.push({
        sql: `INSERT INTO entry_equipment_hire (id, entry_id, equipment, supplier, created_at) VALUES (?, ?, ?, ?, ?)`,
        params: [generateId(), id, e.equipment, e.supplier, timestamp],
      });
    }
  }

  // Re-insert deliveries
  if (Array.isArray(body.deliveries)) {
    for (const d of body.deliveries) {
      statements.push({
        sql: `INSERT INTO entry_deliveries (id, entry_id, supplier, notes, created_at) VALUES (?, ?, ?, ?, ?)`,
        params: [generateId(), id, d.supplier, d.notes ?? null, timestamp],
      });
    }
  }

  await batch(env.DB, statements);
  return Response.json({ id, status: 'updated' });
};

/** DELETE /api/entries/:id */
export const DELETE: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  // Only admins and managers can delete
  if (user.role === 'operative') {
    return Response.json({ error: 'Insufficient permissions' }, { status: 403 });
  }

  const { id } = params;
  if (!id) return Response.json({ error: 'id is required' }, { status: 400 });

  // CASCADE deletes will remove all sub-records
  await execute(env.DB, 'DELETE FROM diary_entries WHERE id = ?', [id]);
  return Response.json({ status: 'deleted' });
};
