import { useEffect, useRef, useState } from 'react';

interface Branding {
  name: string;
  slug: string | null;
  brand_color: string;
  logo_url: string | null;
  platformDomain: string;
  onPlatform: boolean;
  subdomainUrl: string | null;
}

export default function BrandingSettings() {
  const [data, setData] = useState<Branding | null>(null);
  const [name, setName] = useState('');
  const [color, setColor] = useState('#AEDE4A');
  const [slug, setSlug] = useState('');
  const [logoUrl, setLogoUrl] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const r = await fetch('/api/org/branding');
    if (!r.ok) return;
    const d: Branding = await r.json();
    setData(d);
    setName(d.name || '');
    setColor((d.brand_color || '#AEDE4A').toUpperCase());
    setSlug(d.slug || '');
    setLogoUrl(d.logo_url);
  }
  useEffect(() => { load(); }, []);

  const validColor = /^#[0-9a-fA-F]{6}$/.test(color);
  const cleanSlug = slug.trim().toLowerCase();
  const slugChanged = !!data && cleanSlug !== (data.slug || '');

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setMsg(null);
    try {
      const body: Record<string, string> = { name: name.trim(), brand_color: color };
      if (slugChanged) body.slug = cleanSlug;
      const r = await fetch('/api/org/branding', {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      });
      const out = await r.json();
      if (!r.ok) throw new Error(out.error || 'Could not save');
      if (out.newSubdomainUrl) {
        setMsg({ kind: 'ok', text: 'Saved. Your web address changed — taking you there…' });
        setTimeout(() => { window.location.href = out.newSubdomainUrl; }, 1400);
        return;
      }
      setMsg({ kind: 'ok', text: 'Branding saved.' });
      load();
    } catch (err: any) {
      setMsg({ kind: 'err', text: err.message });
    } finally {
      setSaving(false);
    }
  }

  async function onLogoPicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true); setMsg(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch('/api/org/branding/logo', { method: 'POST', body: fd });
      const out = await r.json();
      if (!r.ok) throw new Error(out.error || 'Upload failed');
      setLogoUrl(out.logo_url);
      setMsg({ kind: 'ok', text: 'Logo updated.' });
    } catch (err: any) {
      setMsg({ kind: 'err', text: err.message });
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  async function removeLogo() {
    if (!confirm('Remove your logo?')) return;
    setUploading(true); setMsg(null);
    try {
      const r = await fetch('/api/org/branding/logo', { method: 'DELETE' });
      if (!r.ok) throw new Error('Could not remove logo');
      setLogoUrl(null);
      setMsg({ kind: 'ok', text: 'Logo removed.' });
    } catch (err: any) {
      setMsg({ kind: 'err', text: err.message });
    } finally {
      setUploading(false);
    }
  }

  const domain = data?.platformDomain || 'projectdash.app';

  return (
    <form onSubmit={save} className="space-y-5">
      {msg && (
        <div className={`text-sm px-3 py-2 rounded-md break-words ${msg.kind === 'ok' ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'}`}>{msg.text}</div>
      )}

      {/* Logo */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">Logo</label>
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-lg border border-gray-200 bg-gray-50 flex items-center justify-center overflow-hidden shrink-0">
            {logoUrl
              ? <img src={logoUrl} alt="Logo" className="max-w-full max-h-full object-contain" />
              : <span className="text-xs text-gray-400">None</span>}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="px-3 py-1.5 text-sm font-medium bg-gray-100 hover:bg-gray-200 rounded-md disabled:opacity-50">
              {uploading ? 'Uploading…' : logoUrl ? 'Replace' : 'Upload logo'}
            </button>
            {logoUrl && (
              <button type="button" onClick={removeLogo} disabled={uploading}
                className="px-3 py-1.5 text-sm text-gray-500 hover:text-red-600 disabled:opacity-50">Remove</button>
            )}
            <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={onLogoPicked} className="hidden" />
          </div>
        </div>
        <p className="text-xs text-gray-400 mt-1.5">Shown on your login page and across the app. PNG, JPEG or WebP.</p>
      </div>

      {/* Business name */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Business name</label>
        <input value={name} onChange={(e) => setName(e.target.value)} required
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm" />
      </div>

      {/* Brand colour */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-1">Brand colour</label>
        <div className="flex items-center gap-3">
          <input type="color" value={validColor ? color : '#AEDE4A'} onChange={(e) => setColor(e.target.value.toUpperCase())}
            className="h-9 w-12 rounded border border-gray-300 cursor-pointer p-0.5" />
          <input value={color} onChange={(e) => setColor(e.target.value.toUpperCase())} spellCheck={false}
            className={`w-32 px-3 py-2 border rounded-md text-sm font-mono ${validColor ? 'border-gray-300' : 'border-red-300'}`} />
          <span className="text-xs text-gray-400">Used for buttons and highlights.</span>
        </div>
      </div>

      {/* Web address (slug) — only meaningful on the platform */}
      {data?.onPlatform && (
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">Web address</label>
          <div className="flex items-center rounded-md border border-gray-300 overflow-hidden max-w-md">
            <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} spellCheck={false}
              className="flex-1 min-w-0 px-3 py-2 text-sm focus:outline-none" placeholder="your-business" />
            <span className="px-3 py-2 text-sm text-gray-400 bg-gray-50 border-l border-gray-200 whitespace-nowrap">.{domain}</span>
          </div>
          <p className="text-xs text-gray-400 mt-1.5">
            This is the link you send clients: <span className="font-medium text-gray-500">{(cleanSlug || 'your-business')}.{domain}</span>.
            {slugChanged && <span className="text-amber-600"> Changing it will move you to the new address and old links will stop working.</span>}
          </p>
        </div>
      )}

      <div className="pt-1">
        <button type="submit" disabled={saving || !validColor}
          className="px-5 py-2 bg-[#AEDE4A] hover:bg-[#9BCF3A] text-gray-900 font-semibold rounded-md text-sm disabled:opacity-50">
          {saving ? 'Saving…' : 'Save branding'}
        </button>
      </div>
    </form>
  );
}
