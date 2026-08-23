import { useState, useCallback, useEffect, useRef } from 'react';
import { useStore } from '@nanostores/react';
import PersonnelManager from './PersonnelManager';
import ActivityTable from './ActivityTable';
import DelayTable from './DelayTable';
import WeatherWidget from './WeatherWidget';
import SupplierSelect from './SupplierSelect';
import PhotoGallery from './PhotoGallery';
import VoiceRecorder from './VoiceRecorder';
import type { PersonnelItem } from './PersonnelManager';
import type { ActivityItem } from './ActivityTable';
import type { DelayItem } from './DelayTable';
import type {
  WeatherData, Project, EntryFile, FileType, VoiceNote, DiaryDraftPayload,
} from '../../types/diary';
import { $isOnline, $pendingSyncCount } from '../../stores/offline';
import { queueEntrySave, requestEntrySync, getSyncQueueCount } from '../../lib/offline';
import { generateId } from '../../lib/ids';

/**
 * Above this many client-visible photos we *advise* trimming the daily summary,
 * but never enforce it. There is deliberately no maximum: the day a problem is
 * uncovered is the day the record needs the most photos, and that is the worst
 * possible moment to silently drop evidence.
 */
const CLIENT_PHOTO_ADVISORY = 10;

// Row ids are minted here, in the form, and preserved by the server on save, so
// that a variation or delivery keeps its identity across autosaves and can be
// referenced by a photo. See lib/diary-children.ts.
interface VariationItem {
  id?: string;
  description: string;
  hours_required: number | '';
  client_visible?: boolean;
}

interface MaterialItem {
  id?: string;
  supplier: string;
  items: string;
  date_required: string;
  client_visible?: boolean;
}

interface EquipmentItem {
  id?: string;
  equipment: string;
  supplier: string;
  client_visible?: boolean;
}

interface DeliveryItem {
  id?: string;
  supplier: string;
  notes: string;
  client_visible?: boolean;
}

interface FormData {
  date: string;
  start_time: string;
  end_time: string;
  site_manager: string;
  notes: string;
  status: string;
  personnel: PersonnelItem[];
  activities: ActivityItem[];
  delays: DelayItem[];
  variations: VariationItem[];
  materials_required: MaterialItem[];
  equipment_hire: EquipmentItem[];
  deliveries: DeliveryItem[];
  weather_temp: number | null;
  weather_wind: number | null;
  weather_humidity: number | null;
  weather_condition: string | null;
  weather_icon: string | null;
  client_released: boolean;
  weather_visible: boolean;
  notes_visible: boolean;
}

interface Props {
  projectId: string;
  project: Project;
  entryId?: string;
  initialData?: Partial<FormData>;
  initialFiles?: EntryFile[];
  suppliers: string[];
  userName?: string;
  yesterdayData?: Partial<FormData> | null;
  /** Can edit the header (time, site manager) and personnel — managers/admins/owners. */
  canManageEntry?: boolean;
  /** Can vet and release content to the client — not operatives. */
  canRelease?: boolean;
  /** Can delete the whole entry — staff (owner/admin/manager). */
  canDelete?: boolean;
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function nowTime() {
  return new Date().toTimeString().slice(0, 5);
}

/** Collapsible section wrapper */
function Section({
  title,
  icon,
  children,
  defaultOpen = false,
  badge,
}: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
  badge?: number;
}) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="text-gray-400">{icon}</span>
          <span className="text-sm font-semibold text-gray-900">{title}</span>
          {badge !== undefined && badge > 0 && (
            <span className="inline-flex items-center justify-center w-5 h-5 text-xs font-medium bg-[#AEDE4A]/20 text-[#6B8F2E] rounded-full">
              {badge}
            </span>
          )}
        </div>
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={`h-4 w-4 text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`}
          viewBox="0 0 20 20"
          fill="currentColor"
        >
          <path fillRule="evenodd" d="M5.293 7.293a1 1 0 011.414 0L10 10.586l3.293-3.293a1 1 0 111.414 1.414l-4 4a1 1 0 01-1.414 0l-4-4a1 1 0 010-1.414z" clipRule="evenodd" />
        </svg>
      </button>
      {open && <div className="px-4 pb-4 border-t border-gray-100 pt-3">{children}</div>}
    </div>
  );
}

export default function DiaryForm({ projectId, project, entryId: initialEntryId, initialData, initialFiles, suppliers, userName, yesterdayData, canManageEntry = true, canRelease = true, canDelete = false }: Props) {
  // Tracked in state so that once a brand-new entry is created (incl. via
  // auto-save) we switch to editing it instead of re-creating duplicates.
  const [entryId, setEntryId] = useState<string | undefined>(initialEntryId);
  const isEdit = !!entryId;
  const [files, setFiles] = useState<EntryFile[]>(initialFiles ?? []);
  const isOnline = useStore($isOnline);

  const [form, setForm] = useState<FormData>({
    date: initialData?.date ?? today(),
    start_time: initialData?.start_time ?? '08:00',
    end_time: initialData?.end_time ?? '17:00',
    site_manager: initialData?.site_manager ?? userName ?? '',
    notes: initialData?.notes ?? '',
    status: initialData?.status ?? 'draft',
    personnel: initialData?.personnel ?? [],
    activities: initialData?.activities ?? [],
    delays: initialData?.delays ?? [],
    variations: initialData?.variations ?? [],
    materials_required: initialData?.materials_required ?? [],
    equipment_hire: initialData?.equipment_hire ?? [],
    deliveries: initialData?.deliveries ?? [],
    weather_temp: initialData?.weather_temp ?? null,
    weather_wind: initialData?.weather_wind ?? null,
    weather_humidity: initialData?.weather_humidity ?? null,
    weather_condition: initialData?.weather_condition ?? null,
    weather_icon: initialData?.weather_icon ?? null,
    client_released: initialData?.client_released ?? false,
    weather_visible: initialData?.weather_visible ?? false,
    notes_visible: initialData?.notes_visible ?? false,
  });

  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle');

  // Voice notes recorded against this day, and the state of writing it up.
  const [voiceNotes, setVoiceNotes] = useState<VoiceNote[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [uncertain, setUncertain] = useState<string[]>([]);
  const [draftId, setDraftId] = useState<string | null>(null);
  // Once the entry is being deleted, block any further saves — otherwise the
  // autosave below would re-create the very entry we just removed (the
  // one-per-day constraint makes it reappear under the same identity).
  const deletedRef = useRef(false);

  // Auto-save draft every 30 seconds. Use a ref so the interval always calls
  // the latest handleSave (which knows the current entryId) — otherwise a stale
  // closure would keep POSTing a new entry that already exists (409 loop).
  const handleSaveRef = useRef<(isAutoSave?: boolean) => void>();
  useEffect(() => {
    if (form.status !== 'draft') return;
    const timer = setInterval(() => {
      if (deletedRef.current) return;
      handleSaveRef.current?.(true);
    }, 30000);
    return () => clearInterval(timer);
  }, [form.status]);

  // Voice notes already recorded against this day.
  useEffect(() => {
    if (!entryId) return;
    let cancelled = false;
    fetch(`/api/voice?entry_id=${encodeURIComponent(entryId)}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!cancelled && d?.notes) setVoiceNotes(d.notes);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [entryId]);

  // Capture mode drafts the day, then sends the operative here with ?draft=<id>.
  // The draft is fetched and merged in on arrival, so the write-up lands in the
  // real form — the place where it can be corrected before anyone saves it.
  useEffect(() => {
    const draftParam = new URLSearchParams(window.location.search).get('draft');
    if (!draftParam) return;

    // Clear it immediately: a refresh must not merge the same draft twice, and
    // duplicated activities are worse than a lost one.
    window.history.replaceState({}, '', window.location.pathname);

    fetch(`/api/drafts/${draftParam}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (!d?.payload) {
          setDraftError("Couldn't load that write-up — the recordings are still on the day.");
          return;
        }
        applyDraft(d.payload as DiaryDraftPayload);
        setUncertain(d.payload.uncertain ?? []);
        setDraftId(draftParam);
      })
      .catch(() => setDraftError('Could not load the write-up.'));
    // Once, on mount. Re-running would re-merge.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleDelete() {
    if (!entryId) return;
    if (!confirm('Delete this whole diary entry? This removes its activities, personnel and photos and cannot be undone.')) return;
    deletedRef.current = true; // stop autosave re-creating it
    setSaving(true);
    try {
      const res = await fetch(`/api/entries/${entryId}`, { method: 'DELETE' });
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error || 'Delete failed');
      window.location.href = `/project-hub/project/${projectId}/diary/`;
    } catch (err: any) {
      deletedRef.current = false;
      setSaving(false);
      alert(err.message || 'Could not delete this entry.');
    }
  }

  function updateField<K extends keyof FormData>(field: K, value: FormData[K]) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setSaveStatus('idle');
  }

  // ── Client-visibility (vetting) helpers ──
  // Item arrays in form state that support per-item client visibility.
  type VisibleArrayKey =
    | 'personnel' | 'activities' | 'delays' | 'variations'
    | 'materials_required' | 'equipment_hire' | 'deliveries';

  function toggleItemVisible(field: VisibleArrayKey, index: number) {
    setForm((prev) => {
      const arr = [...(prev[field] as { client_visible?: boolean }[])];
      arr[index] = { ...arr[index], client_visible: !arr[index].client_visible };
      return { ...prev, [field]: arr } as FormData;
    });
    setSaveStatus('idle');
  }

  function setAllItemsVisible(visible: boolean) {
    const keys: VisibleArrayKey[] = [
      'personnel', 'activities', 'delays', 'variations',
      'materials_required', 'equipment_hire', 'deliveries',
    ];
    setForm((prev) => {
      const next = { ...prev };
      for (const k of keys) {
        next[k] = (prev[k] as { client_visible?: boolean }[]).map((item) => ({
          ...item,
          client_visible: visible,
        })) as any;
      }
      next.weather_visible = visible && prev.weather_condition !== null;
      next.notes_visible = visible && !!prev.notes;
      return next;
    });
    // Photos are persisted separately — flip them all too.
    files.forEach((f) => {
      if (f.mime_type.startsWith('image/') && !!f.client_visible !== visible) {
        togglePhotoVisible(f);
      }
    });
    setSaveStatus('idle');
  }

  // Photos aren't part of the form save (they use the upload/delete API),
  // so their visibility flag is persisted immediately via PATCH.
  async function togglePhotoVisible(file: EntryFile) {
    const next = !file.client_visible;
    setFiles((prev) =>
      prev.map((f) => (f.id === file.id ? { ...f, client_visible: next ? 1 : 0 } : f))
    );
    try {
      const res = await fetch(`/api/photos/${encodeURIComponent(file.r2_key)}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_visible: next }),
      });
      if (!res.ok) throw new Error('Failed');
    } catch {
      // Revert on failure
      setFiles((prev) =>
        prev.map((f) => (f.id === file.id ? { ...f, client_visible: next ? 0 : 1 } : f))
      );
    }
  }

  /**
   * Deleting a variation or delivery takes its photos with it — otherwise they
   * would linger in R2 attached to a row that no longer exists, and show up in
   * no gallery at all.
   */
  async function deleteFilesLinkedTo(rowId?: string) {
    if (!rowId) return;
    const orphaned = files.filter((f) => f.linked_to === rowId);
    if (orphaned.length === 0) return;

    setFiles((prev) => prev.filter((f) => f.linked_to !== rowId));
    await Promise.all(
      orphaned.map((f) =>
        fetch(`/api/photos/${encodeURIComponent(f.r2_key)}`, { method: 'DELETE' }).catch(() => {})
      )
    );
  }

  const handleWeatherLoaded = useCallback((data: WeatherData) => {
    setForm((prev) => ({
      ...prev,
      weather_temp: data.temp,
      weather_wind: data.wind,
      weather_humidity: data.humidity,
      weather_condition: data.condition,
      weather_icon: data.icon,
    }));
  }, []);

  async function handleSave(isAutoSave = false) {
    if (saving || deletedRef.current) return;
    setSaving(true);

    const payload = {
      project_id: projectId,
      ...form,
      personnel: form.personnel.filter((p) => p.name.trim()),
      activities: form.activities.filter((a) => a.task.trim()),
      delays: form.delays.filter((d) => d.task.trim() && d.reason.trim()),
      variations: form.variations.filter((v) => v.description.trim()),
      materials_required: form.materials_required.filter((m) => m.supplier && m.items.trim()),
      equipment_hire: form.equipment_hire.filter((e) => e.equipment.trim() && e.supplier),
      deliveries: form.deliveries.filter((d) => d.supplier),
    };

    const url = isEdit ? `/api/entries/${entryId}` : '/api/entries';
    const method = isEdit ? 'PUT' : 'POST';

    // Offline: queue for background sync
    if (!isOnline) {
      try {
        const queueId = entryId || `offline-${Date.now()}`;
        await queueEntrySave(queueId, url, method, payload);
        await requestEntrySync();
        const count = await getSyncQueueCount();
        $pendingSyncCount.set(count);
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
      } finally {
        setSaving(false);
      }
      return;
    }

    // Online: save directly
    try {
      let res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      // Creating but an entry for this project+date already exists → adopt it
      // and update it instead of erroring/duplicating.
      if (!isEdit && res.status === 409) {
        const existingId = await findExistingEntryId(form.date);
        if (existingId) {
          res = await fetch(`/api/entries/${existingId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload),
          });
          if (res.ok) adoptEntry(existingId);
        }
      }

      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        setSaveStatus('saved');
        // First successful create → switch to edit mode so we stop re-creating.
        if (!isEdit && data?.id) adoptEntry(data.id);
      } else {
        // The server received the request and rejected it (validation, conflict,
        // permissions). Retrying won't help, so do NOT queue it offline.
        setSaveStatus('error');
        if (!isAutoSave) {
          const err = await res.json().catch(() => ({}));
          alert(err.error || 'Failed to save entry');
        }
      }
    } catch (err: any) {
      // True network failure (fetch threw) — queue for background sync.
      try {
        const queueId = entryId || `offline-${Date.now()}`;
        await queueEntrySave(queueId, url, method, payload);
        await requestEntrySync();
        const count = await getSyncQueueCount();
        $pendingSyncCount.set(count);
        setSaveStatus('saved');
      } catch {
        setSaveStatus('error');
        if (!isAutoSave) {
          alert(err.message || 'Failed to save entry');
        }
      }
    } finally {
      setSaving(false);
    }
  }

  // Switch the form into "edit" mode for a now-persisted entry and keep the URL
  // in sync so a refresh re-opens the same entry rather than the blank /new page.
  function adoptEntry(id: string) {
    setEntryId(id);
    if (typeof window !== 'undefined' && window.location.pathname.endsWith('/diary/new')) {
      window.history.replaceState({}, '', `/project-hub/project/${projectId}/diary/${id}`);
    }
  }

  // Find an existing entry id for this project on a given date (for the
  // one-entry-per-day conflict case).
  async function findExistingEntryId(date: string): Promise<string | null> {
    try {
      const res = await fetch(`/api/entries?project_id=${projectId}`);
      if (!res.ok) return null;
      const list = await res.json();
      return Array.isArray(list) ? (list.find((e: any) => e.date === date)?.id ?? null) : null;
    } catch {
      return null;
    }
  }

  // Keep the auto-save interval pointed at the latest handleSave closure.
  handleSaveRef.current = handleSave;

  // ── Voice notes and the AI draft ──────────────────────────────────────────
  //
  // The draft is always *proposed*, never applied. A site diary is evidence: it
  // can end up in an adjudication, so the operative stays its author. Claude
  // fills the form in; the person looks at it and presses save.

  function applyDraft(payload: DiaryDraftPayload) {
    setForm((prev) => ({
      ...prev,
      // Append rather than replace — anything already typed was typed by a
      // person and outranks a machine's reading of the same day.
      activities: [
        ...prev.activities,
        ...payload.activities.map((a) => ({
          id: generateId(),
          task: a.task,
          description: a.description ?? '',
          status: a.status,
          client_visible: false,
        })),
      ] as any,
      delays: [
        ...prev.delays,
        ...payload.delays.map((d) => ({
          id: generateId(),
          task: d.task,
          reason: d.reason,
          hours_lost: d.hours_lost ?? '',
          client_visible: false,
        })),
      ] as any,
      // Operatives can't edit personnel — PersonnelManager is read-only for
      // them — so merging rows they cannot then correct would be a trap.
      personnel: canManageEntry
        ? ([
            ...prev.personnel,
            ...payload.personnel.map((p) => ({
              id: generateId(),
              name: p.name,
              role: p.role,
              hours: p.hours ?? '',
              company: p.company ?? '',
              client_visible: false,
            })),
          ] as any)
        : prev.personnel,
      variations: [
        ...prev.variations,
        ...payload.variations.map((v): VariationItem => ({
          id: generateId(),
          description: v.description,
          hours_required: v.hours_required ?? '',
          client_visible: false,
        })),
      ],
      materials_required: [
        ...prev.materials_required,
        ...payload.materials_required.map((m): MaterialItem => ({
          id: generateId(),
          supplier: m.supplier,
          items: m.items,
          date_required: m.date_required ?? '',
          client_visible: false,
        })),
      ],
      equipment_hire: [
        ...prev.equipment_hire,
        ...payload.equipment_hire.map((e): EquipmentItem => ({
          id: generateId(),
          equipment: e.equipment,
          supplier: e.supplier,
          client_visible: false,
        })),
      ],
      deliveries: [
        ...prev.deliveries,
        ...payload.deliveries.map((d): DeliveryItem => ({
          id: generateId(),
          supplier: d.supplier,
          notes: d.notes ?? '',
          client_visible: false,
        })),
      ],
      notes: [prev.notes, payload.notes].filter(Boolean).join('\n\n'),
    }));
    setSaveStatus('idle');
  }

  /** Ask Claude to write the day up from the recordings and photos. */
  async function writeUpDay() {
    if (!entryId || drafting) return;
    setDrafting(true);
    setDraftError(null);
    setUncertain([]);

    try {
      const res = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ project_id: projectId, entry_id: entryId }),
      });
      const data = await res.json();

      if (!res.ok) {
        setDraftError(data.error || 'Could not write up the day.');
        return;
      }
      if (!data.payload) {
        setDraftError(data.draft?.error || "Couldn't draft this one — write it by hand.");
        return;
      }

      applyDraft(data.payload as DiaryDraftPayload);
      // Shown, never merged: these are the things Claude could not place, and
      // they are the lines most worth a human's eye.
      setUncertain(data.payload.uncertain ?? []);
      setDraftId(data.draft.id);

      await handleSave();
      // Only record the draft as applied once the save actually landed.
      fetch(`/api/drafts/${data.draft.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: 'applied' }),
      }).catch(() => {});
    } catch {
      setDraftError('Could not reach the server. Your recordings are safe.');
    } finally {
      setDrafting(false);
    }
  }


  function copyYesterday() {
    if (!yesterdayData) return;
    setForm((prev) => ({
      ...prev,
      site_manager: yesterdayData.site_manager ?? prev.site_manager,
      start_time: yesterdayData.start_time ?? prev.start_time,
      end_time: yesterdayData.end_time ?? prev.end_time,
      personnel: (yesterdayData.personnel as any[]) ?? prev.personnel,
      activities: (yesterdayData.activities as any[]) ?? prev.activities,
      delays: [],
      variations: (yesterdayData.variations as any[]) ?? prev.variations,
      materials_required: (yesterdayData.materials_required as any[]) ?? prev.materials_required,
      equipment_hire: (yesterdayData.equipment_hire as any[]) ?? prev.equipment_hire,
      deliveries: [],
    }));
    setSaveStatus('idle');
  }

  // Calculate duration
  const duration = (() => {
    if (!form.start_time || !form.end_time) return '';
    const [sh, sm] = form.start_time.split(':').map(Number);
    const [eh, em] = form.end_time.split(':').map(Number);
    const mins = (eh * 60 + em) - (sh * 60 + sm);
    if (mins <= 0) return '';
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h${m > 0 ? ` ${m}m` : ''}`;
  })();

  // Supplier names
  const materialSuppliers = suppliers.filter((s) =>
    ['Travis Perkins', 'Howdens', 'Screwfix', 'Toolstation', 'Wickes', 'Jewson', 'Selco'].includes(s) || true
  );
  const equipmentSuppliers = suppliers.filter((s) =>
    ['HSS Hire', 'Sunbelt Rentals', 'Speedy Hire', 'Brandon Hire Station'].includes(s) || true
  );

  // ── Vetting panel data ──
  const imageFiles = files.filter((f) => f.mime_type.startsWith('image/'));
  const visiblePhotoCount = imageFiles.filter((f) => f.client_visible).length;
  const vettingCats: {
    key: VisibleArrayKey;
    label: string;
    isFilled: (item: any) => boolean;
    describe: (item: any) => string;
  }[] = [
    { key: 'personnel', label: 'Personnel', isFilled: (p) => !!p.name?.trim(),
      describe: (p) => `${p.name}${p.role === 'visitor' ? ' — visitor' : p.hours ? ` — ${p.hours}h` : ''}` },
    { key: 'activities', label: 'Activities', isFilled: (a) => !!a.task?.trim(),
      describe: (a) => a.task },
    { key: 'delays', label: 'Delays', isFilled: (d) => !!d.task?.trim() && !!d.reason?.trim(),
      describe: (d) => `${d.task} — ${d.reason}` },
    { key: 'variations', label: 'Variations', isFilled: (v) => !!v.description?.trim(),
      describe: (v) => v.description },
    { key: 'materials_required', label: 'Materials Required', isFilled: (m) => !!m.supplier && !!m.items?.trim(),
      describe: (m) => `${m.items} (${m.supplier})` },
    { key: 'equipment_hire', label: 'Equipment Hire', isFilled: (e) => !!e.equipment?.trim() && !!e.supplier,
      describe: (e) => `${e.equipment} (${e.supplier})` },
    { key: 'deliveries', label: 'Deliveries', isFilled: (d) => !!d.supplier,
      describe: (d) => `${d.supplier}${d.notes ? ` — ${d.notes}` : ''}` },
  ];

  const visibleCount =
    vettingCats.reduce(
      (sum, cat) => sum + (form[cat.key] as { client_visible?: boolean }[]).filter((i) => i.client_visible).length,
      0
    ) +
    (form.weather_visible ? 1 : 0) +
    (form.notes_visible ? 1 : 0) +
    imageFiles.filter((f) => f.client_visible).length;

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        handleSave();
      }}
      className="space-y-4 max-w-4xl"
    >
      {/* Header: Date, Time, Manager */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={form.date}
              onChange={(e) => updateField('date', e.target.value)}
              required
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] focus:border-transparent"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Start Time
            </label>
            <input
              type="time"
              value={form.start_time}
              onChange={(e) => updateField('start_time', e.target.value)}
              required
              disabled={!canManageEntry}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              End Time {duration && <span className="text-gray-400 font-normal">({duration})</span>}
            </label>
            <input
              type="time"
              value={form.end_time}
              onChange={(e) => updateField('end_time', e.target.value)}
              required
              disabled={!canManageEntry}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Site Manager</label>
            <input
              type="text"
              value={form.site_manager}
              onChange={(e) => updateField('site_manager', e.target.value)}
              required
              disabled={!canManageEntry}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] focus:border-transparent disabled:bg-gray-100 disabled:text-gray-500"
            />
          </div>
        </div>

        {/* Location + Copy yesterday */}
        <div className="mt-3 flex items-center justify-between">
          <div className="text-sm text-gray-500">
            <span className="font-medium text-gray-700">Location:</span> {project.address}, {project.postcode}
          </div>
          {!isEdit && yesterdayData && (
            <button
              type="button"
              onClick={copyYesterday}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 hover:bg-gray-200 rounded-md transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M7 9a2 2 0 012-2h6a2 2 0 012 2v6a2 2 0 01-2 2H9a2 2 0 01-2-2V9z" />
                <path d="M5 3a2 2 0 00-2 2v6a2 2 0 002 2V5h8a2 2 0 00-2-2H5z" />
              </svg>
              Copy yesterday
            </button>
          )}
        </div>
      </div>

      {/* Talk it through — the fastest way into this form is not to type. */}
      {entryId && (
        <Section
          title="Talk it through"
          defaultOpen={true}
          badge={voiceNotes.length}
          icon={
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7 4a3 3 0 016 0v4a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
            </svg>
          }
        >
          <div className="space-y-4">
            <p className="text-sm text-gray-500">
              Record what happened today and Claude will fill this form in for you.
              Nothing is saved to the diary until you check it and press save.
            </p>

            <VoiceRecorder
              entryId={entryId}
              projectId={projectId}
              notes={voiceNotes}
              onNote={(note) =>
                setVoiceNotes((prev) => {
                  const without = prev.filter((n) => n.id !== note.id);
                  return [...without, note];
                })
              }
              onError={(message) => setDraftError(message)}
            />

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={writeUpDay}
                disabled={drafting || !voiceNotes.some((n) => n.status === 'transcribed')}
                className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-md bg-[#AEDE4A] hover:bg-[#9BCF3A] text-gray-900 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
              >
                {drafting ? (
                  <>
                    <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.4 0 0 5.4 0 12h4z" />
                    </svg>
                    Writing it up…
                  </>
                ) : (
                  'Write up the day'
                )}
              </button>
              {drafting && (
                <span className="text-xs text-gray-400">This takes a few seconds.</span>
              )}
              {!drafting && !voiceNotes.some((n) => n.status === 'transcribed') && (
                <span className="text-xs text-gray-400">
                  Record a note first — a write-up built from photos alone would be guesswork.
                </span>
              )}
            </div>

            {draftError && (
              <div className="p-3 rounded-md border border-amber-200 bg-amber-50 text-sm text-amber-800">
                {draftError}
              </div>
            )}

            {/* The things Claude could not place. Shown, never merged — these are
                the lines most worth a human's eye, and burying them would defeat
                the point of collecting them. */}
            {uncertain.length > 0 && (
              <div className="p-3 rounded-md border border-gray-200 bg-gray-50">
                <h4 className="text-sm font-semibold text-gray-900 mb-1.5">Worth checking</h4>
                <p className="text-xs text-gray-500 mb-2">
                  Claude wasn't sure where these belonged. Nothing here has been added to the form.
                </p>
                <ul className="space-y-1">
                  {uncertain.map((u, i) => (
                    <li key={i} className="text-sm text-gray-700 flex gap-2">
                      <span className="text-gray-300">•</span>
                      <span>{u}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </Section>
      )}

      {/* Weather */}
      <Section
        title="Weather"
        defaultOpen={true}
        icon={
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M5.5 16a3.5 3.5 0 01-.369-6.98 4 4 0 117.753-1.977A4.5 4.5 0 1113.5 16h-8z" />
          </svg>
        }
      >
        <WeatherWidget
          lat={project.lat ?? undefined}
          lng={project.lng ?? undefined}
          weather={
            form.weather_temp !== null
              ? {
                  temp: form.weather_temp,
                  wind: form.weather_wind!,
                  humidity: form.weather_humidity!,
                  condition: form.weather_condition!,
                  icon: form.weather_icon!,
                }
              : null
          }
          onWeatherLoaded={handleWeatherLoaded}
        />
      </Section>

      {/* Personnel */}
      <Section
        title="Personnel On Site"
        defaultOpen={true}
        badge={form.personnel.filter((p) => p.name.trim()).length}
        icon={
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
          </svg>
        }
      >
        <PersonnelManager
          personnel={form.personnel}
          onChange={(p) => updateField('personnel', p)}
          readOnly={!canManageEntry}
        />
      </Section>

      {/* Activities */}
      <Section
        title="Activities / Work Completed"
        defaultOpen={true}
        badge={form.activities.length}
        icon={
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M6 2a1 1 0 00-1 1v1H4a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2h-1V3a1 1 0 10-2 0v1H7V3a1 1 0 00-1-1zm0 5a1 1 0 000 2h8a1 1 0 100-2H6z" clipRule="evenodd" />
          </svg>
        }
      >
        <ActivityTable
          activities={form.activities}
          onChange={(a) => updateField('activities', a)}
        />
      </Section>

      {/* Delays */}
      <Section
        title="Delays"
        badge={form.delays.length}
        icon={
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
          </svg>
        }
      >
        <DelayTable
          delays={form.delays}
          onChange={(d) => updateField('delays', d)}
        />
      </Section>

      {/* Variations */}
      <Section
        title="Variations"
        badge={form.variations.length}
        icon={
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" />
          </svg>
        }
      >
        <VariationsSection
          variations={form.variations}
          onChange={(v) => updateField('variations', v)}
          entryId={entryId}
          files={files}
          onFilesChange={setFiles}
          onRemoveRow={deleteFilesLinkedTo}
        />
      </Section>

      {/* Materials Required */}
      <Section
        title="Materials / Equipment Required"
        badge={form.materials_required.length}
        icon={
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M10 2a4 4 0 00-4 4v1H5a1 1 0 00-.994.89l-1 9A1 1 0 004 18h12a1 1 0 00.994-1.11l-1-9A1 1 0 0015 7h-1V6a4 4 0 00-4-4zm2 5V6a2 2 0 10-4 0v1h4zm-6 3a1 1 0 112 0 1 1 0 01-2 0zm7-1a1 1 0 100 2 1 1 0 000-2z" clipRule="evenodd" />
          </svg>
        }
      >
        <MaterialsSection
          items={form.materials_required}
          onChange={(m) => updateField('materials_required', m)}
          suppliers={materialSuppliers}
        />
      </Section>

      {/* Equipment Hire */}
      <Section
        title="Equipment Hire"
        badge={form.equipment_hire.length}
        icon={
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M6 2a2 2 0 00-2 2v12a2 2 0 002 2h8a2 2 0 002-2V7.414A2 2 0 0015.414 6L12 2.586A2 2 0 0010.586 2H6zm5 6a1 1 0 10-2 0v2H7a1 1 0 100 2h2v2a1 1 0 102 0v-2h2a1 1 0 100-2h-2V8z" clipRule="evenodd" />
          </svg>
        }
      >
        <EquipmentSection
          items={form.equipment_hire}
          onChange={(e) => updateField('equipment_hire', e)}
          suppliers={equipmentSuppliers}
        />
      </Section>

      {/* Materials Delivered */}
      <Section
        title="Materials Delivered"
        badge={form.deliveries.length}
        icon={
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path d="M8 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0zM15 16.5a1.5 1.5 0 11-3 0 1.5 1.5 0 013 0z" />
            <path d="M3 4a1 1 0 00-1 1v10a1 1 0 001 1h1.05a2.5 2.5 0 014.9 0H10a1 1 0 001-1V5a1 1 0 00-1-1H3zM14 7a1 1 0 00-1 1v6.05A2.5 2.5 0 0115.95 16H17a1 1 0 001-1v-5a1 1 0 00-.293-.707l-2-2A1 1 0 0015 7h-1z" />
          </svg>
        }
      >
        <DeliveriesSection
          items={form.deliveries}
          onChange={(d) => updateField('deliveries', d)}
          suppliers={materialSuppliers}
          entryId={entryId}
          files={files}
          onFilesChange={setFiles}
          onRemoveRow={deleteFilesLinkedTo}
        />
      </Section>

      {/* Photos & Files — the day's general photos. Photos attached to a
          variation or a delivery live on those rows instead. */}
      <Section
        title="Photos & Files"
        badge={files.filter((f) => !f.linked_to).length}
        icon={
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
          </svg>
        }
      >
        {entryId ? (
          <PhotoGallery
            entryId={entryId}
            files={files}
            onFilesChange={setFiles}
          />
        ) : (
          <p className="text-sm text-gray-400 italic">
            Save this entry first to enable photo uploads.
          </p>
        )}
      </Section>

      {/* Notes */}
      <Section
        title="Notes"
        defaultOpen={!!form.notes}
        icon={
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
          </svg>
        }
      >
        <textarea
          value={form.notes}
          onChange={(e) => updateField('notes', e.target.value)}
          placeholder="Additional notes, observations, or comments..."
          rows={4}
          className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] focus:border-transparent resize-y"
        />
      </Section>

      {/* Client Visibility / Vetting — only staff who can release to the client.
          Operatives never see or control what the client sees. */}
      {canRelease && (
      <Section
        title="Client Visibility"
        badge={visibleCount}
        icon={
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7zM12 15a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
          </svg>
        }
      >
        <p className="text-sm text-gray-500 mb-3">
          Choose exactly what the client sees. Items are <strong>hidden by default</strong> — tick what you want to share,
          then release the day. Nothing reaches the client until you release it, and you can change this any time.
        </p>

        {/* Master release toggle */}
        <label className={`flex items-start gap-3 p-3 rounded-md border mb-4 cursor-pointer transition-colors ${form.client_released ? 'border-[#AEDE4A] bg-[#AEDE4A]/10' : 'border-gray-200 bg-gray-50'}`}>
          <input
            type="checkbox"
            checked={form.client_released}
            onChange={(e) => updateField('client_released', e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-gray-300 text-[#83B81A] focus:ring-[#AEDE4A]"
          />
          <span>
            <span className="block text-sm font-semibold text-gray-900">Release this day to the client</span>
            <span className="block text-xs text-gray-500">
              {form.client_released
                ? 'The ticked items below are visible in the client report.'
                : 'While off, the client report for this day is blocked entirely.'}
            </span>
          </span>
        </label>

        {/* Quick actions */}
        <div className="flex items-center gap-3 mb-4">
          <button type="button" onClick={() => setAllItemsVisible(true)} className="text-xs font-medium text-[#83B81A] hover:underline">
            Show everything
          </button>
          <span className="text-gray-300">|</span>
          <button type="button" onClick={() => setAllItemsVisible(false)} className="text-xs font-medium text-gray-500 hover:underline">
            Hide everything
          </button>
        </div>

        {/* Entry-level fields */}
        <div className="space-y-1 mb-3">
          <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Summary fields</div>
          <label className="flex items-center gap-2 py-1 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.weather_visible}
              disabled={form.weather_condition === null}
              onChange={(e) => updateField('weather_visible', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-[#83B81A] focus:ring-[#AEDE4A] disabled:opacity-40"
            />
            Weather {form.weather_condition === null && <span className="text-xs text-gray-400">(none recorded)</span>}
          </label>
          <label className="flex items-center gap-2 py-1 text-sm text-gray-700">
            <input
              type="checkbox"
              checked={form.notes_visible}
              disabled={!form.notes}
              onChange={(e) => updateField('notes_visible', e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-[#83B81A] focus:ring-[#AEDE4A] disabled:opacity-40"
            />
            Notes {!form.notes && <span className="text-xs text-gray-400">(empty)</span>}
          </label>
        </div>

        {/* Per-item checkboxes by category */}
        {vettingCats.map((cat) => {
          const rows = (form[cat.key] as any[])
            .map((item, idx) => ({ item, idx }))
            .filter(({ item }) => cat.isFilled(item));
          if (rows.length === 0) return null;
          return (
            <div key={cat.key} className="space-y-1 mb-3">
              <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">{cat.label}</div>
              {rows.map(({ item, idx }) => (
                <label key={idx} className="flex items-center gap-2 py-1 text-sm text-gray-700">
                  <input
                    type="checkbox"
                    checked={!!item.client_visible}
                    onChange={() => toggleItemVisible(cat.key, idx)}
                    className="h-4 w-4 rounded border-gray-300 text-[#83B81A] focus:ring-[#AEDE4A]"
                  />
                  <span className="truncate">{cat.describe(item)}</span>
                </label>
              ))}
            </div>
          );
        })}

        {/* Photos */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-400">Photos</div>
            {visiblePhotoCount > 0 && (
              <div className="text-xs text-gray-400">{visiblePhotoCount} of {imageFiles.length} shown to client</div>
            )}
          </div>
          {/* Guidance, not a limit. A day where something went wrong may genuinely
              need a dozen photos, and the record should never be the thing we
              trim to keep a summary tidy. */}
          {visiblePhotoCount > CLIENT_PHOTO_ADVISORY && (
            <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-2 py-1.5">
              {visiblePhotoCount} photos selected — that's a lot for a daily summary. Fine if the
              day warrants it; otherwise consider trimming to the clearest few.
            </p>
          )}
          {!entryId ? (
            <p className="text-sm text-gray-400 italic">Save this entry first to manage photo visibility.</p>
          ) : imageFiles.length === 0 ? (
            <p className="text-sm text-gray-400 italic">No photos uploaded.</p>
          ) : (
            <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
              {imageFiles.map((file) => (
                <button
                  type="button"
                  key={file.id}
                  onClick={() => togglePhotoVisible(file)}
                  className={`relative aspect-square rounded-md overflow-hidden border-2 transition-colors ${file.client_visible ? 'border-[#AEDE4A]' : 'border-transparent opacity-60'}`}
                  title={file.client_visible ? 'Visible to client — click to hide' : 'Hidden — click to show client'}
                >
                  <img
                    src={`/api/photos/${encodeURIComponent(file.r2_key)}`}
                    alt={file.caption || file.filename}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  <span className={`absolute top-1 right-1 h-5 w-5 rounded-full flex items-center justify-center ${file.client_visible ? 'bg-[#AEDE4A] text-gray-900' : 'bg-gray-700/70 text-white'}`}>
                    {file.client_visible ? (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg>
                    ) : (
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3" viewBox="0 0 20 20" fill="currentColor"><path d="M10 12a2 2 0 100-4 2 2 0 000 4z" /><path fillRule="evenodd" d="M.458 10C1.732 5.943 5.522 3 10 3s8.268 2.943 9.542 7c-1.274 4.057-5.064 7-9.542 7S1.732 14.057.458 10zM14 10a4 4 0 11-8 0 4 4 0 018 0z" clipRule="evenodd" /></svg>
                    )}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </Section>
      )}

      {/* Save bar */}
      <div className="sticky bottom-0 bg-white border-t border-gray-200 p-4 -mx-4 md:-mx-6 lg:-mx-8 flex items-center justify-between gap-4 rounded-t-lg shadow-lg">
        <div className="text-sm text-gray-500">
          {saveStatus === 'saved' && isOnline && (
            <span className="text-green-600 flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
              </svg>
              Saved
            </span>
          )}
          {saveStatus === 'saved' && !isOnline && (
            <span className="text-amber-600 flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z" clipRule="evenodd" />
              </svg>
              Queued — will sync when online
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="text-red-500">Save failed — try again</span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {isEdit && canDelete && (
            <button
              type="button"
              onClick={handleDelete}
              disabled={saving}
              className="px-4 py-2 text-sm font-medium text-red-600 hover:text-red-700 hover:bg-red-50 rounded-md transition-colors disabled:opacity-50"
            >
              Delete entry
            </button>
          )}
          <a
            href={`/project-hub/project/${projectId}/diary/`}
            className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900 transition-colors"
          >
            Cancel
          </a>
          <button
            type="submit"
            disabled={saving}
            className="px-6 py-2 bg-[#AEDE4A] hover:bg-[#9BCF3A] text-gray-900 font-semibold rounded-md text-sm transition-colors disabled:opacity-50"
          >
            {saving ? 'Saving...' : isEdit ? 'Update Entry' : 'Save Entry'}
          </button>
        </div>
      </div>
    </form>
  );
}

/* ── Inline sub-sections ── */

/**
 * Photos attached to a single variation or delivery row, rather than to the day
 * as a whole. The row's id is minted in the form and preserved by the server, so
 * a photo can be attached to a row that hasn't been saved yet — the link resolves
 * on the next save. Uploads still need the entry itself to exist.
 */
function RowPhotos({
  entryId,
  rowId,
  fileType,
  files,
  onFilesChange,
}: {
  entryId?: string;
  rowId?: string;
  fileType: FileType;
  files: EntryFile[];
  onFilesChange: (files: EntryFile[]) => void;
}) {
  const [open, setOpen] = useState(false);

  if (!entryId || !rowId) {
    return <p className="mt-1.5 text-xs text-gray-400 italic">Save this entry first to attach photos.</p>;
  }

  const count = files.filter((f) => f.file_type === fileType && f.linked_to === rowId).length;

  return (
    <div className="mt-1.5">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-500 hover:text-[#83B81A] transition-colors"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
        </svg>
        {count > 0 ? `${count} photo${count === 1 ? '' : 's'}` : 'Add photos'}
        <span className="text-gray-300">{open ? '▲' : '▼'}</span>
      </button>
      {open && (
        <div className="mt-2 p-2 rounded-md bg-gray-50 border border-gray-200">
          <PhotoGallery
            entryId={entryId}
            files={files}
            fileType={fileType}
            linkedTo={rowId}
            compact
            onFilesChange={onFilesChange}
          />
        </div>
      )}
    </div>
  );
}

function VariationsSection({
  variations,
  onChange,
  entryId,
  files,
  onFilesChange,
  onRemoveRow,
}: {
  variations: VariationItem[];
  onChange: (v: VariationItem[]) => void;
  entryId?: string;
  files: EntryFile[];
  onFilesChange: (files: EntryFile[]) => void;
  onRemoveRow: (rowId?: string) => void;
}) {
  function add() {
    onChange([...variations, { id: generateId(), description: '', hours_required: '' }]);
  }
  function update(i: number, field: keyof VariationItem, val: string | number) {
    const u = [...variations];
    u[i] = { ...u[i], [field]: val };
    onChange(u);
  }
  function remove(i: number) {
    onRemoveRow(variations[i]?.id);
    onChange(variations.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-gray-700">Variation Orders</h4>
        <button type="button" onClick={add} className="text-xs font-medium text-[#AEDE4A] hover:text-[#83B81A] transition-colors flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
          Add Variation
        </button>
      </div>
      {variations.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No variations recorded</p>
      ) : (
        <div className="space-y-2">
          {variations.map((v, i) => (
            <div key={v.id ?? i} className="rounded-md border border-gray-200 p-2">
              <div className="flex items-start gap-2">
                <input type="text" value={v.description} onChange={(e) => update(i, 'description', e.target.value)} placeholder="Description of variation" className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] focus:border-transparent" />
                <input type="number" value={v.hours_required} onChange={(e) => update(i, 'hours_required', e.target.value ? Number(e.target.value) : '')} placeholder="Hrs" min="0" step="0.5" className="w-20 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] focus:border-transparent" />
                <button type="button" onClick={() => remove(i)} className="p-2 text-gray-400 hover:text-red-500 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>
              </div>
              <RowPhotos entryId={entryId} rowId={v.id} fileType="variation_doc" files={files} onFilesChange={onFilesChange} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function MaterialsSection({
  items,
  onChange,
  suppliers,
}: {
  items: MaterialItem[];
  onChange: (m: MaterialItem[]) => void;
  suppliers: string[];
}) {
  function add() {
    onChange([...items, { id: generateId(), supplier: '', items: '', date_required: '' }]);
  }
  function update(i: number, field: keyof MaterialItem, val: string) {
    const u = [...items];
    u[i] = { ...u[i], [field]: val };
    onChange(u);
  }
  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-gray-700">Materials Required</h4>
        <button type="button" onClick={add} className="text-xs font-medium text-[#AEDE4A] hover:text-[#83B81A] transition-colors flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
          Add Material
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No materials required</p>
      ) : (
        <div className="space-y-3">
          {items.map((m, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="flex-1 space-y-2 sm:space-y-0 sm:flex sm:gap-2">
                <div className="sm:w-48">
                  <SupplierSelect value={m.supplier} onChange={(v) => update(i, 'supplier', v)} suppliers={suppliers} label="" />
                </div>
                <input type="text" value={m.items} onChange={(e) => update(i, 'items', e.target.value)} placeholder="Items needed" className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] focus:border-transparent" />
                <input type="date" value={m.date_required} onChange={(e) => update(i, 'date_required', e.target.value)} className="sm:w-40 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] focus:border-transparent" />
              </div>
              <button type="button" onClick={() => remove(i)} className="p-2 text-gray-400 hover:text-red-500 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function EquipmentSection({
  items,
  onChange,
  suppliers,
}: {
  items: EquipmentItem[];
  onChange: (e: EquipmentItem[]) => void;
  suppliers: string[];
}) {
  function add() {
    onChange([...items, { id: generateId(), equipment: '', supplier: '' }]);
  }
  function update(i: number, field: keyof EquipmentItem, val: string) {
    const u = [...items];
    u[i] = { ...u[i], [field]: val };
    onChange(u);
  }
  function remove(i: number) {
    onChange(items.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-gray-700">Equipment Hire</h4>
        <button type="button" onClick={add} className="text-xs font-medium text-[#AEDE4A] hover:text-[#83B81A] transition-colors flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
          Add Equipment
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No equipment hire recorded</p>
      ) : (
        <div className="space-y-2">
          {items.map((e, i) => (
            <div key={i} className="flex items-start gap-2">
              <div className="flex-1 sm:flex sm:gap-2 space-y-2 sm:space-y-0">
                <input type="text" value={e.equipment} onChange={(ev) => update(i, 'equipment', ev.target.value)} placeholder="Equipment" className="w-full sm:flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] focus:border-transparent" />
                <div className="sm:w-48">
                  <SupplierSelect value={e.supplier} onChange={(v) => update(i, 'supplier', v)} suppliers={suppliers} label="" />
                </div>
              </div>
              <button type="button" onClick={() => remove(i)} className="p-2 text-gray-400 hover:text-red-500 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function DeliveriesSection({
  items,
  onChange,
  suppliers,
  entryId,
  files,
  onFilesChange,
  onRemoveRow,
}: {
  items: DeliveryItem[];
  onChange: (d: DeliveryItem[]) => void;
  suppliers: string[];
  entryId?: string;
  files: EntryFile[];
  onFilesChange: (files: EntryFile[]) => void;
  onRemoveRow: (rowId?: string) => void;
}) {
  function add() {
    onChange([...items, { id: generateId(), supplier: '', notes: '' }]);
  }
  function update(i: number, field: keyof DeliveryItem, val: string) {
    const u = [...items];
    u[i] = { ...u[i], [field]: val };
    onChange(u);
  }
  function remove(i: number) {
    onRemoveRow(items[i]?.id);
    onChange(items.filter((_, idx) => idx !== i));
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-sm font-medium text-gray-700">Deliveries Received</h4>
        <button type="button" onClick={add} className="text-xs font-medium text-[#AEDE4A] hover:text-[#83B81A] transition-colors flex items-center gap-1">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" /></svg>
          Add Delivery
        </button>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-gray-400 italic">No deliveries recorded</p>
      ) : (
        <div className="space-y-2">
          {items.map((d, i) => (
            <div key={d.id ?? i} className="rounded-md border border-gray-200 p-2">
              <div className="flex items-start gap-2">
                <div className="flex-1 sm:flex sm:gap-2 space-y-2 sm:space-y-0">
                  <div className="sm:w-48">
                    <SupplierSelect value={d.supplier} onChange={(v) => update(i, 'supplier', v)} suppliers={suppliers} label="" />
                  </div>
                  <input type="text" value={d.notes} onChange={(e) => update(i, 'notes', e.target.value)} placeholder="Delivery notes" className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A] focus:border-transparent" />
                </div>
                <button type="button" onClick={() => remove(i)} className="p-2 text-gray-400 hover:text-red-500 transition-colors"><svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" /></svg></button>
              </div>
              <RowPhotos entryId={entryId} rowId={d.id} fileType="delivery_note" files={files} onFilesChange={onFilesChange} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
