import { useEffect, useState } from 'react';

interface Approval {
  id: string; description: string; est_cost: number | null; status: string;
  required_level: string; is_emergency: number; requested_by_name: string | null;
  approver_name: string | null; created_at: string;
}
interface Props {
  projectId: string;
  /** 'client' shows only client-level pending items with approve/decline; 'staff' shows all. */
  mode: 'client' | 'staff';
  canDecide?: boolean;
}

export default function ApprovalsInbox({ projectId, mode, canDecide }: Props) {
  const [items, setItems] = useState<Approval[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  async function load() {
    const res = await fetch(`/api/approvals?project_id=${projectId}`);
    if (res.ok) setItems(await res.json());
  }
  useEffect(() => { load(); }, [projectId]);

  async function decide(id: string, decision: 'approve' | 'reject') {
    setBusy(id);
    try {
      const res = await fetch(`/api/approvals/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision }),
      });
      if (res.ok) await load();
    } finally { setBusy(null); }
  }

  const visible = mode === 'client'
    ? items.filter((i) => i.required_level === 'client' || i.is_emergency || i.status !== 'pending')
    : items;

  const badge = (s: string) => {
    const map: Record<string, string> = {
      approved: 'bg-green-100 text-green-800', auto_approved: 'bg-green-100 text-green-800',
      rejected: 'bg-red-100 text-red-700', pending: 'bg-amber-100 text-amber-800',
      emergency: 'bg-orange-100 text-orange-800',
    };
    return map[s] || 'bg-gray-100 text-gray-700';
  };

  if (visible.length === 0) {
    return <p className="text-sm text-gray-400">No approval requests.</p>;
  }

  return (
    <div className="space-y-3">
      {visible.map((a) => (
        <div key={a.id} className="border border-gray-200 rounded-lg p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-gray-900">{a.description}</div>
              <div className="text-xs text-gray-500 mt-0.5">
                {a.est_cost != null ? `£${a.est_cost.toFixed(2)} · ` : ''}{a.requested_by_name || 'Team'}
                {a.is_emergency ? ' · ⚠️ emergency' : ''}
              </div>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded-full capitalize whitespace-nowrap ${badge(a.status)}`}>{a.status.replace('_', ' ')}</span>
          </div>
          {a.status === 'pending' && canDecide && (
            <div className="mt-3 flex gap-2">
              <button onClick={() => decide(a.id, 'approve')} disabled={busy === a.id}
                className="px-3 py-1.5 bg-[#AEDE4A] hover:bg-[#9BCF3A] text-gray-900 text-sm font-semibold rounded-md disabled:opacity-50">Approve</button>
              <button onClick={() => decide(a.id, 'reject')} disabled={busy === a.id}
                className="px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-sm rounded-md disabled:opacity-50">Decline</button>
            </div>
          )}
          {a.status !== 'pending' && a.approver_name && (
            <div className="mt-1 text-xs text-gray-400">By {a.approver_name}</div>
          )}
        </div>
      ))}
    </div>
  );
}
