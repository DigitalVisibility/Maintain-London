import { useEffect, useState } from 'react';

/**
 * The variations register — the numbered, priced record of every change to the
 * job. Drafts (including ones auto-created from the site diary) get a cost and a
 * reword here, then are raised to the client for one-tap approval; approved ones
 * total up into the figure that changes the contract sum.
 */

type Status = 'draft' | 'pending' | 'approved' | 'rejected';

interface Variation {
  id: string;
  number: number;
  description: string;
  net: number;
  vat_rate: number;
  vat: number;
  total: number;
  status: Status;
  source_variation_id: string | null;
  raised_at: string | null;
  decided_at: string | null;
}

interface Summary {
  approved: { count: number; net: number; vat: number; total: number };
  pending: { count: number; net: number; vat: number; total: number };
  draft: { count: number };
  rejected: { count: number };
}

const money = (n: number) => `£${n.toFixed(2)}`;
const pad = (n: number) => String(n).padStart(4, '0');

const STATUS_STYLE: Record<Status, string> = {
  draft: 'bg-gray-100 text-gray-600',
  pending: 'bg-amber-100 text-amber-800',
  approved: 'bg-green-100 text-green-800',
  rejected: 'bg-red-100 text-red-700',
};

export default function VariationsRegister({ projectId }: { projectId: string }) {
  const [variations, setVariations] = useState<Variation[] | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  // New-draft form
  const [desc, setDesc] = useState('');
  const [net, setNet] = useState('');
  const [vatRate, setVatRate] = useState(20);

  // Inline edit
  const [editId, setEditId] = useState<string | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editNet, setEditNet] = useState('');
  const [editVat, setEditVat] = useState(20);

  async function load() {
    const res = await fetch(`/api/variations?project_id=${projectId}`);
    if (res.ok) {
      const data = await res.json();
      setVariations(data.variations);
      setSummary(data.summary);
    }
  }
  useEffect(() => { load(); }, [projectId]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    if (!desc.trim()) return;
    setBusy('new');
    try {
      const res = await fetch('/api/variations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          description: desc.trim(),
          net: Number(net) || 0,
          vat_rate: vatRate,
        }),
      });
      if (res.ok) { setDesc(''); setNet(''); setVatRate(20); await load(); }
    } finally { setBusy(''); }
  }

  function startEdit(v: Variation) {
    setEditId(v.id);
    setEditDesc(v.description);
    setEditNet(String(v.net));
    setEditVat(v.vat_rate);
  }

  async function saveEdit(v: Variation) {
    setBusy(v.id);
    try {
      await fetch(`/api/variations/${v.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ description: editDesc.trim(), net: Number(editNet) || 0, vat_rate: editVat }),
      });
      setEditId(null);
      await load();
    } finally { setBusy(''); }
  }

  async function raise(v: Variation) {
    if (v.net <= 0 && !confirm('This variation has no cost. Raise it anyway?')) return;
    if (!confirm(`Raise variation ${pad(v.number)} for approval?\n\n"${v.description}" — ${money(v.total)}`)) return;
    setBusy(v.id);
    setMsg(null);
    try {
      const res = await fetch(`/api/variations/${v.id}`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed');
      setMsg({
        tone: 'ok',
        text: data.status === 'approved'
          ? 'Auto-approved within the project limit.'
          : 'Raised — the client has been sent a one-tap approval link.',
      });
      await load();
    } catch (err: any) {
      setMsg({ tone: 'bad', text: err.message });
    } finally { setBusy(''); }
  }

  async function discard(v: Variation) {
    if (!confirm(`Delete draft ${pad(v.number)}?`)) return;
    setBusy(v.id);
    try {
      await fetch(`/api/variations/${v.id}`, { method: 'DELETE' });
      await load();
    } finally { setBusy(''); }
  }

  if (!variations || !summary) return <p className="text-sm text-gray-500">Loading…</p>;

  const draftsNeedingPrice = variations.filter((v) => v.status === 'draft' && v.net <= 0).length;

  return (
    <div className="space-y-4">
      {msg && (
        <div className={`text-sm rounded-md px-3 py-2 ${
          msg.tone === 'ok' ? 'bg-green-50 text-green-800 border border-green-200'
                            : 'bg-red-50 text-red-700 border border-red-200'
        }`}>{msg.text}</div>
      )}

      {/* Running totals — approved is what changes the contract sum */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="text-xs text-gray-500">Approved</div>
          <div className="text-lg font-bold text-green-700">{money(summary.approved.total)}</div>
          <div className="text-xs text-gray-400">{summary.approved.count} · net {money(summary.approved.net)}</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="text-xs text-gray-500">Awaiting client</div>
          <div className="text-lg font-bold text-amber-700">{money(summary.pending.total)}</div>
          <div className="text-xs text-gray-400">{summary.pending.count} pending</div>
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="text-xs text-gray-500">Drafts</div>
          <div className="text-lg font-bold text-gray-700">{summary.draft.count}</div>
          {draftsNeedingPrice > 0 && <div className="text-xs text-amber-600">{draftsNeedingPrice} need pricing</div>}
        </div>
        <div className="bg-white rounded-lg border border-gray-200 p-3">
          <div className="text-xs text-gray-500">Rejected</div>
          <div className="text-lg font-bold text-gray-400">{summary.rejected.count}</div>
        </div>
      </div>

      {/* The register */}
      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-xs uppercase text-gray-400 border-b border-gray-100">
              <th className="text-left px-3 py-2">#</th>
              <th className="text-left px-3 py-2">Description</th>
              <th className="text-right px-3 py-2">Net</th>
              <th className="text-right px-3 py-2">VAT</th>
              <th className="text-right px-3 py-2">Total</th>
              <th className="text-left px-3 py-2">Status</th>
              <th className="px-3 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {variations.length === 0 && (
              <tr><td colSpan={7} className="px-3 py-6 text-center text-sm text-gray-400">
                No variations yet. Add one below, or note one on the site diary and it lands here as a draft.
              </td></tr>
            )}
            {variations.map((v) => (
              <tr key={v.id} className="border-b border-gray-50 last:border-0">
                {editId === v.id ? (
                  <>
                    <td className="px-3 py-2 font-mono text-gray-500">{pad(v.number)}</td>
                    <td className="px-3 py-2">
                      <input value={editDesc} onChange={(e) => setEditDesc(e.target.value)}
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm" />
                    </td>
                    <td className="px-3 py-2" colSpan={2}>
                      <div className="flex items-center gap-1 justify-end">
                        <span className="text-gray-400">£</span>
                        <input type="number" value={editNet} onChange={(e) => setEditNet(e.target.value)} min="0" step="0.01"
                          className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-right" />
                        <select value={editVat} onChange={(e) => setEditVat(Number(e.target.value))}
                          className="px-1 py-1 border border-gray-300 rounded text-sm">
                          <option value={20}>20%</option>
                          <option value={5}>5%</option>
                          <option value={0}>0%</option>
                        </select>
                      </div>
                    </td>
                    <td className="px-3 py-2 text-right text-gray-400">—</td>
                    <td className="px-3 py-2" colSpan={2}>
                      <div className="flex gap-1 justify-end">
                        <button onClick={() => saveEdit(v)} disabled={busy === v.id}
                          className="px-2 py-1 bg-[#83B81A] text-white rounded text-xs font-semibold">Save</button>
                        <button onClick={() => setEditId(null)}
                          className="px-2 py-1 bg-gray-100 text-gray-600 rounded text-xs">Cancel</button>
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-3 py-2 font-mono text-gray-500">{pad(v.number)}</td>
                    <td className="px-3 py-2 text-gray-900">
                      {v.description}
                      {v.source_variation_id && (
                        <span className="ml-2 text-xs text-gray-400" title="Raised from the site diary">· from diary</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right text-gray-700">{money(v.net)}</td>
                    <td className="px-3 py-2 text-right text-gray-400">{money(v.vat)} <span className="text-xs">({v.vat_rate}%)</span></td>
                    <td className="px-3 py-2 text-right font-medium text-gray-900">{money(v.total)}</td>
                    <td className="px-3 py-2">
                      <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium capitalize ${STATUS_STYLE[v.status]}`}>{v.status}</span>
                    </td>
                    <td className="px-3 py-2">
                      {v.status === 'draft' && (
                        <div className="flex gap-1 justify-end">
                          <button onClick={() => startEdit(v)} className="px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 rounded">Edit</button>
                          <button onClick={() => raise(v)} disabled={busy === v.id}
                            className="px-2 py-1 text-xs font-semibold bg-[#AEDE4A] hover:bg-[#9BCF3A] text-gray-900 rounded">Raise</button>
                          <button onClick={() => discard(v)} className="px-2 py-1 text-xs text-gray-400 hover:text-red-600 rounded">✕</button>
                        </div>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Add + export */}
      <div className="flex flex-wrap items-end gap-3">
        <form onSubmit={add} className="flex flex-wrap items-end gap-2 flex-1">
          <div className="flex-1 min-w-[12rem]">
            <label className="block text-xs font-medium text-gray-600 mb-1">New variation</label>
            <input value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Description of the change"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#AEDE4A]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Net £</label>
            <input type="number" value={net} onChange={(e) => setNet(e.target.value)} min="0" step="0.01" placeholder="0.00"
              className="w-24 px-3 py-2 border border-gray-300 rounded-md text-sm text-right focus:outline-none focus:ring-2 focus:ring-[#AEDE4A]" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">VAT</label>
            <select value={vatRate} onChange={(e) => setVatRate(Number(e.target.value))}
              className="px-2 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#AEDE4A]">
              <option value={20}>20%</option>
              <option value={5}>5%</option>
              <option value={0}>0%</option>
            </select>
          </div>
          <button type="submit" disabled={busy === 'new' || !desc.trim()}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-md disabled:opacity-50">Add draft</button>
        </form>

        <a href={`/api/variations/export?project_id=${projectId}`}
          className="px-3 py-2 text-sm font-medium text-[#83B81A] border border-[#AEDE4A] rounded-md hover:bg-[#AEDE4A]/10">
          Export CSV
        </a>
      </div>
    </div>
  );
}
