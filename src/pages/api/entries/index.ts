import type { APIRoute } from 'astro';
import { generateId, now, queryAll, queryOne, execute, batch } from '../../../lib/db';
import type { DiaryEntry, DiaryEntryFull } from '../../../types/diary';

export const prerender = false;

/** GET /api/entries?project_id=xxx — list entries for a project */
export const GET: APIRoute = async ({ locals, url }) => {
  const { env } = locals.runtime;
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  const projectId = url.searchParams.get('project_id');
  if (!projectId) {
    return Response.json({ error: 'project_id is required' }, { status: 400 });
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
  const entryId = generateId();
  const timestamp = now();

  const statements: { sql: string; params: unknown[] }[] = [];

  // Main entry
  statements.push({
    sql: `INSERT INTO diary_entries (id, project_id, created_by, date, start_time, end_time, site_manager,
          weather_temp, weather_wind, weather_humidity, weather_condition, weather_icon,
          notes, status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    params: [
      entryId, body.project_id, user.id, body.date, body.start_time, body.end_time,
      body.site_manager, body.weather_temp ?? null, body.weather_wind ?? null,
      body.weather_humidity ?? null, body.weather_condition ?? null, body.weather_icon ?? null,
      body.notes ?? null, body.status ?? 'draft', timestamp, timestamp,
    ],
  });

  // Personnel
  if (Array.isArray(body.personnel)) {
    for (const p of body.personnel) {
      statements.push({
        sql: `INSERT INTO entry_personnel (id, entry_id, name, role, hours, company, created_at)
              VALUES (?, ?, ?, ?, ?, ?, ?)`,
        params: [generateId(), entryId, p.name, p.role ?? 'operative', p.hours ?? null, p.company ?? null, timestamp],
      });
    }
  }

  // Activities
  if (Array.isArray(body.activities)) {
    for (const a of body.activities) {
      statements.push({
        sql: `INSERT INTO entry_activities (id, entry_id, task, description, status, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        params: [generateId(), entryId, a.task, a.description ?? null, a.status ?? 'active', timestamp],
      });
    }
  }

  // Delays
  if (Array.isArray(body.delays)) {
    for (const d of body.delays) {
      statements.push({
        sql: `INSERT INTO entry_delays (id, entry_id, task, reason, hours_lost, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        params: [generateId(), entryId, d.task, d.reason, d.hours_lost ?? null, timestamp],
      });
    }
  }

  // Variations
  if (Array.isArray(body.variations)) {
    for (const v of body.variations) {
      statements.push({
        sql: `INSERT INTO entry_variations (id, entry_id, description, hours_required, created_at)
              VALUES (?, ?, ?, ?, ?)`,
        params: [generateId(), entryId, v.description, v.hours_required ?? null, timestamp],
      });
    }
  }

  // Materials required
  if (Array.isArray(body.materials_required)) {
    for (const m of body.materials_required) {
      statements.push({
        sql: `INSERT INTO entry_materials_required (id, entry_id, supplier, items, date_required, created_at)
              VALUES (?, ?, ?, ?, ?, ?)`,
        params: [generateId(), entryId, m.supplier, m.items, m.date_required ?? null, timestamp],
      });
    }
  }

  // Equipment hire
  if (Array.isArray(body.equipment_hire)) {
    for (const e of body.equipment_hire) {
      statements.push({
        sql: `INSERT INTO entry_equipment_hire (id, entry_id, equipment, supplier, created_at)
              VALUES (?, ?, ?, ?, ?)`,
        params: [generateId(), entryId, e.equipment, e.supplier, timestamp],
      });
    }
  }

  // Deliveries
  if (Array.isArray(body.deliveries)) {
    for (const d of body.deliveries) {
      statements.push({
        sql: `INSERT INTO entry_deliveries (id, entry_id, supplier, notes, created_at)
              VALUES (?, ?, ?, ?, ?)`,
        params: [generateId(), entryId, d.supplier, d.notes ?? null, timestamp],
      });
    }
  }

  try {
    await batch(env.DB, statements);
    return Response.json({ id: entryId, status: 'created' }, { status: 201 });
  } catch (err: any) {
    if (err?.message?.includes('UNIQUE constraint')) {
      return Response.json({ error: 'An entry already exists for this project and date' }, { status: 409 });
    }
    throw err;
  }
};
