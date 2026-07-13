import type { APIRoute } from 'astro';
import { queryOne } from '../../../../lib/db';
import { canAccessProject } from '../../../../lib/access';
import { isStaff } from '../../../../lib/capabilities';
import { generateInvoiceHTML, type DocOrg, type DocProject, type DocType } from '../../../../lib/invoice-document';
import type { Invoice } from '../../../../lib/financials';

export const prerender = false;

/**
 * GET /api/invoices/:id/document?type=invoice|receipt
 *
 * The printable VAT invoice or payment receipt. Unlike the other invoice routes
 * this one is client-reachable — a client needs to open and save their own
 * invoice — so it authorises on project access rather than view_costs, and never
 * serves a draft to a client (only staff can preview one).
 */
export const GET: APIRoute = async ({ locals, params, url }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const type = (url.searchParams.get('type') === 'receipt' ? 'receipt' : 'invoice') as DocType;

  const invoice = await queryOne<Invoice>(env.DB, 'SELECT * FROM invoices WHERE id = ?', [params.id]);
  if (!invoice) return new Response('Not found', { status: 404 });

  if (!(await canAccessProject(env.DB, locals, invoice.project_id))) {
    return new Response('Forbidden', { status: 403 });
  }
  // Clients only ever see an issued invoice; a receipt needs it to be paid.
  if (!isStaff(locals.role) && invoice.status === 'draft') {
    return new Response('Not found', { status: 404 });
  }
  if (type === 'receipt' && invoice.status !== 'paid') {
    return new Response('This invoice has not been paid yet.', { status: 409 });
  }

  const project = await queryOne<DocProject>(
    env.DB,
    'SELECT name, address, postcode, client_name, client_email FROM projects WHERE id = ?',
    [invoice.project_id]
  );
  const org = await queryOne<DocOrg>(
    env.DB,
    `SELECT name, brand_color, logo_url, company_address, vat_number, company_number,
            company_phone, company_email, bank_details, invoice_terms
       FROM organisations WHERE id = ?`,
    [invoice.org_id ?? '']
  );

  const html = generateInvoiceHTML(invoice, project ?? { name: 'Project' }, org ?? {}, type);
  return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
};
