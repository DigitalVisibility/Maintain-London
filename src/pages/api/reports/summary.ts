import type { APIRoute } from 'astro';
import { queryAll, queryOne } from '../../../lib/db';
import { generateEntryReportHTML, generateWeeklyReportHTML } from '../../../lib/report-generator';
import type {
  DiaryEntry, DiaryEntryFull, EntryPersonnel, EntryActivity,
  EntryDelay, EntryVariation, EntryMaterialRequired, EntryEquipmentHire,
  EntryDelivery, EntryFile, Project,
} from '../../../types/diary';

export const prerender = false;

/**
 * GET /api/reports/summary?project_id=X&type=daily&entry_id=Y
 * GET /api/reports/summary?project_id=X&type=weekly&week_of=2026-03-31
 *
 * Returns HTML report that can be printed / saved as PDF.
 */
export const GET: APIRoute = async ({ locals, url }) => {
  const { env } = locals.runtime;
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  const projectId = url.searchParams.get('project_id');
  const type = url.searchParams.get('type') || 'daily';

  if (!projectId) {
    return Response.json({ error: 'project_id is required' }, { status: 400 });
  }

  const project = await queryOne<Project>(env.DB, 'SELECT * FROM projects WHERE id = ?', [projectId]);
  if (!project) {
    return Response.json({ error: 'Project not found' }, { status: 404 });
  }

  if (type === 'daily') {
    const entryId = url.searchParams.get('entry_id');
    if (!entryId) {
      return Response.json({ error: 'entry_id is required for daily reports' }, { status: 400 });
    }

    const entry = await loadFullEntry(env.DB, entryId);
    if (!entry) {
      return Response.json({ error: 'Entry not found' }, { status: 404 });
    }

    const html = generateEntryReportHTML(entry, project);
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  if (type === 'weekly') {
    const weekOf = url.searchParams.get('week_of');
    if (!weekOf) {
      return Response.json({ error: 'week_of (YYYY-MM-DD, Monday) is required for weekly reports' }, { status: 400 });
    }

    // Get entries for the week (Monday to Sunday)
    const weekStart = weekOf;
    const weekEnd = getWeekEnd(weekOf);

    const entries = await queryAll<DiaryEntry>(
      env.DB,
      'SELECT * FROM diary_entries WHERE project_id = ? AND date >= ? AND date <= ? ORDER BY date',
      [projectId, weekStart, weekEnd]
    );

    if (entries.length === 0) {
      return Response.json({ error: 'No entries found for this week' }, { status: 404 });
    }

    // Load full data for each entry
    const fullEntries = await Promise.all(entries.map((e) => loadFullEntry(env.DB, e.id)));
    const validEntries = fullEntries.filter((e): e is DiaryEntryFull => e !== null);

    const html = generateWeeklyReportHTML(validEntries, project, weekOf);
    return new Response(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }

  return Response.json({ error: 'Invalid type. Use "daily" or "weekly".' }, { status: 400 });
};

/** Load a full diary entry with all sub-records */
async function loadFullEntry(db: D1Database, entryId: string): Promise<DiaryEntryFull | null> {
  const entry = await queryOne<DiaryEntry>(db, 'SELECT * FROM diary_entries WHERE id = ?', [entryId]);
  if (!entry) return null;

  const [personnel, activities, delays, variations, materials, equipment, deliveries, files] =
    await Promise.all([
      queryAll<EntryPersonnel>(db, 'SELECT * FROM entry_personnel WHERE entry_id = ?', [entryId]),
      queryAll<EntryActivity>(db, 'SELECT * FROM entry_activities WHERE entry_id = ?', [entryId]),
      queryAll<EntryDelay>(db, 'SELECT * FROM entry_delays WHERE entry_id = ?', [entryId]),
      queryAll<EntryVariation>(db, 'SELECT * FROM entry_variations WHERE entry_id = ?', [entryId]),
      queryAll<EntryMaterialRequired>(db, 'SELECT * FROM entry_materials_required WHERE entry_id = ?', [entryId]),
      queryAll<EntryEquipmentHire>(db, 'SELECT * FROM entry_equipment_hire WHERE entry_id = ?', [entryId]),
      queryAll<EntryDelivery>(db, 'SELECT * FROM entry_deliveries WHERE entry_id = ?', [entryId]),
      queryAll<EntryFile>(db, 'SELECT * FROM entry_files WHERE entry_id = ?', [entryId]),
    ]);

  return {
    ...entry,
    personnel,
    activities,
    delays,
    variations,
    materials_required: materials,
    equipment_hire: equipment,
    deliveries,
    files,
  };
}

function getWeekEnd(mondayDate: string): string {
  const d = new Date(mondayDate + 'T00:00:00');
  d.setDate(d.getDate() + 6);
  return d.toISOString().split('T')[0];
}
