import type { APIRoute } from 'astro';
import { queryOne, execute, now } from '../../../lib/db';
import { canAccessProject } from '../../../lib/access';
import { hasCap } from '../../../lib/capabilities';
import { valuationFor, listInvoices, invoicesSummary, type ProjectFinancials } from '../../../lib/financials';
import { registerSummary } from '../../../lib/variations';

export const prerender = false;

/**
 * GET /api/financials?project_id= — the whole financial position for a project:
 * the stored quote/%-complete, the live valuation, the invoices, and the counts
 * a client's summary cards need. Requires view_costs (clients don't have it), so
 * this is a staff view; the client sees a curated slice via the portal page.
 */
export const GET: APIRoute = async ({ locals, url }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  if (!hasCap(locals, 'view_costs')) return new Response('Forbidden', { status: 403 });

  const projectId = url.searchParams.get('project_id');
  if (!projectId) return Response.json({ error: 'project_id required' }, { status: 400 });
  if (!(await canAccessProject(env.DB, locals, projectId))) {
    return new Response('Forbidden', { status: 403 });
  }

  const project = await queryOne<ProjectFinancials>(
    env.DB,
    'SELECT id, org_id, quoted_net, quoted_vat_rate, percent_complete FROM projects WHERE id = ?',
    [projectId]
  );
  if (!project) return Response.json({ error: 'Project not found' }, { status: 404 });

  const [valuation, invoices, invSummary, variations] = await Promise.all([
    valuationFor(env.DB, project),
    listInvoices(env.DB, projectId),
    invoicesSummary(env.DB, projectId),
    registerSummary(env.DB, projectId),
  ]);

  return Response.json({
    settings: {
      quoted_net: project.quoted_net,
      quoted_vat_rate: project.quoted_vat_rate,
      percent_complete: project.percent_complete,
    },
    valuation,
    invoices,
    invoices_summary: invSummary,
    variations_summary: variations,
  });
};

/** PUT /api/financials  { project_id, quoted_net?, quoted_vat_rate?, percent_complete? } */
export const PUT: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  if (!hasCap(locals, 'view_costs')) return new Response('Forbidden', { status: 403 });

  const body = await request.json().catch(() => ({})) as {
    project_id?: string; quoted_net?: number; quoted_vat_rate?: number; percent_complete?: number;
  };
  if (!body.project_id) return Response.json({ error: 'project_id required' }, { status: 400 });
  if (!(await canAccessProject(env.DB, locals, body.project_id))) {
    return new Response('Forbidden', { status: 403 });
  }

  const existing = await queryOne<ProjectFinancials>(
    env.DB,
    'SELECT id, org_id, quoted_net, quoted_vat_rate, percent_complete FROM projects WHERE id = ?',
    [body.project_id]
  );
  if (!existing) return Response.json({ error: 'Project not found' }, { status: 404 });

  const quotedNet = body.quoted_net ?? existing.quoted_net;
  const vatRate = body.quoted_vat_rate ?? existing.quoted_vat_rate;
  const percent = body.percent_complete === undefined
    ? existing.percent_complete
    : Math.min(100, Math.max(0, Number(body.percent_complete) || 0));

  await execute(
    env.DB,
    'UPDATE projects SET quoted_net = ?, quoted_vat_rate = ?, percent_complete = ?, updated_at = ? WHERE id = ?',
    [quotedNet, vatRate, percent, now(), body.project_id]
  );

  return Response.json({ status: 'updated' });
};
