import type { APIRoute } from 'astro';
import { queryOne } from '../../../lib/db';
import { canAccessProject } from '../../../lib/access';
import { hasCap } from '../../../lib/capabilities';
import { createInvoice, valuationFor, type ProjectFinancials } from '../../../lib/financials';

export const prerender = false;

/**
 * POST /api/invoices — raise an invoice / instalment / deposit (as a draft).
 *
 * Body: { project_id, description?, net?, vat_rate?, is_deposit?, due_at? }
 *   next_instalment: true → ignore net/description and use the *computed* next
 *   instalment, so the figure the office bills is the one the valuation says is
 *   due rather than a re-keyed number.
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  const user = locals.user;
  if (!user || !locals.org) return new Response('Unauthorized', { status: 401 });
  if (!hasCap(locals, 'view_costs')) return new Response('Forbidden', { status: 403 });

  const body = await request.json().catch(() => ({})) as {
    project_id?: string; description?: string; net?: number; vat_rate?: number;
    is_deposit?: boolean; due_at?: string; next_instalment?: boolean;
  };
  if (!body.project_id) return Response.json({ error: 'project_id required' }, { status: 400 });
  if (!(await canAccessProject(env.DB, locals, body.project_id))) {
    return new Response('Forbidden', { status: 403 });
  }

  let description = body.description?.trim() ?? '';
  let net = Number(body.net) || 0;
  let vatRate = body.vat_rate ?? 20;

  if (body.next_instalment) {
    const project = await queryOne<ProjectFinancials & { quoted_vat_rate: number }>(
      env.DB,
      'SELECT id, org_id, quoted_net, quoted_vat_rate, percent_complete FROM projects WHERE id = ?',
      [body.project_id]
    );
    if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

    const valuation = await valuationFor(env.DB, project);
    if (valuation.nextInstalment.net <= 0) {
      return Response.json({ error: 'Nothing is due for the next instalment yet.' }, { status: 400 });
    }
    net = valuation.nextInstalment.net;
    vatRate = project.quoted_vat_rate;
    description = description || `Interim valuation at ${valuation.percentComplete}% complete`;
  }

  if (!description) {
    return Response.json({ error: 'A description is required' }, { status: 400 });
  }

  const invoice = await createInvoice(env.DB, {
    orgId: locals.org.id,
    projectId: body.project_id,
    description,
    net,
    vatRate,
    isDeposit: body.is_deposit,
    dueAt: body.due_at ?? null,
    createdBy: user.id,
    createdByName: user.name ?? null,
  });

  return Response.json(invoice, { status: 201 });
};
