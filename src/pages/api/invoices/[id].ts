import type { APIRoute } from 'astro';
import { queryOne, queryAll, execute, now } from '../../../lib/db';
import { canAccessProject } from '../../../lib/access';
import { hasCap } from '../../../lib/capabilities';
import { computeInvoiceMoney, type Invoice, type InvoiceStatus } from '../../../lib/financials';
import { sendEmail, emailLayout, loadSender } from '../../../lib/email';
import { baseUrlForOrgId } from '../../../lib/platform';

export const prerender = false;

async function load(env: any, locals: App.Locals, id: string) {
  const invoice = await queryOne<Invoice>(env.DB, 'SELECT * FROM invoices WHERE id = ?', [id]);
  if (!invoice) return { error: Response.json({ error: 'Not found' }, { status: 404 }) };
  if (!(await canAccessProject(env.DB, locals, invoice.project_id))) {
    return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  if (!hasCap(locals, 'view_costs')) {
    return { error: Response.json({ error: 'Insufficient permissions' }, { status: 403 }) };
  }
  return { invoice };
}

/**
 * PATCH /api/invoices/:id  { status?, description?, net?, vat_rate?, due_at? }
 * Edit a draft, or move status draft → sent → paid. Figures are locked once the
 * invoice leaves draft (it's what the client was billed), so only status/paid
 * date change after that.
 */
export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const found = await load(env, locals, params.id!);
  if ('error' in found) return found.error;
  const { invoice } = found;

  const body = await request.json().catch(() => ({})) as {
    status?: InvoiceStatus; description?: string; net?: number; vat_rate?: number; due_at?: string;
  };

  const timestamp = now();
  const nextStatus = body.status ?? invoice.status;

  // Amounts and description are only editable while it's still a draft.
  let net = invoice.net, vatRate = invoice.vat_rate, vat = invoice.vat, total = invoice.total;
  let description = invoice.description;
  if (invoice.status === 'draft' && (body.net !== undefined || body.vat_rate !== undefined || body.description !== undefined)) {
    net = body.net ?? invoice.net;
    vatRate = body.vat_rate ?? invoice.vat_rate;
    const m = computeInvoiceMoney(net, vatRate);
    vat = m.vat; total = m.total; net = m.net;
    description = body.description?.trim() ?? invoice.description;
  } else if (body.description !== undefined && body.description.trim()) {
    // A reworded description is harmless after issue; amounts are not.
    description = body.description.trim();
  }

  const issuedAt = nextStatus !== 'draft' ? (invoice.issued_at ?? timestamp) : null;
  const paidAt = nextStatus === 'paid' ? (invoice.paid_at ?? timestamp) : (nextStatus === 'sent' ? null : invoice.paid_at);

  await execute(
    env.DB,
    `UPDATE invoices
        SET description = ?, net = ?, vat_rate = ?, vat = ?, total = ?,
            status = ?, issued_at = ?, due_at = ?, paid_at = ?, updated_at = ?
      WHERE id = ?`,
    [
      description, net, vatRate, vat, total,
      nextStatus, issuedAt, body.due_at ?? invoice.due_at, paidAt, timestamp, invoice.id,
    ]
  );

  // Tell the client when an invoice is first issued (draft → sent), so it doesn't
  // sit in the portal unseen.
  const justIssued = invoice.status === 'draft' && nextStatus === 'sent';
  if (justIssued) {
    await notifyInvoiceIssued(env, { ...invoice, number: invoice.number, description, net, vat, total });
  }

  return Response.json({ status: 'updated' });
};

/** DELETE /api/invoices/:id — discard a draft (a sent invoice is a record; keep it). */
export const DELETE: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const found = await load(env, locals, params.id!);
  if ('error' in found) return found.error;

  if (found.invoice.status !== 'draft') {
    return Response.json({ error: 'Only a draft invoice can be deleted.' }, { status: 409 });
  }
  await execute(env.DB, 'DELETE FROM invoices WHERE id = ?', [found.invoice.id]);
  return Response.json({ status: 'deleted' });
};

/** Email the client that an invoice is available. Never throws. */
async function notifyInvoiceIssued(env: any, invoice: Invoice): Promise<void> {
  try {
    const project = await queryOne<{ id: string; name: string; org_id: string | null }>(
      env.DB, 'SELECT id, name, org_id FROM projects WHERE id = ?', [invoice.project_id]
    );
    if (!project) return;

    const clients = await queryAll<{ email: string }>(
      env.DB,
      `SELECT u.email FROM project_clients pc JOIN user u ON u.id = pc.user_id WHERE pc.project_id = ?`,
      [project.id]
    );
    const recipients = clients.map((c) => c.email).filter(Boolean);
    if (recipients.length === 0) return;

    const base = await baseUrlForOrgId(env, env.DB, project.org_id);
    const sender = await loadSender(env.DB, project.org_id);
    const num = String(invoice.number).padStart(4, '0');

    await sendEmail(env.RESEND_API_KEY, {
      to: recipients,
      from: sender.from,
      replyTo: sender.replyTo,
      subject: `Invoice ${num} — ${project.name}`,
      html: emailLayout({
        sender,
        heading: `Invoice ${num} — ${project.name}`,
        body: `<p>${invoice.description}</p>
               <table style="margin:14px 0;font-size:15px">
                 <tr><td style="padding:2px 16px 2px 0;color:#6B7280">Net</td><td>£${invoice.net.toFixed(2)}</td></tr>
                 <tr><td style="padding:2px 16px 2px 0;color:#6B7280">VAT</td><td>£${invoice.vat.toFixed(2)}</td></tr>
                 <tr><td style="padding:2px 16px 2px 0;color:#111827;font-weight:700">Total</td><td style="font-weight:700">£${invoice.total.toFixed(2)}</td></tr>
               </table>
               ${invoice.due_at ? `<p style="color:#6B7280;font-size:13px">Due ${invoice.due_at}.</p>` : ''}`,
        ctaLabel: 'View in your portal',
        ctaUrl: `${base}/project-hub/portal/${project.id}`,
      }),
    });
  } catch (err) {
    console.error('notifyInvoiceIssued failed', err);
  }
}
