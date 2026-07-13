import type { APIRoute } from 'astro';
import { queryOne } from '../../../../lib/db';
import { getFromR2 } from '../../../../lib/r2';
import { canAccessProject } from '../../../../lib/access';

export const prerender = false;

/**
 * GET /api/summaries/:id/document — the exact HTML that was sent to the client
 * for a sent summary, from the R2 archive. This is the "progress file" record:
 * everyone can re-read what the client was actually told, months later.
 *
 * Client-reachable (they received it), so it authorises on project access — and
 * only serves a summary that was actually sent.
 */
export const GET: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const summary = await queryOne<{ project_id: string; status: string; r2_key: string | null }>(
    env.DB, 'SELECT project_id, status, r2_key FROM summaries WHERE id = ?', [params.id]
  );
  if (!summary || summary.status !== 'sent' || !summary.r2_key) {
    return new Response('Not found', { status: 404 });
  }
  if (!(await canAccessProject(env.DB, locals, summary.project_id))) {
    return new Response('Forbidden', { status: 403 });
  }

  const object = await getFromR2(env.R2, summary.r2_key);
  if (!object) return new Response('Not found', { status: 404 });

  return new Response(object.body, {
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'private, max-age=3600' },
  });
};
