import { useEffect, useState } from 'react';

interface Props { token: string; }
interface Req {
  valid: boolean; description?: string; est_cost?: number | null; status?: string;
  is_emergency?: boolean; requested_by?: string | null; project_name?: string;
}

export default function ApproveByToken({ token }: Props) {
  const [req, setReq] = useState<Req | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/approvals/decide?token=${encodeURIComponent(token)}`)
      .then((r) => r.json()).then(setReq).catch(() => setReq({ valid: false }));
  }, [token]);

  async function decide(decision: 'approve' | 'reject') {
    setBusy(true);
    try {
      const res = await fetch('/api/approvals/decide', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, decision }),
      });
      const data = await res.json();
      setDone(data.status || (decision === 'reject' ? 'rejected' : 'approved'));
    } catch {
      setDone('error');
    } finally { setBusy(false); }
  }

  if (!req) return <div className="bg-white rounded-lg border border-gray-200 p-8 text-sm text-gray-500">Loading…</div>;
  if (!req.valid) return <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-500">This approval link is invalid or has expired.</div>;

  const decided = done || (req.status === 'approved' || req.status === 'rejected' ? req.status : null);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-8">
      {req.is_emergency && (
        <div className="mb-4 text-sm bg-amber-50 border border-amber-200 text-amber-800 px-3 py-2 rounded-md">
          Emergency / make-safe works — already underway, for your acknowledgement.
        </div>
      )}
      <div className="text-xs uppercase tracking-wide text-gray-400">{req.project_name}</div>
      <h2 className="text-lg font-semibold text-gray-900 mt-1">Additional works request</h2>
      <p className="text-sm text-gray-700 mt-3">{req.description}</p>
      {req.est_cost != null && <p className="text-sm text-gray-900 mt-2 font-medium">Estimated cost: £{req.est_cost.toFixed(2)}</p>}
      {req.requested_by && <p className="text-xs text-gray-400 mt-1">Requested by {req.requested_by}</p>}

      {decided ? (
        <div className={`mt-6 text-sm font-medium ${decided === 'approved' || decided === 'emergency' ? 'text-green-600' : decided === 'rejected' ? 'text-red-600' : 'text-gray-600'}`}>
          {decided === 'approved' ? '✓ Approved — thank you.' : decided === 'rejected' ? 'Declined.' : decided === 'error' ? 'Something went wrong, please try again.' : 'Recorded.'}
        </div>
      ) : (
        <div className="mt-6 flex gap-3">
          <button onClick={() => decide('approve')} disabled={busy} className="px-5 py-2.5 bg-[#AEDE4A] hover:bg-[#9BCF3A] text-gray-900 font-semibold rounded-md text-sm disabled:opacity-50">
            {req.is_emergency ? 'Acknowledge' : 'Approve'}
          </button>
          {!req.is_emergency && (
            <button onClick={() => decide('reject')} disabled={busy} className="px-5 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-md text-sm disabled:opacity-50">
              Decline
            </button>
          )}
        </div>
      )}
    </div>
  );
}
