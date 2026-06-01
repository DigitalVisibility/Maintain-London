import { useEffect, useState } from 'react';

const ROLES = ['manager', 'operative', 'client'] as const;
const CAP_LABELS: Record<string, string> = {
  manage_users: 'Manage team & clients',
  manage_projects: 'Create / edit projects',
  edit_diary: 'Edit diary entries',
  view_costs: 'View costs & timesheets',
  approve_works: 'Approve additional works',
  request_works: 'Request additional works',
  clock_time: 'Clock in / out',
  release_to_client: 'Release entries to client',
  view_client_portal: 'Access client portal',
  message: 'Use project messaging',
};

interface Data {
  defaults: Record<string, string[]>;
  all: string[];
  overrides: { role: string; capability: string; enabled: number }[];
}

export default function RoleAccess() {
  const [data, setData] = useState<Data | null>(null);
  const [saving, setSaving] = useState('');

  async function load() {
    const res = await fetch('/api/org/capabilities');
    if (res.ok) setData(await res.json());
  }
  useEffect(() => { load(); }, []);

  function isOn(role: string, cap: string): boolean {
    if (!data) return false;
    const override = data.overrides.find((o) => o.role === role && o.capability === cap);
    if (override) return !!override.enabled;
    return (data.defaults[role] || []).includes(cap);
  }

  async function toggle(role: string, cap: string) {
    const next = !isOn(role, cap);
    setSaving(`${role}:${cap}`);
    // optimistic
    setData((d) => d ? {
      ...d,
      overrides: [...d.overrides.filter((o) => !(o.role === role && o.capability === cap)), { role, capability: cap, enabled: next ? 1 : 0 }],
    } : d);
    try {
      await fetch('/api/org/capabilities', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role, capability: cap, enabled: next }),
      });
    } finally { setSaving(''); }
  }

  if (!data) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 overflow-x-auto">
      <h2 className="text-sm font-semibold text-gray-900 mb-1">Role access</h2>
      <p className="text-xs text-gray-500 mb-4">Choose what each role can see and do. Owners and admins always have full access.</p>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-xs uppercase text-gray-400">
            <th className="text-left py-2 pr-4">Feature</th>
            {ROLES.map((r) => <th key={r} className="px-3 py-2 capitalize">{r}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.all.map((cap) => (
            <tr key={cap} className="border-t border-gray-100">
              <td className="py-2 pr-4 text-gray-700">{CAP_LABELS[cap] || cap}</td>
              {ROLES.map((r) => (
                <td key={r} className="px-3 py-2 text-center">
                  <input
                    type="checkbox"
                    checked={isOn(r, cap)}
                    disabled={saving === `${r}:${cap}`}
                    onChange={() => toggle(r, cap)}
                    className="h-4 w-4 rounded border-gray-300 text-[#83B81A] focus:ring-[#AEDE4A]"
                  />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
