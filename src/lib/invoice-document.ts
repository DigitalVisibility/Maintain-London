/**
 * A printable VAT invoice / payment receipt.
 *
 * Rendered as A4-print-perfect HTML rather than a generated PDF binary: the same
 * approach the site reports already use, it needs no PDF library in the Worker,
 * and the browser's "Save as PDF" turns it into a real, shareable document. A
 * floating toolbar (hidden when printing) gives a one-tap Save-as-PDF.
 */

import type { Invoice } from './financials';

export interface DocOrg {
  name?: string | null;
  brand_color?: string | null;
  logo_url?: string | null;
  company_address?: string | null;
  vat_number?: string | null;
  company_number?: string | null;
  company_phone?: string | null;
  company_email?: string | null;
  bank_details?: string | null;
  invoice_terms?: string | null;
}

export interface DocProject {
  name: string;
  address?: string | null;
  postcode?: string | null;
  client_name?: string | null;
  client_email?: string | null;
}

export type DocType = 'invoice' | 'receipt';

const esc = (s: unknown) =>
  String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const nl2br = (s: unknown) => esc(s).replace(/\n/g, '<br>');
const money = (n: number) => `£${(n ?? 0).toFixed(2)}`;
const invNo = (n: number) => String(n).padStart(4, '0');

function fmtDate(iso?: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso.replace(' ', 'T'));
  if (isNaN(d.getTime())) return esc(iso);
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

export function generateInvoiceHTML(
  invoice: Invoice,
  project: DocProject,
  org: DocOrg,
  type: DocType
): string {
  const brand = org.brand_color || '#AEDE4A';
  const isReceipt = type === 'receipt';
  const title = isReceipt ? 'Payment Receipt' : 'Invoice';
  const docNumber = invNo(invoice.number);

  const logo = org.logo_url
    ? `<img src="${esc(org.logo_url)}" alt="${esc(org.name)}" style="max-height:56px;max-width:220px;object-fit:contain">`
    : `<div style="font-size:22px;font-weight:800;color:#111827">${esc(org.name || 'Project Dash')}</div>`;

  const companyBlock = [
    org.company_address ? nl2br(org.company_address) : '',
    org.company_phone ? `Tel: ${esc(org.company_phone)}` : '',
    org.company_email ? esc(org.company_email) : '',
    org.vat_number ? `VAT No: ${esc(org.vat_number)}` : '',
    org.company_number ? `Company No: ${esc(org.company_number)}` : '',
  ].filter(Boolean).join('<br>');

  const billTo = [
    esc(project.client_name || 'Client'),
    project.name ? esc(project.name) : '',
    [project.address, project.postcode].filter(Boolean).map(esc).join(', '),
    project.client_email ? esc(project.client_email) : '',
  ].filter(Boolean).join('<br>');

  // A receipt confirms money already in; an invoice asks for it.
  const dateRows = isReceipt
    ? `<tr><td>Receipt date</td><td>${fmtDate(invoice.paid_at || invoice.issued_at)}</td></tr>
       <tr><td>Invoice no.</td><td>${docNumber}</td></tr>`
    : `<tr><td>Invoice date</td><td>${fmtDate(invoice.issued_at)}</td></tr>
       ${invoice.due_at ? `<tr><td>Payment due</td><td>${fmtDate(invoice.due_at)}</td></tr>` : ''}`;

  const paidStamp = isReceipt
    ? `<div style="position:absolute;top:120px;right:40px;transform:rotate(-12deg);border:4px solid #16a34a;color:#16a34a;font-weight:800;font-size:28px;letter-spacing:2px;padding:6px 18px;border-radius:8px;opacity:0.9">PAID</div>`
    : '';

  const paymentBlock = isReceipt
    ? `<div style="margin-top:24px;padding:14px 16px;background:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;color:#166534;font-size:14px">
         Payment of <strong>${money(invoice.total)}</strong> received with thanks on ${fmtDate(invoice.paid_at)}. No further action is needed.
       </div>`
    : `${org.bank_details ? `<div style="margin-top:20px"><div style="font-size:12px;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;margin-bottom:4px">How to pay</div><div style="font-size:14px">${nl2br(org.bank_details)}</div></div>` : ''}
       ${org.invoice_terms ? `<div style="margin-top:14px;font-size:13px;color:#6b7280">${nl2br(org.invoice_terms)}</div>` : ''}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title} ${docNumber} — ${esc(org.name || '')}</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; color: #111827; font-size: 14px; line-height: 1.5; background: #f3f4f6; }
  .sheet { position: relative; background: #fff; max-width: 800px; margin: 24px auto; padding: 40px; box-shadow: 0 1px 6px rgba(0,0,0,.1); }
  .bar { display:flex; align-items:flex-start; justify-content:space-between; gap:24px; border-bottom: 4px solid ${brand}; padding-bottom: 20px; }
  .muted { color:#6b7280; font-size:13px; line-height:1.6; }
  h1 { font-size: 30px; letter-spacing: 1px; text-transform: uppercase; color:#111827; }
  table.meta td { padding: 2px 0; }
  table.meta td:first-child { color:#6b7280; padding-right:20px; }
  table.lines { width:100%; border-collapse:collapse; margin-top:28px; }
  table.lines th { text-align:left; font-size:11px; text-transform:uppercase; letter-spacing:.5px; color:#6b7280; border-bottom:2px solid #e5e7eb; padding:8px 10px; }
  table.lines th.r, table.lines td.r { text-align:right; }
  table.lines td { padding:12px 10px; border-bottom:1px solid #f3f4f6; vertical-align:top; }
  .totals { margin-top:16px; margin-left:auto; width:280px; }
  .totals tr td { padding:5px 10px; }
  .totals tr td:last-child { text-align:right; }
  .totals .grand td { border-top:2px solid #111827; font-weight:800; font-size:16px; padding-top:10px; }
  .foot { margin-top:36px; border-top:1px solid #e5e7eb; padding-top:14px; text-align:center; color:#9ca3af; font-size:12px; }
  .toolbar { position: sticky; top:0; background:#111827; color:#fff; padding:10px 16px; display:flex; gap:12px; align-items:center; justify-content:center; }
  .toolbar button { background:${brand}; color:#111827; border:0; font-weight:700; padding:8px 18px; border-radius:6px; cursor:pointer; font-size:14px; }
  .toolbar span { font-size:13px; opacity:.85; }
  @media print {
    body { background:#fff; }
    .sheet { box-shadow:none; margin:0; max-width:100%; padding:0; }
    .no-print { display:none !important; }
    @page { size: A4; margin: 18mm; }
  }
</style>
</head>
<body>
  <div class="toolbar no-print">
    <button onclick="window.print()">Save as PDF / Print</button>
    <span>Use your browser's “Save as PDF” option in the print dialog.</span>
  </div>

  <div class="sheet">
    ${paidStamp}
    <div class="bar">
      <div>
        ${logo}
        <div class="muted" style="margin-top:10px">${companyBlock}</div>
      </div>
      <div style="text-align:right">
        <h1>${title}</h1>
        <div style="font-size:16px;font-weight:700;margin-top:4px">${docNumber}</div>
        <table class="meta" style="margin-top:12px;margin-left:auto;text-align:left">
          ${dateRows}
        </table>
      </div>
    </div>

    <div style="margin-top:26px">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.5px;color:#6b7280;margin-bottom:6px">${isReceipt ? 'Received from' : 'Bill to'}</div>
      <div style="font-size:15px">${billTo}</div>
    </div>

    <table class="lines">
      <thead>
        <tr>
          <th>Description</th>
          <th class="r">Net</th>
          <th class="r">VAT (${invoice.vat_rate}%)</th>
          <th class="r">Total</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>${esc(invoice.description)}${invoice.is_deposit ? ' <span style="color:#6b7280">(deposit)</span>' : ''}</td>
          <td class="r">${money(invoice.net)}</td>
          <td class="r">${money(invoice.vat)}</td>
          <td class="r">${money(invoice.total)}</td>
        </tr>
      </tbody>
    </table>

    <table class="totals">
      <tr><td>Net</td><td>${money(invoice.net)}</td></tr>
      <tr><td>VAT (${invoice.vat_rate}%)</td><td>${money(invoice.vat)}</td></tr>
      <tr class="grand"><td>${isReceipt ? 'Paid' : 'Total due'}</td><td>${money(invoice.total)}</td></tr>
    </table>

    ${paymentBlock}

    <div class="foot">
      ${esc(org.name || '')}${org.vat_number ? ` · VAT ${esc(org.vat_number)}` : ''} · ${title} ${docNumber}
    </div>
  </div>
</body>
</html>`;
}
