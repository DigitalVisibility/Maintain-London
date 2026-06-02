import { useEffect, useState } from 'react';

interface Org { id: string; name: string; brand_color: string; logo_url: string | null; project_count: number; member_count: number; }

export default function AgencyDashboard() {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [ownerEmail, setOwnerEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch('/api/org');
    if (res.ok) setOrgs(await res.json());
  }
  useEffect(() => { load(); }, []);

  async function enter(orgId: string) {
    setBusy(true);
    try {
      const res = await fetch('/api/org/switch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ org_id: orgId }),
      });
      if (res.ok) window.location.href = '/project-hub/';
    } finally { setBusy(false); }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/org', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, owner_email: ownerEmail || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create');
      setMsg(ownerEmail ? (data.ownerInvited ? `Business created and owner invited.` : `Business created. (Owner email failed — invite them from inside.)`) : 'Business created.');
      setName(''); setOwnerEmail(''); setOpen(false);
      load();
    } catch (err: any) {
      setMsg(err.message);
    } finally { setBusy(false); }
  }

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={() => setOpen(!open)} className="px-4 py-2 bg-[#AEDE4A] hover:bg-[#9BCF3A] text-gray-900 font-semibold rounded-md text-sm">
          {open ? 'Close' : '+ Create business'}
        </button>
      </div>

      {msg && <div className="text-sm text-white bg-gray-800 border border-gray-700 rounded-md px-3 py-2">{msg}</div>}

      {open && (
        <form onSubmit={create} className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-3">
          <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Business name"
            className="w-full px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-white text-sm" />
          <input value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} type="email" placeholder="Owner's email (optional — invites them as owner)"
            className="w-full px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-white text-sm" />
          <button type="submit" disabled={busy} className="px-4 py-2 bg-[#AEDE4A] hover:bg-[#9BCF3A] text-gray-900 font-semibold rounded-md text-sm disabled:opacity-50">
            {busy ? 'Creating…' : 'Create business'}
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {orgs.map((o) => (
          <div key={o.id} className="bg-white rounded-lg p-5 flex flex-col">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center text-white font-bold" style={{ background: o.brand_color }}>
                {o.name.charAt(0).toUpperCase()}
              </div>
              <div className="font-semibold text-gray-900">{o.name}</div>
            </div>
            <div className="text-xs text-gray-500 mb-4">{o.project_count} project{o.project_count === 1 ? '' : 's'} · {o.member_count} member{o.member_count === 1 ? '' : 's'}</div>
            <button onClick={() => enter(o.id)} disabled={busy} className="mt-auto px-4 py-2 bg-gray-900 hover:bg-black text-white text-sm font-semibold rounded-md disabled:opacity-50">
              Enter →
            </button>
          </div>
        ))}
        {orgs.length === 0 && <div className="text-gray-400 text-sm">No businesses yet. Create your first one.</div>}
      </div>
    </div>
  );
}
