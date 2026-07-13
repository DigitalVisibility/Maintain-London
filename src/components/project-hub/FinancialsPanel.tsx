import { useEffect, useState } from 'react';

/**
 * The project's financial position — the invoice-summary sketch, live.
 *
 * Everything below the quote and the % complete is computed, so it always agrees
 * with the variations register and the invoices marked paid. Staff set the quote
 * and the progress; the valuation and the balances follow.
 */

type Money = { net: number; vat: number; total: number };
type InvoiceStatus = 'draft' | 'sent' | 'paid';

interface Invoice {
  id: string;
  number: number;
  description: string;
  net: number;
  vat_rate: number;
  vat: number;
  total: number;
  status: InvoiceStatus;
  is_deposit: number;
  due_at: string | null;
  paid_at: string | null;
}

interface Valuation {
  quoted: Money; variations: Money; revised: Money;
  percentComplete: number;
  valueComplete: Money; paidToDate: Money;
  nextInstalment: Money; balanceOutstanding: Money; balanceAfterInstalment: Money;
}

interface Data {
  settings: { quoted_net: number; quoted_vat_rate: number; percent_complete: number };
  valuation: Valuation;
  invoices: Invoice[];
}

const money = (n: number) => `£${n.toFixed(2)}`;
const pad = (n: number) => String(n).padStart(4, '0');

const STATUS_STYLE: Record<InvoiceStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-amber-100 text-amber-800',
  paid: 'bg-green-100 text-green-800',
};

/** One row of the valuation table: label + net / VAT / total. */
function Row({ label, m, strong, accent }: { label: string; m: Money; strong?: boolean; accent?: string }) {
  return (
    <tr className={strong ? 'font-semibold' : ''}>
      <td className={`py-1.5 pr-4 ${accent ?? 'text-gray-700'}`}>{label}</td>
      <td className="py-1.5 px-2 text-right tabular-nums text-gray-600">{money(m.net)}</td>
      <td className="py-1.5 px-2 text-right tabular-nums text-gray-400">{money(m.vat)}</td>
      <td className={`py-1.5 pl-2 text-right tabular-nums ${accent ?? 'text-gray-900'}`}>{money(m.total)}</td>
    </tr>
  );
}

export default function FinancialsPanel({ projectId }: { projectId: string }) {
  const [data, setData] = useState<Data | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  // Quote / progress inputs
  const [quotedNet, setQuotedNet] = useState('');
  const [quotedVat, setQuotedVat] = useState(20);
  const [percent, setPercent] = useState(0);

  // New invoice
  const [invDesc, setInvDesc] = useState('');
  const [invNet, setInvNet] = useState('');
  const [invVat, setInvVat] = useState(20);
  const [invDeposit, setInvDeposit] = useState(false);

  async function load() {
    const res = await fetch(`/api/financials?project_id=${projectId}`);
    if (res.ok) {
      const d: Data = await res.json();
      setData(d);
      setQuotedNet(String(d.settings.quoted_net || ''));
      setQuotedVat(d.settings.quoted_vat_rate);
      setPercent(d.settings.percent_complete);
    }
  }
  useEffect(() => { load(); }, [projectId]);

  async function saveSettings(patch: Record<string, number>) {
    setBusy('settings');
    try {
      await fetch('/api/financials', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, ...patch }),
      });
      await load();
    } finally { setBusy(''); }
  }

  async function addInvoice(e: React.FormEvent) {
    e.preventDefault();
    if (!invDesc.trim()) return;
    setBusy('new-inv');
    try {
      await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId, description: invDesc.trim(),
          net: Number(invNet) || 0, vat_rate: invVat, is_deposit: invDeposit,
        }),
      });
      setInvDesc(''); setInvNet(''); setInvVat(20); setInvDeposit(false);
      await load();
    } finally { setBusy(''); }
  }

  async function raiseNextInstalment() {
    setBusy('next');
    setMsg(null);
    try {
      const res = await fetch('/api/invoices', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, next_instalment: true }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error || 'Failed');
      setMsg({ tone: 'ok', text: `Draft invoice ${pad(d.number)} created for ${money(d.total)}.` });
      await load();
    } catch (err: any) {
      setMsg({ tone: 'bad', text: err.message });
    } finally { setBusy(''); }
  }

  async function setInvoiceStatus(inv: Invoice, status: InvoiceStatus) {
    if (status === 'sent' && !confirm(`Issue invoice ${pad(inv.number)} for ${money(inv.total)}? The client will be emailed.`)) return;
    setBusy(inv.id);
    try {
      await fetch(`/api/invoices/${inv.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      await load();
    } finally { setBusy(''); }
  }

  async function deleteInvoice(inv: Invoice) {
    if (!confirm(`Delete draft invoice ${pad(inv.number)}?`)) return;
    setBusy(inv.id);
    try {
      await fetch(`/api/invoices/${inv.id}`, { method: 'DELETE' });
      await load();
    } finally { setBusy(''); }
  }

  if (!data) return <p className="text-sm text-gray-500">Loading…</p>;
  const v = data.valuation;

  return (
    <div className="space-y-4">
      {msg && (
        <div className={`text-sm rounded-md px-3 py-2 ${
          msg.tone === 'ok' ? 'bg-green-50 text-green-800 border border-green-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>{msg.text}</div>
      )}

      {/* Quote + progress */}
      <div className="bg-white rounded-lg border border-gray-200 p-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Contract</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Quoted (net £)</label>
            <input type="number" min="0" step="0.01" value={quotedNet}
              onChange={(e) => setQuotedNet(e.target.value)}
              onBlur={() => saveSettings({ quoted_net: Number(quotedNet) || 0, quoted_vat_rate: quotedVat })}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#AEDE4A]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">VAT</label>
            <select value={quotedVat}
              onChange={(e) => { const r = Number(e.target.value); setQuotedVat(r); saveSettings({ quoted_net: Number(quotedNet) || 0, quoted_vat_rate: r }); }}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#AEDE4A]">
              <option value={20}>20%</option><option value={5}>5%</option><option value={0}>0%</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">% complete: <strong>{percent}%</strong></label>
            <input type="range" min="0" max="100" step="1" value={percent}
              onChange={(e) => setPercent(Number(e.target.value))}
              onMouseUp={() => saveSettings({ percent_complete: percent })}
              onTouchEnd={() => saveSettings({ percent_complete: percent })}
              className="w-full accent-[#83B81A]" />
          </div>
        </div>
      </div>

      {/* The valuation — the invoice summary */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 overflow-x-auto">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Valuation</h3>
        <table className="w-full text-sm min-w-[26rem]">
          <thead>
            <tr className="text-xs uppercase text-gray-400 border-b border-gray-100">
              <th className="text-left py-1.5 pr-4"></th>
              <th className="text-right py-1.5 px-2">Net</th>
              <th className="text-right py-1.5 px-2">VAT</th>
              <th className="text-right py-1.5 pl-2">Total</th>
            </tr>
          </thead>
          <tbody>
            <Row label="Quoted" m={v.quoted} />
            <Row label={`Approved variations`} m={v.variations} />
            <tr className="border-t border-gray-200"><td colSpan={4} className="pt-1"></td></tr>
            <Row label="Revised contract sum" m={v.revised} strong />
            <Row label={`Value of work complete (${v.percentComplete}%)`} m={v.valueComplete} />
            <Row label="Paid to date" m={v.paidToDate} />
            <tr className="border-t border-gray-200"><td colSpan={4} className="pt-1"></td></tr>
            <Row label="Next instalment due" m={v.nextInstalment} strong accent="text-[#5f8410]" />
            <Row label="Balance outstanding" m={v.balanceOutstanding} />
            <Row label="Balance after instalment" m={v.balanceAfterInstalment} />
          </tbody>
        </table>
        <div className="mt-3">
          <button onClick={raiseNextInstalment} disabled={busy === 'next' || v.nextInstalment.total <= 0}
            className="px-4 py-2 rounded-md bg-[#AEDE4A] hover:bg-[#9BCF3A] text-gray-900 text-sm font-semibold disabled:opacity-50">
            Raise next instalment ({money(v.nextInstalment.total)})
          </button>
          {v.nextInstalment.total <= 0 && (
            <span className="ml-2 text-xs text-gray-400">Nothing due yet — the client is paid up to the work done.</span>
          )}
        </div>
      </div>

      {/* Invoices */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 overflow-x-auto">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Invoices</h3>
        <table className="w-full text-sm min-w-[30rem]">
          <thead>
            <tr className="text-xs uppercase text-gray-400 border-b border-gray-100">
              <th className="text-left py-1.5 pr-3">#</th>
              <th className="text-left py-1.5 pr-3">Description</th>
              <th className="text-right py-1.5 px-2">Total</th>
              <th className="text-left py-1.5 px-2">Status</th>
              <th className="py-1.5"></th>
            </tr>
          </thead>
          <tbody>
            {data.invoices.length === 0 && (
              <tr><td colSpan={5} className="py-4 text-center text-sm text-gray-400">No invoices yet.</td></tr>
            )}
            {data.invoices.map((inv) => (
              <tr key={inv.id} className="border-b border-gray-50 last:border-0">
                <td className="py-2 pr-3 font-mono text-gray-500">{pad(inv.number)}</td>
                <td className="py-2 pr-3 text-gray-900">
                  {inv.description}{inv.is_deposit ? <span className="ml-1 text-xs text-gray-400">· deposit</span> : ''}
                </td>
                <td className="py-2 px-2 text-right tabular-nums font-medium">{money(inv.total)}</td>
                <td className="py-2 px-2">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLE[inv.status]}`}>
                    {inv.status === 'sent' ? 'pending' : inv.status}
                  </span>
                </td>
                <td className="py-2">
                  <div className="flex gap-1 justify-end items-center flex-wrap">
                    {inv.status !== 'draft' && (
                      <a href={`/api/invoices/${inv.id}/document?type=invoice`} target="_blank" rel="noopener"
                        className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded" title="Open the printable invoice">Invoice</a>
                    )}
                    {inv.status === 'paid' && (
                      <a href={`/api/invoices/${inv.id}/document?type=receipt`} target="_blank" rel="noopener"
                        className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded" title="Open the payment receipt">Receipt</a>
                    )}
                    {inv.status === 'draft' && (
                      <>
                        <button onClick={() => setInvoiceStatus(inv, 'sent')} disabled={busy === inv.id}
                          className="px-2 py-1 text-xs font-semibold bg-[#AEDE4A] hover:bg-[#9BCF3A] text-gray-900 rounded">Issue</button>
                        <button onClick={() => deleteInvoice(inv)} className="px-2 py-1 text-xs text-gray-400 hover:text-red-600 rounded">✕</button>
                      </>
                    )}
                    {inv.status === 'sent' && (
                      <button onClick={() => setInvoiceStatus(inv, 'paid')} disabled={busy === inv.id}
                        className="px-2 py-1 text-xs font-semibold bg-green-600 hover:bg-green-700 text-white rounded">Mark paid</button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {/* Add a manual invoice / deposit */}
        <form onSubmit={addInvoice} className="mt-3 flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[10rem]">
            <label className="block text-xs font-medium text-gray-600 mb-1">New invoice</label>
            <input value={invDesc} onChange={(e) => setInvDesc(e.target.value)} placeholder="e.g. Deposit"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#AEDE4A]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Net £</label>
            <input type="number" min="0" step="0.01" value={invNet} onChange={(e) => setInvNet(e.target.value)} placeholder="0.00"
              className="w-24 px-3 py-2 border border-gray-300 rounded-md text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#AEDE4A]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">VAT</label>
            <select value={invVat} onChange={(e) => setInvVat(Number(e.target.value))}
              className="px-2 py-2 border border-gray-300 rounded-md text-sm">
              <option value={20}>20%</option><option value={5}>5%</option><option value={0}>0%</option>
            </select>
          </div>
          <label className="flex items-center gap-1.5 text-xs text-gray-600 pb-2">
            <input type="checkbox" checked={invDeposit} onChange={(e) => setInvDeposit(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-[#83B81A]" />
            Deposit
          </label>
          <button type="submit" disabled={busy === 'new-inv' || !invDesc.trim()}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-md disabled:opacity-50">Add draft</button>
        </form>
      </div>
    </div>
  );
}
