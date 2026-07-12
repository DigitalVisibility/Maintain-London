import type { APIRoute } from 'astro';
import { queryAll, queryOne } from '../../../lib/db';
import { canAccessProject } from '../../../lib/access';
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

  if (!(await canAccessProject(env.DB, locals, projectId))) {
    return new Response('Forbidden', { status: 403 });
  }

  // audience=client → only released entries, filtered to client-visible content.
  // A client always gets that view whatever they ask for: the audience is a
  // property of who is asking, not a switch the caller gets to flip.
  const clientOnly = locals.role === 'client' || url.searchParams.get('audience') === 'client';

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
    // The entry must belong to the project we authorised above — otherwise the
    // project_id check could be satisfied with one project and the entry read
    // from another.
    if (!entry || entry.project_id !== projectId) {
      return Response.json({ error: 'Entry not found' }, { status: 404 });
    }

    if (clientOnly && entry.client_released !== 1) {
      return Response.json(
        { error: 'This entry has not been released to the client yet.' },
        { status: 403 }
      );
    }

    const html = generateEntryReportHTML(entry, project, { clientOnly });
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
    let validEntries = fullEntries.filter((e): e is DiaryEntryFull => e !== null);

    // For client reports, only include days that have been released.
    if (clientOnly) {
      validEntries = validEntries.filter((e) => e.client_released === 1);
      if (validEntries.length === 0) {
        return Response.json(
          { error: 'No entries for this week have been released to the client yet.' },
          { status: 403 }
        );
      }
    }

    const html = generateWeeklyReportHTML(validEntries, project, weekOf, { clientOnly });
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
  // Work in UTC throughout. Parsing as local midnight and formatting back as
  // UTC loses the last day of the week in any timezone ahead of UTC (BST), so
  // Sunday's entry silently drops out of the weekly report.
  const d = new Date(mondayDate + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + 6);
  return d.toISOString().split('T')[0];
}
