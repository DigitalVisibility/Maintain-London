import type { APIRoute } from 'astro';
import { queryAll } from '../../lib/db';
import { isStaff } from '../../lib/capabilities';

export const prerender = false;

interface GalleryRow {
  id: string;
  r2_key: string;
  filename: string;
  caption: string | null;
  file_type: string;
  mime_type: string;
  client_visible: number;
  created_at: string;
  entry_id: string;
  entry_date: string;
  project_id: string;
  project_name: string;
}

/**
 * GET /api/gallery — browsable feed of a business's diary photos.
 *
 * Scoped to the caller's org (never leaks another business's evidence) and
 * limited to image files. Optional filters: project_id, and a from/to date
 * window over the diary entry date.
 */
export const GET: APIRoute = async ({ locals, url }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  if (!isStaff(locals.role) || !locals.org) return new Response('Forbidden', { status: 403 });

  const projectId = url.searchParams.get('project_id');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');

  let sql = `SELECT f.id, f.r2_key, f.filename, f.caption, f.file_type, f.mime_type, f.client_visible, f.created_at,
             de.id AS entry_id, de.date AS entry_date, de.project_id, pr.name AS project_name
        FROM entry_files f
        JOIN diary_entries de ON de.id = f.entry_id
        JOIN projects pr ON pr.id = de.project_id
       WHERE pr.org_id = ? AND f.mime_type LIKE 'image/%'`;
  const params: unknown[] = [locals.org.id];

  if (projectId) {
    sql += ' AND de.project_id = ?';
    params.push(projectId);
  }
  if (from) {
    sql += ' AND de.date >= date(?)';
    params.push(from);
  }
  if (to) {
    sql += ' AND de.date <= date(?)';
    params.push(to);
  }

  sql += ' ORDER BY de.date DESC, f.created_at DESC LIMIT 500';

  const rows = await queryAll<GalleryRow>(env.DB, sql, params);
  const photos = rows.map((row) => ({
    ...row,
    url: '/api/photos/' + encodeURIComponent(row.r2_key),
  }));

  return Response.json({ photos });
};
