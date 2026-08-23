import { useEffect, useState } from 'react';

interface Person {
  id: string;
  org_id: string;
  name: string;
  role: string;
  company?: string;
  user_id?: string;
  phone?: string;
  default_days?: string;
  default_start?: string;
  default_end?: string;
  default_rate?: number;
  active: number;
  created_at: string;
}

const ROLES = ['operative', 'manager', 'subcontractor', 'visitor'] as const;
const DAYS: { value: number; label: string }[] = [
  { value: 1, label: 'Mon' },
  { value: 2, label: 'Tue' },
  { value: 3, label: 'Wed' },
  { value: 4, label: 'Thu' },
  { value: 5, label: 'Fri' },
  { value: 6, label: 'Sat' },
  { value: 7, label: 'Sun' },
];

// CSV "1,2,3" ↔ number[] helpers. Keep the CSV sorted ascending.
function parseDays(csv?: string): number[] {
  if (!csv) return [];
  return csv
    .split(',')
    .map((s) => parseInt(s.trim(), 10))
    .filter((n) => !Number.isNaN(n));
}
function joinDays(days: number[]): string {
  return [...new Set(days)].sort((a, b) => a - b).join(',');
}
function toggleDay(csv: string | undefined, day: number): string {
  const days = parseDays(csv);
  const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
  return joinDays(next);
}

export default function WorkforceRoster() {
  const [people, setPeople] = useState<Person[]>([]);
  const [name, setName] = useState('');
  const [role, setRole] = useState<string>('operative');
  const [company, setCompany] = useState('');
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function load() {
    const p = await fetch('/api/people').then((r) => (r.ok ? r.json() : []));
    setPeople(p);
  }
  useEffect(() => { load(); }, []);

  async function addPerson(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/people', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, role, company: company || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to add person');
      setMsg({ kind: 'ok', text: `${name} added to the roster.` });
      setName(''); setCompany(''); setRole('operative');
      load();
    } catch (err: any) {
      setMsg({ kind: 'err', text: err.message });
    } finally {
      setBusy(false);
    }
  }

  async function patchPerson(id: string, body: Record<string, unknown>) {
    await fetch(`/api/people/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    load();
  }

  async function toggleDayFor(person: Person, day: number) {
    const newCsv = toggleDay(person.default_days, day);
    // Optimistic — flip the row now, reconcile on reload.
    setPeople((ps) => ps.map((p) => (p.id === person.id ? { ...p, default_days: newCsv } : p)));
    await patchPerson(person.id, { default_days: newCsv });
  }

  async function removePerson(id: string, personName: string) {
    if (!confirm(`Remove ${personName} from the roster?`)) return;
    await fetch(`/api/people/${id}`, { method: 'DELETE' });
    load();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Add person */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Add person</h2>
        {msg && (
          <div className={`mb-3 text-sm px-3 py-2 rounded-md break-words ${msg.kind === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{msg.text}</div>
        )}
        <form onSubmit={addPerson} className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input type="text" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Name" className="px-3 py-2 border border-gray-300 rounded-md text-sm" />
          <select value={role} onChange={(e) => setRole(e.target.value)} className="px-3 py-2 border border-gray-300 rounded-md text-sm capitalize">
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <input type="text" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company (optional)" className="px-3 py-2 border border-gray-300 rounded-md text-sm" />
          <div className="sm:col-span-2">
            <button type="submit" disabled={busy} className="px-5 py-2 bg-[#AEDE4A] hover:bg-[#9BCF3A] text-gray-900 font-semibold rounded-md text-sm disabled:opacity-50">
              {busy ? 'Adding…' : 'Add person'}
            </button>
          </div>
        </form>
      </div>

      {/* Roster */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5">
        <h2 className="text-sm font-semibold text-gray-900 mb-4">Workforce ({people.length})</h2>
        <div className="divide-y divide-gray-100">
          {people.map((person) => {
            const activeDays = parseDays(person.default_days);
            return (
              <div key={person.id} className="py-3.5 space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-[#AEDE4A]/20 flex items-center justify-center text-[#6B8F2E] text-sm font-semibold">
                    {person.name?.charAt(0)?.toUpperCase() || 'U'}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">{person.name}</div>
                    <div className="text-xs text-gray-500 truncate capitalize">
                      {person.role}{person.company ? ` · ${person.company}` : ''}
                    </div>
                  </div>
                  <button onClick={() => removePerson(person.id, person.name)} className="text-xs text-gray-400 hover:text-red-500">Remove</button>
                </div>

                {/* Default working pattern */}
                <div className="pl-11 space-y-2">
                  <div className="flex flex-wrap gap-1.5">
                    {DAYS.map((d) => {
                      const on = activeDays.includes(d.value);
                      return (
                        <button
                          key={d.value}
                          type="button"
                          onClick={() => toggleDayFor(person, d.value)}
                          className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${on ? 'bg-[#AEDE4A] text-gray-900' : 'bg-gray-100 text-gray-500 hover:bg-gray-200'}`}
                        >
                          {d.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className="flex items-center gap-2 text-xs text-gray-500">
                    <label className="flex items-center gap-1.5">
                      Start
                      <input
                        type="time"
                        defaultValue={person.default_start || ''}
                        onBlur={(e) => { if (e.target.value !== (person.default_start || '')) patchPerson(person.id, { default_start: e.target.value }); }}
                        className="px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-900"
                      />
                    </label>
                    <label className="flex items-center gap-1.5">
                      End
                      <input
                        type="time"
                        defaultValue={person.default_end || ''}
                        onBlur={(e) => { if (e.target.value !== (person.default_end || '')) patchPerson(person.id, { default_end: e.target.value }); }}
                        className="px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-900"
                      />
                    </label>
                    <label className="flex items-center gap-1.5">
                      £/hr
                      <span className="flex items-center gap-1">
                        <span className="text-gray-400">£</span>
                        <input
                          type="number"
                          step="0.01"
                          min="0"
                          defaultValue={person.default_rate ?? ''}
                          onBlur={(e) => { if (e.target.value !== (person.default_rate != null ? String(person.default_rate) : '')) patchPerson(person.id, { default_rate: e.target.value ? Number(e.target.value) : null }); }}
                          className="w-24 px-2 py-1 border border-gray-300 rounded-md text-xs text-gray-900"
                        />
                      </span>
                    </label>
                  </div>
                </div>
              </div>
            );
          })}
          {people.length === 0 && <p className="text-sm text-gray-400 py-2">No people yet.</p>}
        </div>
      </div>
    </div>
  );
}
