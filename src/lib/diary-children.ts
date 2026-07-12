/**
 * The diary entry's child rows (personnel, activities, variations, …).
 *
 * Saving an entry replaces its children wholesale rather than diffing them, but
 * the ids are supplied by the form and preserved, so a row keeps its identity
 * across saves. That matters: photos link to a variation or a delivery by id
 * (entry_files.linked_to), and an approval request points back at the variation
 * that raised it. Regenerating ids on every save would orphan both.
 */

import { generateId, isValidId } from './ids';

export interface Statement {
  sql: string;
  params: unknown[];
}

interface ChildTable {
  /** D1 table name. Fixed, never user input — safe to interpolate. */
  table: string;
  /** Field on the request body holding the rows. */
  field: string;
  /** Columns between (id, entry_id) and the trailing (client_visible, created_at). */
  columns: string[];
  values: (row: any) => unknown[];
}

const CHILD_TABLES: ChildTable[] = [
  {
    table: 'entry_personnel',
    field: 'personnel',
    columns: ['name', 'role', 'hours', 'company'],
    values: (r) => [r.name, r.role ?? 'operative', r.hours ?? null, r.company ?? null],
  },
  {
    table: 'entry_activities',
    field: 'activities',
    columns: ['task', 'description', 'status'],
    values: (r) => [r.task, r.description ?? null, r.status ?? 'active'],
  },
  {
    table: 'entry_delays',
    field: 'delays',
    columns: ['task', 'reason', 'hours_lost'],
    values: (r) => [r.task, r.reason, r.hours_lost ?? null],
  },
  {
    table: 'entry_variations',
    field: 'variations',
    columns: ['description', 'hours_required'],
    values: (r) => [r.description, r.hours_required ?? null],
  },
  {
    table: 'entry_materials_required',
    field: 'materials_required',
    columns: ['supplier', 'items', 'date_required'],
    values: (r) => [r.supplier, r.items, r.date_required ?? null],
  },
  {
    table: 'entry_equipment_hire',
    field: 'equipment_hire',
    columns: ['equipment', 'supplier'],
    values: (r) => [r.equipment, r.supplier],
  },
  {
    table: 'entry_deliveries',
    field: 'deliveries',
    columns: ['supplier', 'notes'],
    values: (r) => [r.supplier, r.notes ?? null],
  },
];

/** Clear an entry's children, ready to re-insert them. */
export function buildChildDeletes(entryId: string): Statement[] {
  return CHILD_TABLES.map((t) => ({
    sql: `DELETE FROM ${t.table} WHERE entry_id = ?`,
    params: [entryId],
  }));
}

/**
 * Keep the id the form gave us. Fall back to a fresh one for a row that has
 * none (a brand-new row, or an older client that doesn't send ids yet), or for
 * a duplicate — two rows must never collide on the primary key.
 */
function stableId(raw: unknown, used: Set<string>): string {
  const id = isValidId(raw) && !used.has(raw) ? raw : generateId();
  used.add(id);
  return id;
}

/** Insert an entry's children from a request body. */
export function buildChildInserts(entryId: string, body: any, timestamp: string): Statement[] {
  const statements: Statement[] = [];

  for (const t of CHILD_TABLES) {
    const rows = body?.[t.field];
    if (!Array.isArray(rows)) continue;

    const used = new Set<string>();
    const columns = ['id', 'entry_id', ...t.columns, 'client_visible', 'created_at'];
    const placeholders = columns.map(() => '?').join(', ');

    for (const row of rows) {
      statements.push({
        sql: `INSERT INTO ${t.table} (${columns.join(', ')}) VALUES (${placeholders})`,
        params: [
          stableId(row?.id, used),
          entryId,
          ...t.values(row),
          row?.client_visible ? 1 : 0,
          timestamp,
        ],
      });
    }
  }

  return statements;
}
