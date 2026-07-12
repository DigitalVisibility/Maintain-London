/** Loading a diary entry with all of its child rows. */

import { queryAll, queryOne } from './db';
import type {
  DiaryEntry, DiaryEntryFull, EntryPersonnel, EntryActivity, EntryDelay,
  EntryVariation, EntryMaterialRequired, EntryEquipmentHire, EntryDelivery, EntryFile,
} from '../types/diary';

/** A full diary entry: the day plus every child row hanging off it. */
export async function loadFullEntry(db: D1Database, entryId: string): Promise<DiaryEntryFull | null> {
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

/** Every entry for a project within a date range, fully loaded, oldest first. */
export async function loadEntriesInPeriod(
  db: D1Database,
  projectId: string,
  from: string,
  to: string
): Promise<DiaryEntryFull[]> {
  const rows = await queryAll<{ id: string }>(
    db,
    'SELECT id FROM diary_entries WHERE project_id = ? AND date >= ? AND date <= ? ORDER BY date',
    [projectId, from, to]
  );
  const full = await Promise.all(rows.map((r) => loadFullEntry(db, r.id)));
  return full.filter((e): e is DiaryEntryFull => e !== null);
}
