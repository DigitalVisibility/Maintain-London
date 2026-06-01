import { useEffect, useState } from 'react';

interface Approval {
  id: string; description: string; est_cost: number | null; status: string;
  required_level: string; is_emergency: number; requested_by_name: string | null;
  approver_name: string | null; type: string; created_at: string;
}
interface Props {
  projectId: string;
  canRequest?: boolean;
  canDecide?: boolean;
}

const TYPES = [
  { v: 'additional_work', l: 'Additional work' },
  { v: 'extra_materials', l: 'Extra materials' },
  { v: 'variation', l: 'Variation' },
  { v: 'other', l: 'Other' },
];

export default function ApprovalsPanel({ projectId, canRequest, canDecide }: Props) {
  const [items, setItems] = useState<Approval[]>([]);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const [type, setType] = useState('additional_work');
  const [description, setDescription] = useState('');
  const [cost, setCost] = useState('');
  const [emergency, setEmergency] = useState(false);
  const [reason, setReason] = useState('');
  const [result, setResult] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/approvals?project_id=${projectId}`);
    if (res.ok) setItems(await res.json());
  }
  useEffect(() => { load(); }, [projectId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!description.trim()) return;
    setBusy('new'); setResult(null);
    try {
      const res = await fetch('/api/approvals', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId, type, description: description.trim(),
          est_cost: cost ? Number(cost) : undefined, is_emergency: emergency, reason: reason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        const msg = data.status === 'auto_approved' ? 'Auto-approved (within limit).'
          : data.status === 'emergency' ? 'Logged as emergency — team & client notified.'
          : `Sent for ${data.required_level} approval.`;
        setResult(msg);
        setDescription(''); setCost(''); setEmergency(false); setReason('');
        await load();
      } else {
        setResult(data.error || 'Failed to submit');
      }
    } finally { setBusy(null); }
  }

  async function decide(id: string, decision: 'approve' | 'reject') {
    setBusy(id);
    try {
      const res = await fetch(`/api/approvals/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ decision }),
      });
      if (res.ok) await load();
    } finally { setBusy(null); }
  }

  const badge = (s: string) => ({
    approved: 'bg-green-100 text-green-800', auto_approved: 'bg-green-100 text-green-800',
    rejected: 'bg-red-100 text-red-700', pending: 'bg-amber-100 text-amber-800',
    emergency: 'bg-orange-100 text-orange-800',
  } as Record<string, string>)[s] || 'bg-gray-100 text-gray-700';

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-sm font-semibold text-gray-900">Additional Works &amp; Approvals</h2>
        {canRequest && (
          <button onClick={() => setOpen(!open)} className="text-sm font-medium text-[#83B81A] hover:underline">
            {open ? 'Close' : '+ Request works'}
          </button>
        )}
      </div>

      {open && canRequest && (
        <form onSubmit={submit} className="mb-5 space-y-3 border border-gray-100 rounded-lg p-4 bg-gray-50">
          {result && <div className="text-sm text-gray-700 bg-white border border-gray-200 rounded-md px-3 py-2">{result}</div>}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <select value={type} onChange={(e) => setType(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md text-sm">
              {TYPES.map((t) => <option key={t.v} value={t.v}>{t.l}</option>)}
            </select>
            <input type="number" min="0" step="0.01" value={cost} onChange={(e) => setCost(e.target.value)} placeholder="Est. cost £" className="px-3 py-2 border border-gray-300 rounded-md text-sm" />
            <label className="flex items-center gap-2 text-sm text-gray-700 px-1">
              <input type="checkbox" checked={emergency} onChange={(e) => setEmergency(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-orange-500" />
              Emergency
            </label>
          </div>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={2} required placeholder="What's needed and why?" className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
          {emergency && (
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Emergency justification (required on site)" className="w-full px-3 py-2 border border-orange-200 rounded-md text-sm bg-orange-50" />
          )}
          <button type="submit" disabled={busy === 'new'} className="px-4 py-2 bg-[#AEDE4A] hover:bg-[#9BCF3A] text-gray-900 font-semibold rounded-md text-sm disabled:opacity-50">
            {busy === 'new' ? 'Submitting…' : emergency ? 'Log emergency & proceed' : 'Submit for approval'}
          </button>
        </form>
      )}

      {items.length === 0 ? (
        <p className="text-sm text-gray-400">No requests yet.</p>
      ) : (
        <div className="space-y-3">
          {items.map((a) => (
            <div key={a.id} className="border border-gray-200 rounded-lg p-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900">{a.description}</div>
                  <div className="text-xs text-gray-500 mt-0.5">
                    {a.est_cost != null ? `£${a.est_cost.toFixed(2)} · ` : ''}{a.requested_by_name || 'Team'}
                    {a.is_emergency ? ' · ⚠️ emergency' : ` · needs ${a.required_level} approval`}
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full capitalize whitespace-nowrap ${badge(a.status)}`}>{a.status.replace('_', ' ')}</span>
              </div>
              {a.status === 'pending' && canDecide && (
                <div className="mt-2 flex gap-2">
                  <button onClick={() => decide(a.id, 'approve')} disabled={busy === a.id} className="px-3 py-1 bg-[#AEDE4A] hover:bg-[#9BCF3A] text-gray-900 text-xs font-semibold rounded-md disabled:opacity-50">Approve</button>
                  <button onClick={() => decide(a.id, 'reject')} disabled={busy === a.id} className="px-3 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs rounded-md disabled:opacity-50">Decline</button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
