import { useEffect, useState } from 'react';
import type { Person } from '../../types/diary';

interface RotaRow {
  id: string;
  person_id: string;
  name: string;
  person_role: string;
  company: string | null;
  days: string | null;         // override, else null
  start_time: string | null;
  end_time: string | null;
  default_days: string | null;
  default_start: string | null;
  default_end: string | null;
}

const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

/** Assign people to this site and see their expected days/hours (defaults, or a per-site override). */
export default function RotaManager({ projectId }: { projectId: string }) {
  const [rota, setRota] = useState<RotaRow[]>([]);
  const [roster, setRoster] = useState<Person[]>([]);
  const [addId, setAddId] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const [r, p] = await Promise.all([
      fetch(`/api/rota?project_id=${projectId}`).then((x) => (x.ok ? x.json() : [])),
      fetch('/api/people').then((x) => (x.ok ? x.json() : [])),
    ]);
    setRota(r); setRoster(p);
  }
  useEffect(() => { load(); }, []);

  async function assign() {
    if (!addId) return;
    setBusy(true);
    try {
      await fetch('/api/rota', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ project_id: projectId, person_id: addId }),
      });
      setAddId('');
      await load();
    } finally { setBusy(false); }
  }

  async function remove(id: string) {
    if (!confirm('Remove this person from the site rota?')) return;
    await fetch(`/api/rota/${id}`, { method: 'DELETE' });
    load();
  }

  const assignedIds = new Set(rota.map((r) => r.person_id));
  const available = roster.filter((p) => !assignedIds.has(p.id));

  // The effective expected pattern = override if set, else the person's default.
  const effDays = (r: RotaRow) => (r.days ?? r.default_days ?? '1,2,3,4,5').split(',').map(Number).filter(Boolean);
  const effTime = (r: RotaRow) => {
    const s = r.start_time ?? r.default_start;
    const e = r.end_time ?? r.default_end;
    return s && e ? `${s}–${e}` : 'hours not set';
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-gray-500">
        Who's expected on this site. Each person uses their default working pattern unless you set one just for this job.
      </p>

      {/* Assign */}
      <div className="flex items-center gap-2">
        <select value={addId} onChange={(e) => setAddId(e.target.value)} className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm">
          <option value="">Add someone to this site…</option>
          {available.map((p) => <option key={p.id} value={p.id}>{p.name}{p.company ? ` (${p.company})` : ''}</option>)}
        </select>
        <button onClick={assign} disabled={!addId || busy} className="px-4 py-2 bg-[#AEDE4A] hover:bg-[#9BCF3A] text-gray-900 font-semibold rounded-md text-sm disabled:opacity-50">
          Assign
        </button>
      </div>

      {/* Assigned list */}
      {rota.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No one assigned to this site yet.</p>
      ) : (
        <div className="divide-y divide-gray-100 border border-gray-200 rounded-md">
          {rota.map((r) => {
            const days = effDays(r);
            return (
              <div key={r.id} className="flex items-center justify-between gap-3 px-3 py-2.5">
                <div className="min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{r.name}{r.company ? <span className="text-gray-400 font-normal"> · {r.company}</span> : null}</div>
                  <div className="flex items-center gap-1.5 mt-1">
                    {DAY_LABELS.map((d, i) => (
                      <span key={d} className={`text-[10px] px-1 py-0.5 rounded ${days.includes(i + 1) ? 'bg-[#AEDE4A]/30 text-[#5f7f28]' : 'bg-gray-100 text-gray-300'}`}>{d}</span>
                    ))}
                    <span className="text-xs text-gray-500 ml-2">{effTime(r)}</span>
                  </div>
                </div>
                <button onClick={() => remove(r.id)} className="text-xs text-gray-400 hover:text-red-500 shrink-0">Remove</button>
              </div>
            );
          })}
        </div>
      )}
      {roster.length === 0 && (
        <p className="text-xs text-gray-400">Add people to your workforce first (Settings → Workforce) to assign them here.</p>
      )}
    </div>
  );
}
