import { useEffect, useState } from 'react';

interface Member { user_id: string; name: string; email: string; role: string; sees_financials: number; }
interface Invite { id: string; email: string; name: string | null; role: string; token: string; project_id: string | null; }
interface ProjectLite { id: string; name: string; }

const ROLES = ['operative', 'manager', 'admin', 'client'] as const;

export default function TeamManager() {
  const [members, setMembers] = useState<Member[]>([]);
  const [invites, setInvites] = useState<Invite[]>([]);
  const [projects, setProjects] = useState<ProjectLite[]>([]);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<string>('operative');
  const [projectId, setProjectId] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const [m, i, p] = await Promise.all([
      fetch('/api/members').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/invitations').then((r) => (r.ok ? r.json() : [])),
      fetch('/api/projects').then((r) => (r.ok ? r.json() : [])),
    ]);
    setMembers(m); setInvites(i); setProjects(p);
  }
  useEffect(() => { load(); }, []);

  async function sendInvite(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/invitations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, name, role, project_id: role === 'client' ? projectId : undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send invite');
      setMsg({
        kind: 'ok',
        text: data.emailed ? `Invite emailed to ${email}.` : `Invite created. Email may have failed — share this link: ${data.acceptUrl}`,
      });
      setEmail(''); setName(''); setProjectId('');
      load();
    } catch (err: any) {
      setMsg({ kind: 'err', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function changeRole(userId: string, newRole: string) {
    await fetch(`/api/members/${userId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ role: newRole }),
    });
    load();
  }
  async function setFinancials(userId: string, sees: boolean) {
    // Optimistic — flip the row now, reconcile on reload.
    setMembers((ms) => ms.map((m) => m.user_id === userId ? { ...m, sees_financials: sees ? 1 : 0 } : m));
    await fetch(`/api/members/${userId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sees_financials: sees }),
    });
    load();
  }
  async function removeMember(userId: string) {
    if (!confirm('Remove this person from the business?')) return;
    await fetch(`/api/members/${userId}`, { method: 'DELETE' });
    load();
  }
  async function revokeInvite(token: string) {
    await fetch(`/api/invitations/${encodeURIComponent(token)}`, { method: 'DELETE' });
    load();
  }
  function copyLink(token: string) {
    const url = `${window.location.origin}/project-hub/accept?token=${encodeURIComponent(token)}`;
    navigator.clipboard?.writeText(url);
    setMsg({ kind: 'ok', text: 'Invite link copied to clipboard.' });
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Invite form */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Invite someone</h2>
        {msg && (
          <div className={`mb-3 text-sm px-3 py-2 rounded-md break-words ${msg.kind === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{msg.text}</div>
        )}
        <form onSubmit={sendInvite} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="px-3 py-2 border border-gray-300 rounded-md text-sm" />
          <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name (optional)" className="px-3 py-2 border border-gray-300 rounded-md text-sm" />
          <select value={role} onChange={(e) => setRole(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md text-sm capitalize">
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          {role === 'client' && (
            <select required value={projectId} onChange={(e) => setProjectId(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md text-sm">
              <option value="">Select project…</option>
              {projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          )}
          <div className="sm:col-span-2">
            <button type="submit" disabled={busy} className="px-5 py-2 bg-[#AEDE4A] hover:bg-[#9BCF3A] text-gray-900 font-semibold rounded-md text-sm disabled:opacity-50">
              {busy ? 'Sending…' : 'Send invite'}
            </button>
          </div>
        </form>
      </div>

      {/* Members */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Team & clients ({members.length})</h2>
        <div className="divide-y divide-gray-100">
          {members.map((m) => (
            <div key={m.user_id} className="flex items-center gap-3 py-2.5">
              <div className="w-8 h-8 rounded-full bg-[#AEDE4A]/20 flex items-center justify-center text-[#6B8F2E] text-sm font-semibold">
                {m.name?.charAt(0)?.toUpperCase() || 'U'}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{m.name}</div>
                <div className="text-xs text-gray-500 truncate">{m.email}</div>
              </div>
              {/* Sees financials — quotes, invoices, variations, the valuation.
                  Owners/admins always do; clients never; managers/operatives are
                  a per-person grant the owner controls. */}
              {m.role === 'client' ? (
                <span className="text-xs text-gray-300 w-24 text-center hidden sm:inline" title="Clients never see financials">—</span>
              ) : m.role === 'owner' || m.role === 'admin' ? (
                <span className="text-xs text-gray-400 w-24 text-center hidden sm:inline" title="Owners and admins always see financials">Financials ✓</span>
              ) : (
                <label className="text-xs text-gray-600 w-24 flex items-center justify-center gap-1.5 cursor-pointer select-none" title="Let this person see quotes, invoices, variations and the valuation">
                  <input type="checkbox" checked={!!m.sees_financials} onChange={(e) => setFinancials(m.user_id, e.target.checked)} className="accent-[#83B81A]" />
                  Financials
                </label>
              )}
              <select value={m.role} onChange={(e) => changeRole(m.user_id, e.target.value)} className="text-sm border border-gray-300 rounded-md px-2 py-1 capitalize">
                {['owner', ...ROLES].map((r) => <option key={r} value={r}>{r}</option>)}
              </select>
              <button onClick={() => removeMember(m.user_id)} className="text-xs text-gray-400 hover:text-red-500">Remove</button>
            </div>
          ))}
          {members.length === 0 && <p className="text-sm text-gray-400 py-2">No members yet.</p>}
        </div>
      </div>

      {/* Pending invites */}
      {invites.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
          <h2 className="text-sm font-semibold text-gray-900 mb-4">Pending invites ({invites.length})</h2>
          <div className="divide-y divide-gray-100">
            {invites.map((i) => (
              <div key={i.id} className="flex items-center gap-3 py-2.5">
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-900 truncate">{i.email}</div>
                  <div className="text-xs text-gray-500 capitalize">{i.role}</div>
                </div>
                <button onClick={() => copyLink(i.token)} className="text-xs text-[#83B81A] hover:underline">Copy link</button>
                <button onClick={() => revokeInvite(i.token)} className="text-xs text-gray-400 hover:text-red-500">Revoke</button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
