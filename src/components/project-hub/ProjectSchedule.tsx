import { useEffect, useState } from 'react';

/**
 * Project schedules — the programme, procurement and financial wireframes.
 *
 * Programme is a lightweight Gantt: each task is a bar placed across the project's
 * date span. Procurement tracks what to order, from whom, by when. The financial
 * schedule reuses the Phase 4 valuation and invoices — the real payment timeline,
 * not a second copy.
 */

type Tab = 'programme' | 'procurement' | 'financial';

interface Task {
  id: string; name: string; start_date: string | null; end_date: string | null;
  status: string; client_visible: number;
}
interface Item {
  id: string; item: string; supplier: string | null; required_by: string | null;
  status: string; notes: string | null; client_visible: number;
}

const money = (n: number) => `£${(n ?? 0).toFixed(2)}`;
const dayMs = 86_400_000;
const parse = (d: string | null) => d ? Date.parse(d + 'T00:00:00Z') : NaN;
const fmt = (d: string | null) => {
  if (!d) return '—';
  const t = parse(d);
  return isNaN(t) ? d : new Date(t).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
};

const TASK_STATUS: Record<string, { label: string; bar: string; dot: string }> = {
  not_started: { label: 'Not started', bar: 'bg-gray-300', dot: 'bg-gray-400' },
  in_progress: { label: 'In progress', bar: 'bg-[#AEDE4A]', dot: 'bg-[#83B81A]' },
  complete: { label: 'Complete', bar: 'bg-green-500', dot: 'bg-green-600' },
};
const PROC_STATUS: Record<string, string> = {
  to_order: 'bg-gray-100 text-gray-600', ordered: 'bg-amber-100 text-amber-800', delivered: 'bg-green-100 text-green-800',
};

export default function ProjectSchedule({ projectId, canManage, canViewCosts, clientView }: { projectId: string; canManage: boolean; canViewCosts: boolean; clientView?: boolean }) {
  const [tab, setTab] = useState<Tab>('programme');

  // The client sees just the programme — procurement is internal, and the
  // financial schedule lives in their financial summary cards.
  if (clientView) return <Programme projectId={projectId} canManage={false} />;

  return (
    <div>
      <div className="flex gap-1 mb-4 border-b border-gray-200">
        {(['programme', 'procurement', ...(canViewCosts ? ['financial'] as Tab[] : [])] as Tab[]).map((t) => (
          <button key={t} type="button" onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium capitalize border-b-2 -mb-px transition-colors ${
              tab === t ? 'border-[#83B81A] text-[#83B81A]' : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}>
            {t === 'financial' ? 'Financial schedule' : t}
          </button>
        ))}
      </div>
      {tab === 'programme' && <Programme projectId={projectId} canManage={canManage} />}
      {tab === 'procurement' && <Procurement projectId={projectId} canManage={canManage} />}
      {tab === 'financial' && canViewCosts && <FinancialSchedule projectId={projectId} />}
    </div>
  );
}

// ── Programme (Gantt) ──────────────────────────────────────────────────────
function Programme({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [name, setName] = useState(''); const [start, setStart] = useState(''); const [end, setEnd] = useState('');
  const [busy, setBusy] = useState('');

  async function load() { const r = await fetch(`/api/programme?project_id=${projectId}`); if (r.ok) setTasks(await r.json()); }
  useEffect(() => { load(); }, [projectId]);

  async function add(e: React.FormEvent) {
    e.preventDefault(); if (!name.trim()) return; setBusy('new');
    try {
      await fetch('/api/programme', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, name: name.trim(), start_date: start || null, end_date: end || null }) });
      setName(''); setStart(''); setEnd(''); await load();
    } finally { setBusy(''); }
  }
  async function patch(t: Task, p: Partial<Task> & { client_visible?: boolean }) {
    setBusy(t.id);
    try { await fetch(`/api/programme/${t.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) }); await load(); }
    finally { setBusy(''); }
  }
  async function del(t: Task) { if (!confirm(`Delete "${t.name}"?`)) return; setBusy(t.id); try { await fetch(`/api/programme/${t.id}`, { method: 'DELETE' }); await load(); } finally { setBusy(''); } }

  if (!tasks) return <p className="text-sm text-gray-500">Loading…</p>;

  const dated = tasks.filter((t) => !isNaN(parse(t.start_date)) && !isNaN(parse(t.end_date)));
  const min = Math.min(...dated.map((t) => parse(t.start_date)));
  const max = Math.max(...dated.map((t) => parse(t.end_date)));
  const span = Math.max(dayMs, max - min);

  return (
    <div className="space-y-4">
      {tasks.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-400">
          No programme yet.{canManage ? ' Add the stages of the job below.' : ''}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-2 overflow-x-auto">
          {tasks.map((t) => {
            const hasDates = !isNaN(parse(t.start_date)) && !isNaN(parse(t.end_date));
            const left = hasDates ? ((parse(t.start_date) - min) / span) * 100 : 0;
            const width = hasDates ? Math.max(3, ((parse(t.end_date) - parse(t.start_date) + dayMs) / span) * 100) : 0;
            const st = TASK_STATUS[t.status] ?? TASK_STATUS.not_started;
            return (
              <div key={t.id} className="grid grid-cols-[minmax(9rem,14rem)_1fr_auto] items-center gap-3 min-w-[32rem]">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate flex items-center gap-1.5">
                    <span className={`inline-block h-2 w-2 rounded-full ${st.dot} flex-shrink-0`} />{t.name}
                  </div>
                  <div className="text-xs text-gray-400">{fmt(t.start_date)} – {fmt(t.end_date)}</div>
                </div>
                <div className="relative h-5 bg-gray-50 rounded">
                  {hasDates && (
                    <div className={`absolute top-0 h-5 rounded ${st.bar}`} style={{ left: `${left}%`, width: `${width}%` }}
                      title={`${st.label}: ${fmt(t.start_date)} – ${fmt(t.end_date)}`} />
                  )}
                  {!hasDates && <span className="absolute inset-0 flex items-center pl-2 text-xs text-gray-400">no dates set</span>}
                </div>
                {canManage ? (
                  <div className="flex items-center gap-1">
                    <select value={t.status} disabled={busy === t.id} onChange={(e) => patch(t, { status: e.target.value })}
                      className="text-xs border border-gray-200 rounded px-1 py-1">
                      <option value="not_started">Not started</option><option value="in_progress">In progress</option><option value="complete">Complete</option>
                    </select>
                    <button type="button" onClick={() => patch(t, { client_visible: !t.client_visible })} title={t.client_visible ? 'Client can see' : 'Hidden from client'}
                      className={`text-xs px-1.5 py-1 rounded ${t.client_visible ? 'text-[#5f8410]' : 'text-gray-300'}`}>👁</button>
                    <button type="button" onClick={() => del(t)} className="text-gray-300 hover:text-red-500 text-xs px-1">✕</button>
                  </div>
                ) : <span className="text-xs text-gray-400">{st.label}</span>}
              </div>
            );
          })}
        </div>
      )}

      {canManage && (
        <form onSubmit={add} className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[10rem]">
            <label className="block text-xs font-medium text-gray-600 mb-1">Task / stage</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Strip out"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#AEDE4A]" />
          </div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Start</label>
            <input type="date" value={start} onChange={(e) => setStart(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md text-sm" /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">End</label>
            <input type="date" value={end} onChange={(e) => setEnd(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md text-sm" /></div>
          <button type="submit" disabled={busy === 'new' || !name.trim()}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-md disabled:opacity-50">Add</button>
        </form>
      )}
    </div>
  );
}

// ── Procurement ─────────────────────────────────────────────────────────────
function Procurement({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [item, setItem] = useState(''); const [supplier, setSupplier] = useState(''); const [reqBy, setReqBy] = useState('');
  const [busy, setBusy] = useState('');

  async function load() { const r = await fetch(`/api/procurement?project_id=${projectId}`); if (r.ok) setItems(await r.json()); }
  useEffect(() => { load(); }, [projectId]);

  async function add(e: React.FormEvent) {
    e.preventDefault(); if (!item.trim()) return; setBusy('new');
    try {
      await fetch('/api/procurement', { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, item: item.trim(), supplier: supplier || null, required_by: reqBy || null }) });
      setItem(''); setSupplier(''); setReqBy(''); await load();
    } finally { setBusy(''); }
  }
  async function patch(it: Item, p: any) { setBusy(it.id); try { await fetch(`/api/procurement/${it.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(p) }); await load(); } finally { setBusy(''); } }
  async function del(it: Item) { if (!confirm(`Delete "${it.item}"?`)) return; setBusy(it.id); try { await fetch(`/api/procurement/${it.id}`, { method: 'DELETE' }); await load(); } finally { setBusy(''); } }

  if (!items) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm min-w-[36rem]">
          <thead><tr className="text-xs uppercase text-gray-400 border-b border-gray-100">
            <th className="text-left px-3 py-2">Item</th><th className="text-left px-3 py-2">Supplier</th>
            <th className="text-left px-3 py-2">Required by</th><th className="text-left px-3 py-2">Status</th><th className="px-3 py-2"></th>
          </tr></thead>
          <tbody>
            {items.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-400">Nothing to order yet.</td></tr>}
            {items.map((it) => (
              <tr key={it.id} className="border-b border-gray-50 last:border-0">
                <td className="px-3 py-2 text-gray-900">{it.item}</td>
                <td className="px-3 py-2 text-gray-600">{it.supplier || '—'}</td>
                <td className="px-3 py-2 text-gray-600">{fmt(it.required_by)}</td>
                <td className="px-3 py-2">
                  {canManage ? (
                    <select value={it.status} disabled={busy === it.id} onChange={(e) => patch(it, { status: e.target.value })}
                      className={`text-xs rounded-full px-2 py-0.5 ${PROC_STATUS[it.status]}`}>
                      <option value="to_order">To order</option><option value="ordered">Ordered</option><option value="delivered">Delivered</option>
                    </select>
                  ) : <span className={`text-xs rounded-full px-2 py-0.5 capitalize ${PROC_STATUS[it.status]}`}>{it.status.replace('_', ' ')}</span>}
                </td>
                <td className="px-3 py-2 text-right">
                  {canManage && (
                    <div className="flex gap-1 justify-end">
                      <button type="button" onClick={() => patch(it, { client_visible: !it.client_visible })} title={it.client_visible ? 'Client can see' : 'Internal'}
                        className={`text-xs px-1.5 py-1 rounded ${it.client_visible ? 'text-[#5f8410]' : 'text-gray-300'}`}>👁</button>
                      <button type="button" onClick={() => del(it)} className="text-gray-300 hover:text-red-500 text-xs px-1">✕</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {canManage && (
        <form onSubmit={add} className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[10rem]"><label className="block text-xs font-medium text-gray-600 mb-1">Item</label>
            <input value={item} onChange={(e) => setItem(e.target.value)} placeholder="e.g. Kitchen units"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-[#AEDE4A]" /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Supplier</label>
            <input value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Howdens"
              className="px-3 py-2 border border-gray-300 rounded-md text-sm" /></div>
          <div><label className="block text-xs font-medium text-gray-600 mb-1">Required by</label>
            <input type="date" value={reqBy} onChange={(e) => setReqBy(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md text-sm" /></div>
          <button type="submit" disabled={busy === 'new' || !item.trim()}
            className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm font-medium rounded-md disabled:opacity-50">Add</button>
        </form>
      )}
    </div>
  );
}

// ── Financial schedule (reuses Phase 4) ─────────────────────────────────────
function FinancialSchedule({ projectId }: { projectId: string }) {
  const [data, setData] = useState<any>(null);
  useEffect(() => { fetch(`/api/financials?project_id=${projectId}`).then((r) => r.ok ? r.json() : null).then(setData); }, [projectId]);
  if (!data) return <p className="text-sm text-gray-500">Loading…</p>;
  const v = data.valuation;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Stat label="Revised contract" value={money(v.revised.total)} />
        <Stat label="Value complete" value={money(v.valueComplete.total)} sub={`${v.percentComplete}%`} />
        <Stat label="Paid to date" value={money(v.paidToDate.total)} accent="text-green-700" />
        <Stat label="Next due" value={money(v.nextInstalment.total)} accent="text-[#5f8410]" />
      </div>
      <div className="bg-white rounded-lg border border-gray-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="text-xs uppercase text-gray-400 border-b border-gray-100">
            <th className="text-left px-3 py-2">Invoice</th><th className="text-left px-3 py-2">Description</th>
            <th className="text-right px-3 py-2">Total</th><th className="text-left px-3 py-2">Status</th><th className="text-left px-3 py-2">Date</th>
          </tr></thead>
          <tbody>
            {data.invoices.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-sm text-gray-400">No invoices raised yet.</td></tr>}
            {data.invoices.map((inv: any) => (
              <tr key={inv.id} className="border-b border-gray-50 last:border-0">
                <td className="px-3 py-2 font-mono text-gray-500">{String(inv.number).padStart(4, '0')}</td>
                <td className="px-3 py-2 text-gray-900">{inv.description}</td>
                <td className="px-3 py-2 text-right tabular-nums font-medium">{money(inv.total)}</td>
                <td className="px-3 py-2"><span className={`text-xs rounded-full px-2 py-0.5 ${inv.status === 'paid' ? 'bg-green-100 text-green-800' : inv.status === 'sent' ? 'bg-amber-100 text-amber-800' : 'bg-gray-100 text-gray-500'}`}>{inv.status === 'sent' ? 'pending' : inv.status}</span></td>
                <td className="px-3 py-2 text-gray-500 text-xs">{(inv.paid_at || inv.issued_at || '').split(' ')[0] || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">The financial schedule is your invoices and the live valuation — manage them in the Financials section above.</p>
    </div>
  );
}

function Stat({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className={`text-lg font-bold ${accent ?? 'text-gray-900'}`}>{value}</div>
      {sub && <div className="text-xs text-gray-400">{sub}</div>}
    </div>
  );
}
