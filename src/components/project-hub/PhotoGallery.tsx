import { useState, useRef } from 'react';
import type { EntryFile, FileType } from '../../types/diary';

interface Props {
  entryId: string;
  /** The entry's *whole* file list. The gallery shows only its own slice of it
   *  (see `shown` below) but edits are applied to the full list, so the parent
   *  can keep one array for every gallery on the page. */
  files: EntryFile[];
  fileType?: FileType;
  /**
   * Id of the row these photos belong to — a variation or a delivery. Omit for
   * the entry's general photos, which belong to the day rather than to any row.
   */
  linkedTo?: string;
  /** Tighter layout, for galleries embedded in a table row. */
  compact?: boolean;
  onFilesChange: (files: EntryFile[]) => void;
}

const ACCEPTED_TYPES = 'image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf';
const MAX_SIZE_MB = 10;
const MAX_SIZE = MAX_SIZE_MB * 1024 * 1024;

interface UploadingFile {
  id: string;
  name: string;
  progress: number;
  preview?: string;
  error?: string;
}

/**
 * A position fix, asked for once and cached for the session.
 *
 * Never awaited before an upload: a photo with no coordinates is worth far more
 * than a photo not taken because the phone was still hunting for satellites
 * inside a half-built extension.
 */
let cachedFix: { lat: number; lng: number } | null = null;

function requestFix(): void {
  if (cachedFix || typeof navigator === 'undefined' || !navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      cachedFix = { lat: pos.coords.latitude, lng: pos.coords.longitude };
    },
    // Silent on failure — location is a bonus on a site photo, not a requirement,
    // and a permission prompt refused once shouldn't nag on every shutter press.
    () => {},
    { enableHighAccuracy: false, timeout: 5000, maximumAge: 300000 }
  );
}

/** Ask Claude to caption freshly uploaded photos. Batched at the API's limit of 20. */
async function fetchCaptions(
  ids: string[]
): Promise<Map<string, { ai_caption?: string; ai_tags?: string; ai_status: string }>> {
  const out = new Map<string, { ai_caption?: string; ai_tags?: string; ai_status: string }>();

  for (let i = 0; i < ids.length; i += 20) {
    const batch = ids.slice(i, i + 20);
    try {
      const res = await fetch('/api/photos/caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_ids: batch }),
      });
      if (!res.ok) continue;
      const data = await res.json();
      for (const r of data.results ?? []) {
        out.set(r.id, {
          ai_caption: r.ai_caption,
          // The column holds JSON; the endpoint returns a real array. Store the
          // column's shape so anything reading either agrees.
          ai_tags: r.ai_tags ? JSON.stringify(r.ai_tags) : undefined,
          ai_status: r.ai_status,
        });
      }
    } catch {
      // A caption is a convenience. Losing one must never surface as an upload
      // failure — the photo, which is the evidence, is already safely stored.
    }
  }

  return out;
}

export default function PhotoGallery({
  entryId,
  files,
  fileType = 'photo',
  linkedTo,
  compact = false,
  onFilesChange,
}: Props) {
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const [captioning, setCaptioning] = useState<Set<string>>(new Set());
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(selectedFiles: FileList | null) {
    if (!selectedFiles || selectedFiles.length === 0) return;

    // Warm the position fix while the user is still choosing/shooting, so the
    // first upload usually has coordinates without ever having waited for them.
    requestFix();

    const newUploading: UploadingFile[] = [];

    for (const file of Array.from(selectedFiles)) {
      // Client-side validation
      if (file.size > MAX_SIZE) {
        newUploading.push({
          id: crypto.randomUUID(),
          name: file.name,
          progress: 0,
          error: `Too large (${(file.size / 1024 / 1024).toFixed(1)}MB). Max ${MAX_SIZE_MB}MB.`,
        });
        continue;
      }

      const uploadId = crypto.randomUUID();
      const preview = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;

      newUploading.push({ id: uploadId, name: file.name, progress: 0, preview });
    }

    setUploading((prev) => [...prev, ...newUploading]);

    // The running list. `files` is a prop captured at render, so it does not
    // change as this loop progresses — appending to it each time would keep only
    // the last upload of a burst. Burst shooting makes that failure routine.
    let current = files;
    const captionable: string[] = [];

    // Upload each file
    for (let i = 0; i < Array.from(selectedFiles).length; i++) {
      const file = selectedFiles[i];
      const uploadItem = newUploading[i];

      if (uploadItem.error) continue;

      try {
        setUploading((prev) =>
          prev.map((u) => (u.id === uploadItem.id ? { ...u, progress: 30 } : u))
        );

        const formData = new FormData();
        formData.append('file', file);
        formData.append('entry_id', entryId);
        formData.append('file_type', fileType);
        if (linkedTo) formData.append('linked_to', linkedTo);

        // When the shutter fired, not when the upload landed — a diary ordered
        // by upload time reads wrong the moment anything is queued offline.
        if (file.lastModified) {
          formData.append('taken_at', new Date(file.lastModified).toISOString());
        }
        if (cachedFix) {
          formData.append('lat', String(cachedFix.lat));
          formData.append('lng', String(cachedFix.lng));
        }

        const res = await fetch('/api/photos/upload', {
          method: 'POST',
          body: formData,
        });

        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Upload failed');
        }

        setUploading((prev) =>
          prev.map((u) => (u.id === uploadItem.id ? { ...u, progress: 90 } : u))
        );

        const data = await res.json();

        // Add to files list
        const newFile: EntryFile = {
          id: data.id,
          entry_id: entryId,
          r2_key: data.r2_key,
          filename: data.filename,
          file_type: data.file_type,
          mime_type: data.mime_type,
          size_bytes: data.size_bytes,
          caption: data.caption,
          linked_to: linkedTo,
          client_visible: 0,
          ai_status: data.ai_status,
          taken_at: data.taken_at,
          lat: data.lat,
          lng: data.lng,
          created_at: new Date().toISOString(),
        };

        current = [...current, newFile];
        onFilesChange(current);

        // The server marks only real image types pending; PDFs and HEIC can't
        // be sent to the vision model at all.
        if (data.ai_status === 'pending') captionable.push(data.id);

        // Remove from uploading
        setUploading((prev) => prev.filter((u) => u.id !== uploadItem.id));

        // Clean up preview URL
        if (uploadItem.preview) URL.revokeObjectURL(uploadItem.preview);
      } catch (err: any) {
        setUploading((prev) =>
          prev.map((u) =>
            u.id === uploadItem.id ? { ...u, progress: 0, error: err.message } : u
          )
        );
      }
    }

    // Captioning runs after the photos are safely stored, never in front of
    // them: the upload is the evidence, the caption is the convenience.
    if (captionable.length) {
      setCaptioning((prev) => new Set([...prev, ...captionable]));
      const captions = await fetchCaptions(captionable);
      setCaptioning((prev) => {
        const next = new Set(prev);
        for (const id of captionable) next.delete(id);
        return next;
      });
      if (captions.size) {
        onFilesChange(
          current.map((f) => {
            const c = captions.get(f.id);
            return c ? { ...f, ...c } : f;
          })
        );
      }
    }
  }

  /** Re-run captioning for photos whose first attempt failed. */
  async function retryCaption(file: EntryFile) {
    setCaptioning((prev) => new Set(prev).add(file.id));
    const captions = await fetchCaptions([file.id]);
    setCaptioning((prev) => {
      const next = new Set(prev);
      next.delete(file.id);
      return next;
    });
    const c = captions.get(file.id);
    if (c) onFilesChange(files.map((f) => (f.id === file.id ? { ...f, ...c } : f)));
  }

  async function handleDelete(file: EntryFile) {
    if (!confirm(`Delete ${file.filename}?`)) return;

    try {
      const res = await fetch(`/api/photos/${encodeURIComponent(file.r2_key)}`, {
        method: 'DELETE',
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Delete failed');
      }

      onFilesChange(files.filter((f) => f.id !== file.id));
    } catch (err: any) {
      alert(err.message || 'Failed to delete file');
    }
  }

  function dismissError(uploadId: string) {
    setUploading((prev) => prev.filter((u) => u.id !== uploadId));
  }

  // This gallery's own slice: its file type, and either the row it's attached
  // to or — for the day's general photos — the files attached to no row at all.
  const shown = files.filter(
    (f) => f.file_type === fileType && (linkedTo ? f.linked_to === linkedTo : !f.linked_to)
  );
  const imageFiles = shown.filter((f) => f.mime_type.startsWith('image/'));
  const docFiles = shown.filter((f) => !f.mime_type.startsWith('image/'));

  return (
    <div className={compact ? 'space-y-2' : 'space-y-4'}>
      {/* Upload buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          className={`inline-flex items-center gap-2 bg-[#AEDE4A] hover:bg-[#9BCF3A] text-gray-900 font-semibold rounded-md transition-colors ${
            compact ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2.5 text-sm'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className={compact ? 'h-4 w-4' : 'h-5 w-5'} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
          </svg>
          {compact ? 'Photo' : 'Take Photo'}
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className={`inline-flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-md transition-colors ${
            compact ? 'px-2.5 py-1.5 text-xs' : 'px-4 py-2.5 text-sm'
          }`}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className={compact ? 'h-4 w-4' : 'h-5 w-5'} viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
          {compact ? 'Upload' : 'Upload Files'}
        </button>

        {/* Hidden file inputs */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
        <input
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES}
          multiple
          onChange={(e) => handleFiles(e.target.files)}
          className="hidden"
        />
      </div>

      {/* Uploading progress */}
      {uploading.length > 0 && (
        <div className="space-y-2">
          {uploading.map((u) => (
            <div
              key={u.id}
              className={`flex items-center gap-3 p-3 rounded-md border ${
                u.error ? 'border-red-200 bg-red-50' : 'border-gray-200 bg-gray-50'
              }`}
            >
              {u.preview && (
                <img src={u.preview} alt="" className="w-10 h-10 rounded object-cover flex-shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-gray-900 truncate">{u.name}</div>
                {u.error ? (
                  <div className="text-xs text-red-600">{u.error}</div>
                ) : (
                  <div className="w-full bg-gray-200 rounded-full h-1.5 mt-1">
                    <div
                      className="bg-[#AEDE4A] h-1.5 rounded-full transition-all duration-300"
                      style={{ width: `${u.progress}%` }}
                    />
                  </div>
                )}
              </div>
              {u.error && (
                <button
                  type="button"
                  onClick={() => dismissError(u.id)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                  </svg>
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Photo grid */}
      {imageFiles.length > 0 && (
        <div className={`grid gap-3 ${compact ? 'grid-cols-3 sm:grid-cols-5' : 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4'}`}>
          {imageFiles.map((file) => (
            <div key={file.id} className="space-y-1">
              <div className="group relative aspect-square rounded-lg overflow-hidden bg-gray-100">
                <img
                  src={`/api/photos/${encodeURIComponent(file.r2_key)}`}
                  alt={file.caption || file.ai_caption || file.filename}
                  className="w-full h-full object-cover cursor-pointer"
                  onClick={() => setLightbox(file.r2_key)}
                  loading="lazy"
                />
                {/* Delete sits in a corner tab rather than a hover overlay: there
                    is no hover on a phone, and this gallery is used on a phone. */}
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(file);
                  }}
                  className="absolute top-1 right-1 p-1.5 bg-black/50 hover:bg-red-600 text-white rounded-md transition-colors"
                  title="Delete"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>

              {/* The caption. A person's words win; Claude's are shown as a clearly
                  machine-written suggestion beneath, never written over the top. */}
              {file.caption ? (
                <p className="text-xs text-gray-700 leading-snug line-clamp-2">{file.caption}</p>
              ) : captioning.has(file.id) ? (
                <p className="text-xs text-gray-400 italic">Describing…</p>
              ) : file.ai_caption ? (
                <p className="text-xs text-gray-500 leading-snug line-clamp-2" title={file.ai_caption}>
                  <span className="text-[#6B8F2E] font-medium">AI</span> {file.ai_caption}
                </p>
              ) : file.ai_status === 'failed' ? (
                <button
                  type="button"
                  onClick={() => retryCaption(file)}
                  className="text-xs text-gray-400 hover:text-gray-600 underline"
                >
                  Couldn't describe — retry
                </button>
              ) : null}
            </div>
          ))}
        </div>
      )}

      {/* Document files list */}
      {docFiles.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700">Documents</h4>
          {docFiles.map((file) => (
            <div key={file.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-md border border-gray-200">
              <div className="w-8 h-8 rounded bg-gray-200 flex items-center justify-center flex-shrink-0">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <a
                  href={`/api/photos/${encodeURIComponent(file.r2_key)}`}
                  target="_blank"
                  rel="noopener"
                  className="text-sm font-medium text-gray-900 hover:text-[#AEDE4A] truncate block"
                >
                  {file.filename}
                </a>
                <div className="text-xs text-gray-400">
                  {file.size_bytes ? `${(file.size_bytes / 1024).toFixed(0)} KB` : ''}
                </div>
              </div>
              <button
                type="button"
                onClick={() => handleDelete(file)}
                className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                title="Delete"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {shown.length === 0 && uploading.length === 0 && !compact && (
        <div className="text-center py-6 text-sm text-gray-400">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mx-auto mb-2 text-gray-300" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
          </svg>
          No photos yet. Take a photo or upload files.
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            onClick={() => setLightbox(null)}
            className="absolute top-4 right-4 p-2 text-white/80 hover:text-white"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
          <img
            src={`/api/photos/${encodeURIComponent(lightbox)}`}
            alt=""
            className="max-w-full max-h-full object-contain"
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      )}
    </div>
  );
}
