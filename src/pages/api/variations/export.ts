import type { APIRoute } from 'astro';
import { queryAll, queryOne } from '../../../lib/db';
import { canAccessProject } from '../../../lib/access';
import { hasCap } from '../../../lib/capabilities';
import { toCSV, type Variation } from '../../../lib/variations';

export const prerender = false;

/**
 * GET /api/variations/export?project_id= — the register as CSV.
 *
 * Deliberately package-agnostic: a plain CSV imports into Xero, QuickBooks, Sage
 * or a spreadsheet. A direct Xero push can come later; this gets the numbers out
 * of the app today without tying anyone to one accounting product.
 */
export const GET: APIRoute = async ({ locals, url }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  if (!hasCap(locals, 'view_costs')) return new Response('Forbidden', { status: 403 });

  const projectId = url.searchParams.get('project_id');
  if (!projectId) return new Response('project_id required', { status: 400 });
  if (!(await canAccessProject(env.DB, locals, projectId))) {
    return new Response('Forbidden', { status: 403 });
  }

  const project = await queryOne<{ name: string }>(env.DB, 'SELECT name FROM projects WHERE id = ?', [projectId]);
  const variations = await queryAll<Variation>(
    env.DB, 'SELECT * FROM variations WHERE project_id = ? ORDER BY number', [projectId]
  );

  const slug = (project?.name ?? 'project').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  const csv = toCSV(variations);

  return new Response(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="variations-${slug || 'project'}.csv"`,
    },
  });
};
