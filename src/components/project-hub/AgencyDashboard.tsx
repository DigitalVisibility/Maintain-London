import { useEffect, useState } from 'react';

interface Org { id: string; name: string; slug: string | null; brand_color: string; logo_url: string | null; project_count: number; member_count: number; }

interface Props {
  platformDomain: string;
  onPlatform: boolean;
}

function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '').slice(0, 40);
}

export default function AgencyDashboard({ platformDomain, onPlatform }: Props) {
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [brandColor, setBrandColor] = useState('#AEDE4A');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [logoOptions, setLogoOptions] = useState<string[]>([]);
  const [ownerEmail, setOwnerEmail] = useState('');
  const [siteUrl, setSiteUrl] = useState('');
  const [inspecting, setInspecting] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const res = await fetch('/api/org');
    if (res.ok) setOrgs(await res.json());
  }
  useEffect(() => { load(); }, []);

  function setNameAndSlug(v: string) {
    setName(v);
    if (!slugTouched) setSlug(slugify(v));
  }

  async function enter(o: Org) {
    // On the platform each business is its own subdomain — go there.
    if (onPlatform && o.slug) { window.location.href = `https://${o.slug}.${platformDomain}/project-hub/`; return; }
    setBusy(true);
    try {
      const res = await fetch('/api/org/switch', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ org_id: o.id }),
      });
      if (res.ok) window.location.href = '/project-hub/';
    } finally { setBusy(false); }
  }

  async function inspect() {
    if (!siteUrl.trim()) return;
    setInspecting(true); setMsg(null); setLogoOptions([]);
    try {
      const res = await fetch('/api/onboarding/inspect', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: siteUrl.trim() }),
      });
      const out = await res.json();
      if (!res.ok) throw new Error(out.error || 'Could not read that website');
      if (out.business_name) setNameAndSlug(out.business_name);
      if (out.suggested_slug && !slugTouched) setSlug(out.suggested_slug);
      if (out.brand_color && /^#[0-9a-fA-F]{6}$/.test(out.brand_color)) setBrandColor(out.brand_color.toUpperCase());
      if (!ownerEmail && out.email) setOwnerEmail(out.email);
      if (Array.isArray(out.logo_candidates)) {
        setLogoOptions(out.logo_candidates);
        if (out.logo_candidates[0]) setLogoUrl(out.logo_candidates[0]);
      }
      setMsg('Filled in what we found — review, then create.');
    } catch (err: any) {
      setMsg(err.message);
    } finally {
      setInspecting(false);
    }
  }

  async function create(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) return;
    setBusy(true); setMsg(null);
    try {
      const res = await fetch('/api/org', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name, slug: slug || undefined, brand_color: brandColor,
          logo_url: logoUrl || undefined, owner_email: ownerEmail || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to create');
      setMsg(ownerEmail ? (data.ownerInvited ? 'Business created and owner invited.' : 'Business created. (Owner email failed — invite them from inside.)') : 'Business created.');
      setName(''); setSlug(''); setSlugTouched(false); setBrandColor('#AEDE4A');
      setLogoUrl(null); setLogoOptions([]); setOwnerEmail(''); setSiteUrl(''); setOpen(false);
      load();
    } catch (err: any) {
      setMsg(err.message);
    } finally { setBusy(false); }
  }

  const input = 'w-full px-3 py-2 rounded-md bg-gray-900 border border-gray-700 text-white text-sm placeholder-gray-500';

  return (
    <div className="space-y-5">
      <div className="flex justify-end">
        <button onClick={() => setOpen(!open)} className="px-4 py-2 bg-[#AEDE4A] hover:bg-[#9BCF3A] text-gray-900 font-semibold rounded-md text-sm">
          {open ? 'Close' : '+ Create business'}
        </button>
      </div>

      {msg && <div className="text-sm text-white bg-gray-800 border border-gray-700 rounded-md px-3 py-2">{msg}</div>}

      {open && (
        <form onSubmit={create} className="bg-gray-800 border border-gray-700 rounded-lg p-4 space-y-4">
          {/* AI auto-fill from the business website */}
          <div className="rounded-md border border-dashed border-gray-600 p-3">
            <label className="block text-xs font-medium text-gray-300 mb-1">Set up from their website (optional)</label>
            <div className="flex items-center gap-2">
              <input value={siteUrl} onChange={(e) => setSiteUrl(e.target.value)} placeholder="theirbusiness.co.uk"
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); inspect(); } }} className={input} />
              <button type="button" onClick={inspect} disabled={inspecting || !siteUrl.trim()}
                className="px-3 py-2 text-sm font-medium bg-white text-gray-900 rounded-md hover:bg-gray-100 disabled:opacity-50 whitespace-nowrap">
                {inspecting ? 'Reading…' : 'Auto-fill'}
              </button>
            </div>
            {logoOptions.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-2">
                {logoOptions.map((u) => (
                  <button key={u} type="button" onClick={() => setLogoUrl(u)} title="Use this logo"
                    className={`w-11 h-11 rounded-md border bg-white flex items-center justify-center overflow-hidden ${logoUrl === u ? 'border-[#AEDE4A] ring-2 ring-[#AEDE4A]' : 'border-gray-600'}`}>
                    <img src={u} alt="" className="max-w-full max-h-full object-contain" />
                  </button>
                ))}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">Business name</label>
            <input value={name} onChange={(e) => setNameAndSlug(e.target.value)} required placeholder="e.g. Rival Builders" className={input} />
          </div>

          {onPlatform && (
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Web address</label>
              <div className="flex items-center rounded-md bg-gray-900 border border-gray-700 overflow-hidden">
                <input value={slug} onChange={(e) => { setSlug(e.target.value.toLowerCase()); setSlugTouched(true); }}
                  placeholder="rival-builders" className="flex-1 min-w-0 px-3 py-2 bg-transparent text-white text-sm focus:outline-none" />
                <span className="px-3 py-2 text-sm text-gray-400 border-l border-gray-700 whitespace-nowrap">.{platformDomain}</span>
              </div>
              <p className="text-xs text-gray-500 mt-1">Their login link: <span className="text-gray-300">{(slug || 'their-business')}.{platformDomain}</span></p>
            </div>
          )}

          <div className="flex items-center gap-3">
            <div>
              <label className="block text-xs font-medium text-gray-300 mb-1">Brand colour</label>
              <input type="color" value={/^#[0-9a-fA-F]{6}$/.test(brandColor) ? brandColor : '#AEDE4A'}
                onChange={(e) => setBrandColor(e.target.value.toUpperCase())} className="h-9 w-14 rounded border border-gray-700 bg-gray-900 cursor-pointer p-0.5" />
            </div>
            {logoUrl && (
              <div>
                <label className="block text-xs font-medium text-gray-300 mb-1">Logo</label>
                <div className="w-9 h-9 rounded-md border border-gray-700 bg-white flex items-center justify-center overflow-hidden">
                  <img src={logoUrl} alt="" className="max-w-full max-h-full object-contain" />
                </div>
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-gray-300 mb-1">Owner's email (optional — invites them as owner)</label>
            <input value={ownerEmail} onChange={(e) => setOwnerEmail(e.target.value)} type="email" placeholder="owner@theirbusiness.co.uk" className={input} />
          </div>

          <button type="submit" disabled={busy} className="px-4 py-2 bg-[#AEDE4A] hover:bg-[#9BCF3A] text-gray-900 font-semibold rounded-md text-sm disabled:opacity-50">
            {busy ? 'Creating…' : 'Create business'}
          </button>
        </form>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {orgs.map((o) => (
          <div key={o.id} className="bg-white rounded-lg p-5 flex flex-col">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-lg flex items-center justify-center overflow-hidden text-white font-bold" style={{ background: o.brand_color }}>
                {o.logo_url ? <img src={o.logo_url} alt="" className="max-w-full max-h-full object-contain" /> : o.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <div className="font-semibold text-gray-900 truncate">{o.name}</div>
                {onPlatform && o.slug && <div className="text-xs text-gray-400 truncate">{o.slug}.{platformDomain}</div>}
              </div>
            </div>
            <div className="text-xs text-gray-500 mb-4">{o.project_count} project{o.project_count === 1 ? '' : 's'} · {o.member_count} member{o.member_count === 1 ? '' : 's'}</div>
            <button onClick={() => enter(o)} disabled={busy} className="mt-auto px-4 py-2 bg-gray-900 hover:bg-black text-white text-sm font-semibold rounded-md disabled:opacity-50">
              Enter →
            </button>
          </div>
        ))}
        {orgs.length === 0 && <div className="text-gray-400 text-sm">No businesses yet. Create your first one.</div>}
      </div>
    </div>
  );
}
