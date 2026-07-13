import type { APIRoute } from 'astro';
import { queryAll } from '../../../lib/db';
import { canAccessProject } from '../../../lib/access';
import { hasCap, isStaff } from '../../../lib/capabilities';
import { createVariation, registerSummary, type Variation } from '../../../lib/variations';

export const prerender = false;

/** GET /api/variations?project_id= — the register plus its running totals. */
export const GET: APIRoute = async ({ locals, url }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const projectId = url.searchParams.get('project_id');
  if (!projectId) return Response.json({ error: 'project_id required' }, { status: 400 });
  if (!(await canAccessProject(env.DB, locals, projectId))) {
    return new Response('Forbidden', { status: 403 });
  }

  // A client sees only variations that have left draft — a draft is the office's
  // half-formed figure and not something to show the person who'll be billed.
  const variations = isStaff(locals.role)
    ? await queryAll<Variation>(
        env.DB, 'SELECT * FROM variations WHERE project_id = ? ORDER BY number', [projectId]
      )
    : await queryAll<Variation>(
        env.DB,
        `SELECT * FROM variations WHERE project_id = ? AND status != 'draft' ORDER BY number`,
        [projectId]
      );

  const summary = await registerSummary(env.DB, projectId);
  return Response.json({ variations, summary });
};

/** POST /api/variations  { project_id, description, net?, vat_rate? } — add a draft. */
export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  const user = locals.user;
  if (!user || !locals.org) return new Response('Unauthorized', { status: 401 });

  // Recording a variation is a costs action — gate it behind view_costs.
  if (!hasCap(locals, 'view_costs')) return new Response('Forbidden', { status: 403 });

  const body = await request.json().catch(() => ({})) as {
    project_id?: string; description?: string; net?: number; vat_rate?: number;
  };
  if (!body.project_id || !body.description?.trim()) {
    return Response.json({ error: 'project_id and description are required' }, { status: 400 });
  }
  if (!(await canAccessProject(env.DB, locals, body.project_id))) {
    return new Response('Forbidden', { status: 403 });
  }

  const variation = await createVariation(env.DB, {
    orgId: locals.org.id,
    projectId: body.project_id,
    description: body.description,
    net: body.net ?? 0,
    vatRate: body.vat_rate ?? 20,
    createdBy: user.id,
    createdByName: user.name ?? null,
  });

  return Response.json(variation, { status: 201 });
};
