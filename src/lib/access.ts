/**
 * Project-scoped authorisation.
 *
 * The middleware only *authenticates* — it resolves locals.user/org/role. Every
 * data route still has to *authorise*: "may this user touch this project?".
 * A signed-in session is not an answer to that question; without these checks a
 * client of one business can read another business's projects by changing an id
 * in the URL.
 *
 * Staff are scoped to their active org. Clients are scoped to the projects they
 * are explicitly linked to via project_clients — and, being outside the
 * business, only ever to content that has been vetted and released to them.
 */

import { queryOne } from './db';

export interface AccessLocals {
  user?: { id: string } | null;
  role?: string | null;
  org?: { id: string } | null;
}

/** Staff: the project must belong to their active org. Client: they must be linked to it. */
export async function canAccessProject(
  db: D1Database,
  locals: AccessLocals,
  projectId: string | null | undefined
): Promise<boolean> {
  if (!locals.user || !projectId) return false;

  if (locals.role === 'client') {
    const link = await queryOne(
      db,
      'SELECT 1 AS ok FROM project_clients WHERE project_id = ? AND user_id = ?',
      [projectId, locals.user.id]
    );
    return !!link;
  }

  // Staff (including a platform admin who has entered a business — the
  // middleware gives them that org's owner role).
  if (!locals.org) return false;
  const project = await queryOne<{ org_id: string }>(
    db,
    'SELECT org_id FROM projects WHERE id = ?',
    [projectId]
  );
  return !!project && project.org_id === locals.org.id;
}

/** As canAccessProject, resolved from a diary entry. Returns its project_id when allowed. */
export async function canAccessEntry(
  db: D1Database,
  locals: AccessLocals,
  entryId: string | null | undefined
): Promise<string | null> {
  if (!entryId) return null;
  const entry = await queryOne<{ project_id: string }>(
    db,
    'SELECT project_id FROM diary_entries WHERE id = ?',
    [entryId]
  );
  if (!entry) return null;
  return (await canAccessProject(db, locals, entry.project_id)) ? entry.project_id : null;
}

/** A stored file, with the entry and project it hangs off. */
export interface FileRecord {
  r2_key: string;
  entry_id: string;
  project_id: string;
  org_id: string | null;
  client_visible: number | null;
  client_released: number | null;
}

/**
 * Look a file up by its R2 key. Routes resolve the key through D1 before
 * touching the bucket, so we can only ever serve keys we actually issued —
 * an arbitrary key (or a traversal attempt) simply isn't in the table.
 */
export function loadFileByKey(db: D1Database, key: string): Promise<FileRecord | null> {
  return queryOne<FileRecord>(
    db,
    `SELECT f.r2_key, f.entry_id, f.client_visible,
            e.project_id, e.client_released,
            p.org_id
     FROM entry_files f
     JOIN diary_entries e ON e.id = f.entry_id
     JOIN projects p ON p.id = e.project_id
     WHERE f.r2_key = ?`,
    [key]
  );
}

/**
 * May this user read this file? Staff: same org. Client: linked to the project,
 * and the file must have been marked client-visible on a released day — the
 * same test the client report applies, enforced at the point of serving so a
 * guessed URL can't bypass it.
 */
export async function canReadFile(
  db: D1Database,
  locals: AccessLocals,
  file: FileRecord
): Promise<boolean> {
  if (!(await canAccessProject(db, locals, file.project_id))) return false;
  if (locals.role !== 'client') return true;
  return file.client_visible === 1 && file.client_released === 1;
}
