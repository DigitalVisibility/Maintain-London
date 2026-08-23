import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { generateId } from '../../lib/ids';
import { computeTotals, lineNet } from '../../lib/quotes';
import VoiceRecorder from './VoiceRecorder';
import type { QuoteFile, QuoteItem, QuoteStatus, VoiceNote } from '../../types/diary';

/**
 * The quote builder.
 *
 * A quote is read by the client as rooms, so it is edited as rooms: sections of
 * terse lines, each with an optional quantity and a rate. Totals are computed
 * from the lines on every keystroke by the same function the server uses, so the
 * figure on screen is never a different number from the figure that gets saved.
 *
 * The assumptions list sits at the top rather than at the bottom. Every entry on
 * it is an unknown that will cost somebody money if it is still unknown when the
 * job starts, and a list nobody scrolls to is a list nobody resolves.
 */

interface Line {
  id: string;
  description: string;
  qty: string;
  unit: string;
  rate: string;
  provisional: boolean;
}

interface Section {
  key: string;
  name: string;
  lines: Line[];
}

interface QuoteShape {
  id: string;
  number?: string;
  title: string;
  client_name?: string;
  client_email?: string;
  address?: string;
  postcode?: string;
  status: QuoteStatus;
  vat_rate: number;
  notes?: string;
  project_id?: string;
  items: QuoteItem[];
  files: QuoteFile[];
  voice_notes?: VoiceNote[];
}

/** The shape every quote endpoint answers with. */
interface QuoteResponse {
  quote: QuoteShape;
  assumptions: string[];
  error?: string;
  drafted?: { sections: number; lines: number; suggested_title: string | null };
  source?: {
    transcripts: number; photos_available: number; photos_used: number;
    photos_skipped_unreadable: number; photos_skipped_over_limit: number;
    photos_missing_from_storage: string[]; limit: number;
  };
}

/** fetch().json() is untyped — narrowed once here rather than at every call site. */
async function readJson<T>(res: Response): Promise<T> {
  return (await res.json().catch(() => ({}))) as T;
}

const money = (n: number) => `£${(n ?? 0).toFixed(2)}`;

const STATUS_STYLE: Record<QuoteStatus, string> = {
  draft: 'bg-gray-100 text-gray-600',
  sent: 'bg-amber-100 text-amber-800',
  accepted: 'bg-green-100 text-green-800',
  declined: 'bg-red-100 text-red-700',
};

const STATUS_LABEL: Record<QuoteStatus, string> = {
  draft: 'Draft',
  sent: 'Sent',
  accepted: 'Accepted',
  declined: 'Declined',
};

/** The moves the server will accept — mirrored here so the UI offers no dead buttons. */
const NEXT_STATUSES: Record<QuoteStatus, QuoteStatus[]> = {
  draft: ['sent'],
  sent: ['accepted', 'declined', 'draft'],
  accepted: [],
  declined: [],
};

const num = (s: string): number | undefined => {
  const trimmed = s?.trim();
  if (!trimmed) return undefined;
  const n = Number(trimmed);
  return Number.isFinite(n) ? n : undefined;
};

const str = (n: number | null | undefined): string =>
  n === null || n === undefined ? '' : String(n);

/** Group the stored flat list back into the sections the estimator edits. */
function toSections(items: QuoteItem[]): Section[] {
  const sections: Section[] = [];
  const index = new Map<string, Section>();

  for (const item of items) {
    const name = item.section?.trim() || 'Scope of works';
    let section = index.get(name);
    if (!section) {
      section = { key: generateId(), name, lines: [] };
      index.set(name, section);
      sections.push(section);
    }
    section.lines.push({
      id: item.id,
      description: item.description,
      qty: str(item.qty),
      unit: item.unit ?? '',
      rate: str(item.rate),
      provisional: !!item.provisional,
    });
  }

  return sections;
}

/** Flatten back for the wire. Order in the UI is order on the quote. */
function toItems(sections: Section[]) {
  const out: {
    id: string; section: string; description: string;
    qty?: number; unit?: string; rate?: number; provisional: boolean;
  }[] = [];
  for (const section of sections) {
    for (const line of section.lines) {
      if (!line.description.trim()) continue;
      out.push({
        // The id goes back exactly as it came: a walkthrough photo links to a
        // line by id, and a new id on every save would orphan that link.
        id: line.id,
        section: section.name.trim(),
        description: line.description.trim(),
        qty: num(line.qty),
        unit: line.unit.trim() || undefined,
        rate: num(line.rate),
        provisional: line.provisional,
      });
    }
  }
  return out;
}

export default function QuoteBuilder({ quoteId }: { quoteId: string }) {
  const [quote, setQuote] = useState<QuoteShape | null>(null);
  const [sections, setSections] = useState<Section[]>([]);
  const [assumptions, setAssumptions] = useState<string[]>([]);
  const [newAssumption, setNewAssumption] = useState('');

  const [title, setTitle] = useState('');
  const [clientName, setClientName] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [address, setAddress] = useState('');
  const [postcode, setPostcode] = useState('');
  const [vatRate, setVatRate] = useState(20);
  const [notes, setNotes] = useState('');

  const [busy, setBusy] = useState('');
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad' | 'info'; text: string } | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const locked = quote ? quote.status === 'accepted' || quote.status === 'declined' : false;

  const apply = useCallback((data: { quote: QuoteShape; assumptions: string[] }) => {
    const q = data.quote;
    setQuote(q);
    setSections(toSections(q.items ?? []));
    setAssumptions(data.assumptions ?? []);
    setTitle(q.title ?? '');
    setClientName(q.client_name ?? '');
    setClientEmail(q.client_email ?? '');
    setAddress(q.address ?? '');
    setPostcode(q.postcode ?? '');
    setVatRate(q.vat_rate ?? 20);
    setNotes(q.notes ?? '');
    setDirty(false);
  }, []);

  const load = useCallback(async () => {
    const res = await fetch(`/api/quotes/${quoteId}`);
    if (!res.ok) {
      setMsg({ tone: 'bad', text: 'Could not load this quote.' });
      return;
    }
    apply(await readJson<QuoteResponse>(res));
  }, [quoteId, apply]);

  useEffect(() => { load(); }, [load]);

  // ── Totals ────────────────────────────────────────────────────────────────
  // The same computeTotals the API and the conversion to a project use, so the
  // number on screen, the number saved and the project's contract sum are one
  // number with one rounding rule.
  const totals = useMemo(() => {
    const items = sections.flatMap((s) =>
      s.lines
        .filter((l) => l.description.trim())
        .map((l) => ({
          qty: num(l.qty),
          rate: num(l.rate),
          net: undefined,
          provisional: l.provisional ? 1 : 0,
        }))
    ) as unknown as QuoteItem[];
    return computeTotals(items, vatRate);
  }, [sections, vatRate]);

  const unpricedCount = useMemo(
    () => sections.reduce(
      (n, s) => n + s.lines.filter((l) => l.description.trim() && num(l.rate) === undefined).length, 0
    ),
    [sections]
  );

  // ── Editing ───────────────────────────────────────────────────────────────
  function mutate(fn: (draft: Section[]) => Section[]) {
    setSections((prev) => fn(prev.map((s) => ({ ...s, lines: s.lines.map((l) => ({ ...l })) }))));
    setDirty(true);
  }

  const setLine = (si: number, li: number, patch: Partial<Line>) =>
    mutate((d) => { d[si].lines[li] = { ...d[si].lines[li], ...patch }; return d; });

  const addLine = (si: number) =>
    mutate((d) => {
      d[si].lines.push({ id: generateId(), description: '', qty: '', unit: '', rate: '', provisional: false });
      return d;
    });

  const removeLine = (si: number, li: number) =>
    mutate((d) => { d[si].lines.splice(li, 1); return d; });

  const moveLine = (si: number, li: number, delta: number) =>
    mutate((d) => {
      const target = li + delta;
      if (target < 0 || target >= d[si].lines.length) return d;
      const [line] = d[si].lines.splice(li, 1);
      d[si].lines.splice(target, 0, line);
      return d;
    });

  const moveSection = (si: number, delta: number) =>
    mutate((d) => {
      const target = si + delta;
      if (target < 0 || target >= d.length) return d;
      const [section] = d.splice(si, 1);
      d.splice(target, 0, section);
      return d;
    });

  const renameSection = (si: number, name: string) =>
    mutate((d) => { d[si].name = name; return d; });

  const removeSection = (si: number) => {
    const section = sections[si];
    if (section.lines.length > 0 && !confirm(`Delete "${section.name}" and its ${section.lines.length} line(s)?`)) return;
    mutate((d) => { d.splice(si, 1); return d; });
  };

  const addSection = () =>
    mutate((d) => {
      d.push({ key: generateId(), name: 'New section', lines: [] });
      return d;
    });

  // ── Persistence ───────────────────────────────────────────────────────────
  async function save(extra: Record<string, unknown> = {}, label = 'save') {
    setBusy(label);
    setMsg(null);
    try {
      const res = await fetch(`/api/quotes/${quoteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title.trim(),
          client_name: clientName,
          client_email: clientEmail,
          address,
          postcode,
          vat_rate: vatRate,
          notes,
          assumptions,
          items: toItems(sections),
          ...extra,
        }),
      });
      const data = await readJson<QuoteResponse>(res);
      if (!res.ok) throw new Error(data.error || 'Could not save');
      apply(data);
      setMsg({ tone: 'ok', text: 'Saved.' });
      return true;
    } catch (err: any) {
      setMsg({ tone: 'bad', text: err.message });
      return false;
    } finally {
      setBusy('');
    }
  }

  async function changeStatus(status: QuoteStatus) {
    if (status === 'accepted' && !confirm(
      `Mark this quote accepted at ${money(totals.total)}?\n\nThe net of ${money(totals.net)} becomes the project's contract sum when you convert it.`
    )) return;
    // Status rides along with a save, so a change of mind about a line and the
    // decision to issue can't get out of step with one another.
    await save({ status }, `status:${status}`);
  }

  async function draftFromWalkthrough() {
    if (dirty && !(await save({}, 'save'))) return;
    setBusy('draft');
    setMsg({ tone: 'info', text: 'Reading the walkthrough…' });
    try {
      const res = await fetch(`/api/quotes/${quoteId}/draft`, { method: 'POST' });
      const data = await readJson<QuoteResponse>(res);
      if (!res.ok) throw new Error(data.error || 'Drafting failed');
      apply(data);

      const src = data.source;
      const drafted = data.drafted;
      const skipped = (src?.photos_skipped_over_limit ?? 0) + (src?.photos_skipped_unreadable ?? 0);
      setMsg({
        tone: 'ok',
        text: `${drafted?.lines ?? 0} lines across ${drafted?.sections ?? 0} sections, from `
          + `${src?.transcripts ?? 0} recording${src?.transcripts === 1 ? '' : 's'} and ${src?.photos_used ?? 0} photo${src?.photos_used === 1 ? '' : 's'}`
          + (skipped ? ` — ${skipped} photo${skipped === 1 ? '' : 's'} not read (${src?.photos_skipped_over_limit ?? 0} over the ${src?.limit} limit, ${src?.photos_skipped_unreadable ?? 0} in a format the model can't open). Check them by hand.` : '.')
          + ' Nothing is priced — that is your job.',
      });
    } catch (err: any) {
      setMsg({ tone: 'bad', text: err.message });
    } finally {
      setBusy('');
    }
  }

  async function convert() {
    if (!confirm(`Create a project from this quote?\n\nIts contract sum will be ${money(totals.net)} net at ${vatRate}% VAT.`)) return;
    setBusy('convert');
    try {
      const res = await fetch(`/api/quotes/${quoteId}/convert`, { method: 'POST' });
      const data = await readJson<{ project_id: string; error?: string }>(res);
      if (!res.ok) throw new Error(data.error || 'Could not convert');
      window.location.href = `/project-hub/project/${data.project_id}/`;
    } catch (err: any) {
      setMsg({ tone: 'bad', text: err.message });
      setBusy('');
    }
  }

  async function uploadPhotos(files: FileList | null) {
    if (!files?.length) return;
    setBusy('upload');
    try {
      for (const file of Array.from(files)) {
        const form = new FormData();
        form.append('file', file);
        // The shutter time matters more than the upload time — a walk done on
        // site and uploaded that evening should still read as the site visit.
        if (file.lastModified) form.append('taken_at', new Date(file.lastModified).toISOString());
        const res = await fetch(`/api/quotes/${quoteId}/files`, { method: 'POST', body: form });
        if (!res.ok) {
          const data = await readJson<{ error?: string }>(res);
          setMsg({ tone: 'bad', text: data.error || `Could not upload ${file.name}` });
        }
      }
      await load();
    } finally {
      setBusy('');
      if (fileInput.current) fileInput.current.value = '';
    }
  }

  async function removePhoto(file: QuoteFile) {
    if (!confirm(`Delete ${file.filename}?`)) return;
    setBusy(file.id);
    try {
      await fetch(`/api/quotes/${quoteId}/files?key=${encodeURIComponent(file.r2_key)}`, { method: 'DELETE' });
      await load();
    } finally { setBusy(''); }
  }

  if (!quote) return <p className="text-sm text-gray-500">Loading…</p>;

  const transcripts = (quote.voice_notes ?? []).filter((n) => n.transcript?.trim());
  const photoUrl = (f: QuoteFile) => `/api/quotes/${quoteId}/files?key=${encodeURIComponent(f.r2_key)}`;

  return (
    <div className="space-y-5">
      {msg && (
        <div className={`text-sm rounded-md px-3 py-2 border ${
          msg.tone === 'ok' ? 'bg-green-50 text-green-800 border-green-200'
            : msg.tone === 'info' ? 'bg-blue-50 text-blue-800 border-blue-200'
              : 'bg-red-50 text-red-700 border-red-200'
        }`}>{msg.text}</div>
      )}

      {/* ── Header: who, where, and where the quote has got to ─────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-mono text-sm text-gray-500">{quote.number ?? '—'}</span>
          <span className={`text-xs font-semibold px-2 py-0.5 rounded-full ${STATUS_STYLE[quote.status]}`}>
            {STATUS_LABEL[quote.status]}
          </span>
          {quote.project_id && (
            <a href={`/project-hub/project/${quote.project_id}/`} className="text-xs text-brand-green hover:underline">
              Open the project this became →
            </a>
          )}
          <span className="ml-auto text-xs text-gray-400">{dirty ? 'Unsaved changes' : 'All changes saved'}</span>
        </div>

        <input
          value={title}
          onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
          disabled={locked}
          placeholder="What is the job?"
          className="w-full text-lg font-semibold text-gray-900 border-b border-gray-200 focus:border-brand-green focus:outline-none py-1 disabled:bg-transparent disabled:text-gray-500"
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <label className="block">
            <span className="text-xs text-gray-500">Client</span>
            <input value={clientName} onChange={(e) => { setClientName(e.target.value); setDirty(true); }}
              disabled={locked}
              className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-green disabled:bg-gray-50" />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">Client email</span>
            <input type="email" value={clientEmail} onChange={(e) => { setClientEmail(e.target.value); setDirty(true); }}
              disabled={locked}
              className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-green disabled:bg-gray-50" />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">Address</span>
            <input value={address} onChange={(e) => { setAddress(e.target.value); setDirty(true); }}
              disabled={locked}
              className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-green disabled:bg-gray-50" />
          </label>
          <label className="block">
            <span className="text-xs text-gray-500">Postcode</span>
            <input value={postcode} onChange={(e) => { setPostcode(e.target.value.toUpperCase()); setDirty(true); }}
              disabled={locked}
              className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 uppercase focus:outline-none focus:ring-2 focus:ring-brand-green disabled:bg-gray-50" />
          </label>
        </div>
      </div>

      {/* ── Assumptions: put where they cannot be missed ───────────────────── */}
      <div className={`rounded-lg border p-4 ${assumptions.length ? 'bg-amber-50 border-amber-300' : 'bg-white border-gray-200'}`}>
        <div className="flex items-center justify-between gap-2 mb-1">
          <h2 className="text-sm font-semibold text-gray-900">
            Unknowns to resolve{assumptions.length > 0 && <span className="ml-2 text-amber-800">{assumptions.length}</span>}
          </h2>
        </div>
        <p className="text-xs text-gray-600 mb-3">
          Every one of these is a cost nobody has priced yet. Settle them before the quote goes out, or state them on it —
          an unknown discovered after the job is won is the most expensive kind.
        </p>

        {assumptions.length === 0 ? (
          <p className="text-sm text-gray-400">Nothing outstanding.</p>
        ) : (
          <ul className="space-y-1.5 mb-3">
            {assumptions.map((a, i) => (
              <li key={`${a}-${i}`} className="flex items-start gap-2 text-sm text-gray-800">
                <span className="text-amber-600 mt-0.5">•</span>
                <span className="flex-1">{a}</span>
                <button
                  type="button"
                  onClick={() => { setAssumptions((prev) => prev.filter((_, j) => j !== i)); setDirty(true); }}
                  className="text-xs text-gray-400 hover:text-red-600"
                  title="Resolved — remove it"
                >Resolved</button>
              </li>
            ))}
          </ul>
        )}

        <div className="flex gap-2">
          <input
            value={newAssumption}
            onChange={(e) => setNewAssumption(e.target.value)}
            onKeyDown={(e) => {
              if (e.key !== 'Enter' || !newAssumption.trim()) return;
              e.preventDefault();
              setAssumptions((prev) => [...prev, newAssumption.trim()]);
              setNewAssumption('');
              setDirty(true);
            }}
            placeholder="Add an unknown — e.g. no loft access on the day"
            className="flex-1 text-sm border border-gray-300 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-green"
          />
          <button
            type="button"
            onClick={() => {
              if (!newAssumption.trim()) return;
              setAssumptions((prev) => [...prev, newAssumption.trim()]);
              setNewAssumption('');
              setDirty(true);
            }}
            className="text-sm px-3 py-1.5 rounded-md bg-gray-900 text-white hover:bg-gray-800"
          >Add</button>
        </div>
      </div>

      {/* ── The walkthrough: what the scope was drafted from ───────────────── */}
      <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-gray-900">The walkthrough</h2>
          {!locked && (
            <div className="flex items-center gap-2">
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={(e) => uploadPhotos(e.target.files)}
              />
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                disabled={busy === 'upload'}
                className="text-sm px-3 py-1.5 rounded-md border border-gray-300 hover:bg-gray-50 disabled:opacity-50"
              >{busy === 'upload' ? 'Uploading…' : 'Add photos'}</button>
              <button
                type="button"
                onClick={draftFromWalkthrough}
                disabled={busy === 'draft' || transcripts.length === 0}
                title={transcripts.length === 0 ? 'Record a voice note on the walk first' : undefined}
                className="text-sm px-3 py-1.5 rounded-md bg-brand-green text-gray-900 font-medium hover:brightness-95 disabled:opacity-40"
              >{busy === 'draft' ? 'Drafting…' : 'Draft the scope'}</button>
            </div>
          )}
        </div>

        {/* Photo strip */}
        {quote.files.length > 0 ? (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {quote.files.map((f) => (
              <div key={f.id} className="relative shrink-0 w-28">
                {f.mime_type.startsWith('image/') ? (
                  <img src={photoUrl(f)} alt={f.caption || f.filename}
                    className="w-28 h-28 object-cover rounded-md border border-gray-200" loading="lazy" />
                ) : (
                  <div className="w-28 h-28 rounded-md border border-gray-200 bg-gray-50 flex items-center justify-center text-[10px] text-gray-500 px-1 text-center">
                    {f.filename}
                  </div>
                )}
                {!locked && (
                  <button
                    type="button"
                    onClick={() => removePhoto(f)}
                    disabled={busy === f.id}
                    className="absolute top-1 right-1 bg-white/90 rounded-full w-5 h-5 text-xs text-gray-600 hover:text-red-600 leading-none"
                    title="Delete photo"
                  >×</button>
                )}
                <div className="text-[11px] text-gray-500 mt-1 truncate" title={f.caption || f.ai_caption || f.filename}>
                  {f.caption || f.ai_caption || f.filename}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No photos yet.</p>
        )}

        {/* Voice notes — the source the scope is actually drafted from */}
        <div>
          <h3 className="text-xs uppercase tracking-wide text-gray-400 mb-2">
            Voice notes {transcripts.length > 0 && `(${transcripts.length})`}
          </h3>
          {transcripts.length === 0 && (
            <p className="text-sm text-gray-500 mb-2">
              Nothing recorded yet. The scope is drafted from what you said on the walk — photos alone would only be
              guesswork — so talk your way round before drafting.
            </p>
          )}
          <VoiceRecorder
            quoteId={quoteId}
            notes={quote.voice_notes ?? []}
            // Merged into the quote in place rather than reloading it: a reload
            // would throw away whatever lines the estimator has half-typed.
            onNote={(note) => setQuote((q) => (q ? {
              ...q,
              voice_notes: [...(q.voice_notes ?? []).filter((n) => n.id !== note.id), note],
            } : q))}
            onError={(text) => setMsg({ tone: 'bad', text })}
          />
        </div>
      </div>

      {/* ── The scope ──────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {sections.map((section, si) => {
          const sectionNet = section.lines.reduce(
            (t, l) => t + lineNet({ qty: num(l.qty), rate: num(l.rate), net: undefined }), 0
          );
          return (
            <div key={section.key} className="bg-white rounded-lg border border-gray-200">
              <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100">
                <input
                  value={section.name}
                  onChange={(e) => renameSection(si, e.target.value)}
                  disabled={locked}
                  className="flex-1 text-sm font-semibold text-gray-900 bg-transparent focus:outline-none disabled:text-gray-600"
                />
                <span className="text-sm text-gray-500 tabular-nums">{money(sectionNet)}</span>
                {!locked && (
                  <>
                    <button type="button" onClick={() => moveSection(si, -1)} disabled={si === 0}
                      className="text-gray-300 hover:text-gray-600 disabled:opacity-30 px-1" title="Move section up">↑</button>
                    <button type="button" onClick={() => moveSection(si, 1)} disabled={si === sections.length - 1}
                      className="text-gray-300 hover:text-gray-600 disabled:opacity-30 px-1" title="Move section down">↓</button>
                    <button type="button" onClick={() => removeSection(si)}
                      className="text-gray-300 hover:text-red-600 px-1" title="Delete section">×</button>
                  </>
                )}
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-[11px] uppercase text-gray-400">
                      <th className="text-left px-3 py-1.5 font-medium">Description</th>
                      <th className="text-right px-2 py-1.5 font-medium w-20">Qty</th>
                      <th className="text-left px-2 py-1.5 font-medium w-16">Unit</th>
                      <th className="text-right px-2 py-1.5 font-medium w-24">Rate</th>
                      <th className="text-right px-2 py-1.5 font-medium w-24">Net</th>
                      <th className="text-center px-2 py-1.5 font-medium w-16" title="Provisional — to be confirmed on site">Prov.</th>
                      <th className="w-24"></th>
                    </tr>
                  </thead>
                  <tbody>
                    {section.lines.length === 0 && (
                      <tr><td colSpan={7} className="px-3 py-4 text-center text-sm text-gray-400">No lines in this section yet.</td></tr>
                    )}
                    {section.lines.map((line, li) => {
                      const net = lineNet({ qty: num(line.qty), rate: num(line.rate), net: undefined });
                      const unpriced = num(line.rate) === undefined;
                      return (
                        <tr key={line.id} className={`border-t border-gray-50 ${line.provisional ? 'bg-amber-50/40' : ''}`}>
                          <td className="px-3 py-1.5">
                            <input
                              value={line.description}
                              onChange={(e) => setLine(si, li, { description: e.target.value })}
                              disabled={locked}
                              placeholder="What is being done"
                              className="w-full bg-transparent focus:outline-none disabled:text-gray-600"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              value={line.qty}
                              onChange={(e) => setLine(si, li, { qty: e.target.value })}
                              disabled={locked}
                              inputMode="decimal"
                              className="w-full text-right bg-transparent focus:outline-none disabled:text-gray-600"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              value={line.unit}
                              onChange={(e) => setLine(si, li, { unit: e.target.value })}
                              disabled={locked}
                              placeholder="m2"
                              className="w-full bg-transparent focus:outline-none disabled:text-gray-600"
                            />
                          </td>
                          <td className="px-2 py-1.5">
                            <input
                              value={line.rate}
                              onChange={(e) => setLine(si, li, { rate: e.target.value })}
                              disabled={locked}
                              inputMode="decimal"
                              placeholder="—"
                              className={`w-full text-right bg-transparent focus:outline-none disabled:text-gray-600 ${unpriced ? 'placeholder-amber-500' : ''}`}
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right tabular-nums text-gray-700">
                            {unpriced ? <span className="text-amber-600 text-xs">unpriced</span> : money(net)}
                          </td>
                          <td className="px-2 py-1.5 text-center">
                            <input
                              type="checkbox"
                              checked={line.provisional}
                              onChange={(e) => setLine(si, li, { provisional: e.target.checked })}
                              disabled={locked}
                              title="Provisional — confirm on site before it is committed"
                              className="accent-amber-500"
                            />
                          </td>
                          <td className="px-2 py-1.5 text-right whitespace-nowrap">
                            {!locked && (
                              <>
                                <button type="button" onClick={() => moveLine(si, li, -1)} disabled={li === 0}
                                  className="text-gray-300 hover:text-gray-600 disabled:opacity-30 px-1" title="Move up">↑</button>
                                <button type="button" onClick={() => moveLine(si, li, 1)} disabled={li === section.lines.length - 1}
                                  className="text-gray-300 hover:text-gray-600 disabled:opacity-30 px-1" title="Move down">↓</button>
                                <button type="button" onClick={() => removeLine(si, li)}
                                  className="text-gray-300 hover:text-red-600 px-1" title="Delete line">×</button>
                              </>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {!locked && (
                <div className="px-3 py-2 border-t border-gray-50">
                  <button type="button" onClick={() => addLine(si)}
                    className="text-xs text-gray-500 hover:text-gray-900">+ Add a line</button>
                </div>
              )}
            </div>
          );
        })}

        {!locked && (
          <button type="button" onClick={addSection}
            className="text-sm px-3 py-1.5 rounded-md border border-dashed border-gray-300 text-gray-500 hover:border-gray-400 hover:text-gray-700 w-full">
            + Add a section (a room or an area)
          </button>
        )}
      </div>

      {/* ── Totals + notes ─────────────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-lg border border-gray-200 p-4">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">Notes on the quote</h2>
          <textarea
            value={notes}
            onChange={(e) => { setNotes(e.target.value); setDirty(true); }}
            disabled={locked}
            rows={6}
            placeholder="Access, sequencing, what the client said about budget or timescale…"
            className="w-full text-sm border border-gray-200 rounded-md px-2 py-1.5 focus:outline-none focus:ring-2 focus:ring-brand-green disabled:bg-gray-50"
          />
        </div>

        <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500">Net</span>
            <span className="font-semibold tabular-nums">{money(totals.net)}</span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-gray-500 flex items-center gap-2">
              VAT
              <input
                type="number" min={0} max={100} step={0.5}
                value={vatRate}
                onChange={(e) => { setVatRate(Number(e.target.value) || 0); setDirty(true); }}
                disabled={locked}
                className="w-16 text-right text-xs border border-gray-200 rounded px-1 py-0.5 disabled:bg-gray-50"
              />%
            </span>
            <span className="tabular-nums">{money(totals.vat)}</span>
          </div>
          <div className="flex items-center justify-between text-base border-t border-gray-100 pt-2">
            <span className="font-semibold text-gray-900">Total</span>
            <span className="font-bold tabular-nums text-gray-900">{money(totals.total)}</span>
          </div>
          {totals.provisional_net > 0 && (
            <p className="text-xs text-amber-700 pt-1">
              {money(totals.provisional_net)} of the net is provisional — to be confirmed on site before it is committed.
            </p>
          )}
          {unpricedCount > 0 && (
            <p className="text-xs text-amber-700">
              {unpricedCount} line{unpricedCount === 1 ? ' has' : 's have'} no rate yet and count as nothing in this total.
            </p>
          )}
        </div>
      </div>

      {/* ── Actions ────────────────────────────────────────────────────────── */}
      <div className="sticky bottom-0 bg-white/95 backdrop-blur border-t border-gray-200 -mx-4 px-4 py-3 flex flex-wrap items-center gap-2">
        {!locked && (
          <button type="button" onClick={() => save()} disabled={!!busy}
            className="text-sm px-4 py-2 rounded-md bg-gray-900 text-white font-medium hover:bg-gray-800 disabled:opacity-50">
            {busy === 'save' ? 'Saving…' : 'Save'}
          </button>
        )}

        {NEXT_STATUSES[quote.status].map((next) => (
          <button
            key={next}
            type="button"
            onClick={() => changeStatus(next)}
            disabled={!!busy}
            className={`text-sm px-3 py-2 rounded-md border font-medium disabled:opacity-50 ${
              next === 'accepted' ? 'border-green-300 text-green-800 hover:bg-green-50'
                : next === 'declined' ? 'border-red-200 text-red-700 hover:bg-red-50'
                  : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
          >
            {next === 'sent' && quote.status === 'draft' ? 'Mark as sent'
              : next === 'draft' ? 'Pull back to draft'
                : next === 'accepted' ? 'Mark accepted' : 'Mark declined'}
          </button>
        ))}

        {quote.status === 'accepted' && !quote.project_id && (
          <button type="button" onClick={convert} disabled={!!busy}
            className="text-sm px-4 py-2 rounded-md bg-brand-green text-gray-900 font-semibold hover:brightness-95 disabled:opacity-50 ml-auto">
            {busy === 'convert' ? 'Converting…' : 'Convert to project'}
          </button>
        )}
        {quote.project_id && (
          <a href={`/project-hub/project/${quote.project_id}/`}
            className="text-sm px-4 py-2 rounded-md border border-gray-300 hover:bg-gray-50 ml-auto">
            Open the project
          </a>
        )}
      </div>
    </div>
  );
}
