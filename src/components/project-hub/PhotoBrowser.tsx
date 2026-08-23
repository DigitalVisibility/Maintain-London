import { useEffect, useState } from 'react';

interface Photo {
  id: string;
  r2_key: string;
  filename: string;
  caption: string | null;
  file_type: string;
  mime_type: string;
  client_visible: 0 | 1;
  created_at: string;
  entry_id: string;
  entry_date: string; // YYYY-MM-DD
  project_id: string;
  project_name: string;
  url: string;
}

interface Props {
  projectId?: string;
  initialFrom?: string;
  showFilters?: boolean;
}

/** Format "2026-08-21" → "Fri 21 Aug 2026". Falls back to the raw string. */
function formatDate(ymd: string): string {
  const d = new Date(`${ymd}T00:00:00`);
  if (isNaN(d.getTime())) return ymd;
  return d.toLocaleDateString('en-GB', {
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

export default function PhotoBrowser({ projectId, initialFrom, showFilters = true }: Props) {
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState(initialFrom || '');
  const [to, setTo] = useState('');
  const [lightbox, setLightbox] = useState<number | null>(null);

  const allProjects = !projectId;

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (projectId) params.set('project_id', projectId);
        if (from) params.set('from', from);
        if (to) params.set('to', to);
        const res = await fetch(`/api/gallery?${params.toString()}`);
        const data = res.ok ? await res.json() : { photos: [] };
        if (!cancelled) setPhotos(data.photos || []);
      } catch {
        if (!cancelled) setPhotos([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [projectId, from, to]);

  // Escape / arrow keys for the lightbox.
  useEffect(() => {
    if (lightbox === null) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setLightbox(null);
      else if (e.key === 'ArrowLeft') setLightbox((i) => (i === null ? i : (i - 1 + photos.length) % photos.length));
      else if (e.key === 'ArrowRight') setLightbox((i) => (i === null ? i : (i + 1) % photos.length));
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [lightbox, photos.length]);

  // Group photos by entry_date, dates descending, preserving each photo's index
  // in the flat list so the lightbox can page through everything.
  const groups: { date: string; items: { photo: Photo; index: number }[] }[] = [];
  const byDate = new Map<string, { photo: Photo; index: number }[]>();
  photos.forEach((photo, index) => {
    const list = byDate.get(photo.entry_date) || [];
    list.push({ photo, index });
    byDate.set(photo.entry_date, list);
  });
  Array.from(byDate.keys())
    .sort((a, b) => (a < b ? 1 : a > b ? -1 : 0))
    .forEach((date) => groups.push({ date, items: byDate.get(date)! }));

  const hasFilter = Boolean(from || to);
  const current = lightbox === null ? null : photos[lightbox] ?? null;

  return (
    <div className="space-y-4">
      {/* Filters */}
      {showFilters && (
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-gray-600">
            <span className="block mb-1 font-medium">From</span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </label>
          <label className="text-xs text-gray-600">
            <span className="block mb-1 font-medium">To</span>
            <input
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
              className="px-3 py-2 border border-gray-300 rounded-md text-sm"
            />
          </label>
          {hasFilter && (
            <button
              type="button"
              onClick={() => {
                setFrom('');
                setTo('');
              }}
              className="px-3 py-2 text-sm text-gray-600 hover:text-gray-900 hover:underline"
            >
              Clear
            </button>
          )}
        </div>
      )}

      {/* Count */}
      {!loading && photos.length > 0 && (
        <p className="text-xs text-gray-500">
          {photos.length} photo{photos.length === 1 ? '' : 's'}
        </p>
      )}

      {/* States */}
      {loading ? (
        <p className="text-sm text-gray-400 py-6 text-center">Loading photos…</p>
      ) : photos.length === 0 ? (
        <p className="text-sm text-gray-400 py-6 text-center">
          {hasFilter ? 'No photos in that range.' : 'No photos yet.'}
        </p>
      ) : (
        <div className="space-y-6">
          {groups.map((group) => (
            <div key={group.date}>
              <h3 className="text-sm font-semibold text-gray-700 mb-2">{formatDate(group.date)}</h3>
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
                {group.items.map(({ photo, index }) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => setLightbox(index)}
                    className="group relative aspect-square rounded overflow-hidden bg-gray-100 focus:outline-none focus:ring-2 focus:ring-[#AEDE4A]"
                  >
                    <img
                      src={photo.url}
                      alt={photo.caption || photo.filename}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                    {photo.client_visible === 1 && (
                      <span className="absolute top-1 right-1 text-[10px] leading-none px-1.5 py-0.5 rounded-full bg-[#AEDE4A] text-gray-900 font-semibold">
                        Client
                      </span>
                    )}
                    {allProjects && (
                      <span className="absolute bottom-0 inset-x-0 px-1.5 py-1 text-[10px] leading-tight text-white text-left truncate bg-gradient-to-t from-black/70 to-transparent">
                        {photo.project_name}
                      </span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Lightbox */}
      {current && (
        <div
          className="fixed inset-0 z-50 bg-black/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          {/* Close */}
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white"
            aria-label="Close"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>

          {/* Prev */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox((i) => (i === null ? i : (i - 1 + photos.length) % photos.length));
            }}
            className="absolute left-2 sm:left-4 p-2 text-white/80 hover:text-white"
            aria-label="Previous"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
            </svg>
          </button>

          {/* Next */}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setLightbox((i) => (i === null ? i : (i + 1) % photos.length));
            }}
            className="absolute right-2 sm:right-4 p-2 text-white/80 hover:text-white"
            aria-label="Next"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M7.293 14.707a1 1 0 010-1.414L10.586 10 7.293 6.707a1 1 0 011.414-1.414l4 4a1 1 0 010 1.414l-4 4a1 1 0 01-1.414 0z" clipRule="evenodd" />
            </svg>
          </button>

          {/* Image + meta */}
          <div className="flex flex-col items-center gap-3 max-w-full" onClick={(e) => e.stopPropagation()}>
            <img
              src={current.url}
              alt={current.caption || current.filename}
              className="max-w-full max-h-[85vh] object-contain rounded"
            />
            <div className="text-center text-white/90 max-w-xl">
              {current.caption && <p className="text-sm">{current.caption}</p>}
              <p className="text-xs text-white/60 mt-1">
                {current.project_name} · {formatDate(current.entry_date)}
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
