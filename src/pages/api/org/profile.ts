import type { APIRoute } from 'astro';
import { queryOne, execute } from '../../../lib/db';
import { hasCap } from '../../../lib/capabilities';

export const prerender = false;

const FIELDS = [
  'company_address', 'vat_number', 'company_number',
  'company_phone', 'company_email', 'bank_details', 'invoice_terms',
] as const;

/** GET /api/org/profile — the company details shown on invoices and receipts. */
export const GET: APIRoute = async ({ locals }) => {
  const { env } = locals.runtime;
  if (!locals.user || !locals.org) return new Response('Unauthorized', { status: 401 });

  const org = await queryOne<Record<string, string | null>>(
    env.DB,
    `SELECT name, ${FIELDS.join(', ')} FROM organisations WHERE id = ?`,
    [locals.org.id]
  );
  return Response.json(org ?? {});
};

/** PUT /api/org/profile — update the company details. */
export const PUT: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  if (!locals.user || !locals.org) return new Response('Unauthorized', { status: 401 });
  if (!hasCap(locals, 'manage_users')) return new Response('Forbidden', { status: 403 });

  const body = await request.json().catch(() => ({})) as Record<string, string>;

  const existing = await queryOne<Record<string, string | null>>(
    env.DB, `SELECT ${FIELDS.join(', ')} FROM organisations WHERE id = ?`, [locals.org.id]
  );
  if (!existing) return Response.json({ error: 'Organisation not found' }, { status: 404 });

  const values = FIELDS.map((f) =>
    body[f] === undefined ? existing[f] : (body[f]?.trim() || null)
  );

  await execute(
    env.DB,
    `UPDATE organisations SET ${FIELDS.map((f) => `${f} = ?`).join(', ')} WHERE id = ?`,
    [...values, locals.org.id]
  );

  return Response.json({ status: 'updated' });
};
