import type { APIRoute } from 'astro';
import { queryOne, execute } from '../../../lib/db';
import { canAccessProject } from '../../../lib/access';
import { hasCap } from '../../../lib/capabilities';
import { updateVariation, raiseVariation, type Variation } from '../../../lib/variations';
import type { ApprovalProject } from '../../../lib/approvals';

export const prerender = false;

/** Load a variation and check the caller may act on its project + has costs access. */
async function load(env: any, locals: App.Locals, id: string) {
  const variation = await queryOne<Variation>(env.DB, 'SELECT * FROM variations WHERE id = ?', [id]);
  if (!variation) return { error: Response.json({ error: 'Not found' }, { status: 404 }) };

  if (!(await canAccessProject(env.DB, locals, variation.project_id))) {
    return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  if (!hasCap(locals, 'view_costs')) {
    return { error: Response.json({ error: 'Insufficient permissions' }, { status: 403 }) };
  }
  return { variation };
}

/** GET /api/variations/:id */
export const GET: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const found = await load(env, locals, params.id!);
  if ('error' in found) return found.error;
  return Response.json(found.variation);
};

/** PATCH /api/variations/:id  { description?, net?, vat_rate? } — edit a draft. */
export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const found = await load(env, locals, params.id!);
  if ('error' in found) return found.error;

  // Once raised, the figures are what the client was shown — editing them would
  // desync the register from the approval they're deciding on.
  if (found.variation.status !== 'draft') {
    return Response.json({ error: 'Only a draft can be edited.' }, { status: 409 });
  }

  const body = await request.json().catch(() => ({})) as {
    description?: string; net?: number; vat_rate?: number;
  };
  await updateVariation(env.DB, found.variation, body);
  return Response.json({ status: 'updated' });
};

/** POST /api/variations/:id — raise it for approval (draft → pending). */
export const POST: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  const found = await load(env, locals, params.id!);
  if ('error' in found) return found.error;
  const { variation } = found;

  if (variation.status !== 'draft') {
    return Response.json({ error: 'This variation has already been raised.' }, { status: 409 });
  }
  if (!variation.description.trim()) {
    return Response.json({ error: 'Add a description before raising.' }, { status: 400 });
  }

  const project = await queryOne<ApprovalProject & { variation_approval?: string | null }>(
    env.DB,
    'SELECT id, org_id, name, approval_auto_limit, approval_manager_limit, variation_approval FROM projects WHERE id = ?',
    [variation.project_id]
  );
  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

  const { status } = await raiseVariation(env, variation, project, user);
  return Response.json({ status });
};

/** DELETE /api/variations/:id — discard a draft. */
export const DELETE: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const found = await load(env, locals, params.id!);
  if ('error' in found) return found.error;

  // A raised variation is part of the contract trail; only a draft can be
  // discarded. Reject an already-raised one rather than orphaning its approval.
  if (found.variation.status !== 'draft') {
    return Response.json({ error: 'Only a draft can be deleted. Reject it instead.' }, { status: 409 });
  }

  await execute(env.DB, 'DELETE FROM variations WHERE id = ?', [found.variation.id]);
  return Response.json({ status: 'deleted' });
};
