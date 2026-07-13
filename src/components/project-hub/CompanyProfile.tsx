import { useEffect, useState } from 'react';

/**
 * The company details that appear on invoices and receipts. Filling these in is
 * what turns a printout into a document a client's accountant will accept.
 */

interface Profile {
  name?: string;
  company_address?: string | null;
  vat_number?: string | null;
  company_number?: string | null;
  company_phone?: string | null;
  company_email?: string | null;
  bank_details?: string | null;
  invoice_terms?: string | null;
}

const FIELDS: { key: keyof Profile; label: string; hint?: string; multiline?: boolean; placeholder?: string }[] = [
  { key: 'company_address', label: 'Trading address', multiline: true, placeholder: '12 High Street\nLondon\nSW1A 1AA' },
  { key: 'vat_number', label: 'VAT number', hint: 'Leave blank if not VAT-registered', placeholder: 'GB123456789' },
  { key: 'company_number', label: 'Company number', placeholder: '12345678' },
  { key: 'company_phone', label: 'Phone', placeholder: '020 3886 2023' },
  { key: 'company_email', label: 'Contact email', placeholder: 'accounts@yourbusiness.co.uk' },
  { key: 'bank_details', label: 'Bank details (for payment)', multiline: true, placeholder: 'Account name: …\nSort code: 00-00-00\nAccount no: 00000000' },
  { key: 'invoice_terms', label: 'Payment terms', multiline: true, placeholder: 'Payment due within 14 days of the invoice date.' },
];

export default function CompanyProfile() {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [draft, setDraft] = useState<Profile>({});
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function load() {
    const res = await fetch('/api/org/profile');
    if (res.ok) { const p = await res.json(); setProfile(p); setDraft(p); }
  }
  useEffect(() => { load(); }, []);

  async function save() {
    setSaving(true);
    setSaved(false);
    try {
      await fetch('/api/org/profile', {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(draft),
      });
      await load();
      setSaved(true);
    } finally { setSaving(false); }
  }

  if (!profile) return <p className="text-sm text-gray-500">Loading…</p>;

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-5 space-y-4">
      <div>
        <h2 className="text-sm font-semibold text-gray-900">Company details for invoices</h2>
        <p className="text-xs text-gray-500 mt-0.5">
          Shown on every invoice and receipt sent to clients. Invoices go out as <strong>{profile.name}</strong>.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {FIELDS.map((f) => (
          <div key={f.key} className={f.multiline ? 'sm:col-span-2' : ''}>
            <label className="block text-xs font-medium text-gray-700 mb-1">{f.label}</label>
            {f.multiline ? (
              <textarea
                value={draft[f.key] ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] resize-y"
              />
            ) : (
              <input
                type="text"
                value={draft[f.key] ?? ''}
                onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
                placeholder={f.placeholder}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A]"
              />
            )}
            {f.hint && <p className="text-xs text-gray-400 mt-0.5">{f.hint}</p>}
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <button onClick={save} disabled={saving}
          className="px-4 py-2 rounded-md bg-[#83B81A] hover:bg-[#6f9e16] text-white text-sm font-semibold disabled:opacity-50">
          {saving ? 'Saving…' : 'Save company details'}
        </button>
        {saved && <span className="text-sm text-green-600">Saved.</span>}
      </div>
    </div>
  );
}
