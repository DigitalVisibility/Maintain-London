import { useEffect, useRef, useState } from 'react';

/**
 * The document hub — the project's filing cabinet, as the folder grid from the
 * wireframe. Click a folder to see its files, upload, and choose which the client
 * can see. Files marked client-visible appear in the client's portal.
 */

const FOLDERS = [
  'Drawings', 'Interior Finishes', 'Kitchen', 'Bathrooms',
  'Superseded', 'Contracts', 'Handovers', 'Progress Pics', 'Financials',
] as const;

const CLIENT_DEFAULT = new Set(['Contracts', 'Handovers', 'Progress Pics', 'Financials']);

interface Doc {
  id: string;
  folder: string;
  filename: string;
  r2_key: string;
  mime_type: string;
  size_bytes: number | null;
  client_visible: number;
  uploaded_by_name: string | null;
  created_at: string;
}

const fileSize = (b: number | null) => !b ? '' : b < 1024 * 1024 ? `${Math.round(b / 1024)} KB` : `${(b / 1024 / 1024).toFixed(1)} MB`;
const isImage = (m: string) => m.startsWith('image/');

export default function DocumentHub({ projectId, canManage, hideEmpty }: { projectId: string; canManage: boolean; hideEmpty?: boolean }) {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [busy, setBusy] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function load() {
    const res = await fetch(`/api/documents?project_id=${projectId}`);
    if (res.ok) setDocs(await res.json());
  }
  useEffect(() => { load(); }, [projectId]);

  const countFor = (folder: string) => (docs ?? []).filter((d) => d.folder === folder).length;
  const inFolder = (folder: string) => (docs ?? []).filter((d) => d.folder === folder);

  async function upload(files: FileList | null) {
    if (!files || !open) return;
    setUploading(true);
    try {
      for (const file of Array.from(files)) {
        const fd = new FormData();
        fd.append('file', file);
        fd.append('project_id', projectId);
        fd.append('folder', open);
        fd.append('client_visible', CLIENT_DEFAULT.has(open) ? 'true' : 'false');
        await fetch('/api/documents', { method: 'POST', body: fd });
      }
      await load();
    } finally { setUploading(false); if (fileRef.current) fileRef.current.value = ''; }
  }

  async function toggleVisible(doc: Doc) {
    const next = doc.client_visible ? 0 : 1;
    setDocs((prev) => prev?.map((d) => d.id === doc.id ? { ...d, client_visible: next } : d) ?? null);
    await fetch(`/api/documents/${encodeURIComponent(doc.r2_key)}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client_visible: !!next }),
    }).catch(() => load());
  }

  async function remove(doc: Doc) {
    if (!confirm(`Delete ${doc.filename}?`)) return;
    setBusy(doc.id);
    try {
      await fetch(`/api/documents/${encodeURIComponent(doc.r2_key)}`, { method: 'DELETE' });
      await load();
    } finally { setBusy(''); }
  }

  if (!docs) return <p className="text-sm text-gray-500">Loading…</p>;

  // ── Folder grid ──
  if (!open) {
    // For the client, show only folders that actually have something in them.
    const shown = hideEmpty ? FOLDERS.filter((f) => countFor(f) > 0) : FOLDERS;
    if (hideEmpty && shown.length === 0) {
      return <p className="text-sm text-gray-400">No documents shared with you yet.</p>;
    }
    return (
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {shown.map((folder) => {
          const n = countFor(folder);
          return (
            <button key={folder} type="button" onClick={() => setOpen(folder)}
              className="bg-white rounded-lg border border-gray-200 p-4 text-left hover:border-[#AEDE4A] hover:shadow-sm transition-all">
              <div className="flex items-start justify-between">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-[#AEDE4A]" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2 6a2 2 0 012-2h5l2 2h5a2 2 0 012 2v6a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" />
                </svg>
                {n > 0 && <span className="text-xs font-semibold text-gray-500 bg-gray-100 rounded-full px-2 py-0.5">{n}</span>}
              </div>
              <div className="mt-2 text-sm font-medium text-gray-900">{folder}</div>
            </button>
          );
        })}
      </div>
    );
  }

  // ── Folder view ──
  const files = inFolder(open);
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <button type="button" onClick={() => setOpen(null)} className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700">
          ← All folders
        </button>
        <h3 className="text-sm font-semibold text-gray-900">{open}</h3>
        {canManage ? (
          <>
            <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
              className="px-3 py-1.5 text-sm font-semibold bg-[#AEDE4A] hover:bg-[#9BCF3A] text-gray-900 rounded-md disabled:opacity-50">
              {uploading ? 'Uploading…' : 'Upload'}
            </button>
            <input ref={fileRef} type="file" multiple className="hidden"
              accept="image/*,application/pdf" onChange={(e) => upload(e.target.files)} />
          </>
        ) : <span />}
      </div>

      {files.length === 0 ? (
        <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-sm text-gray-400">
          This folder is empty.{canManage ? ' Upload a file to get started.' : ''}
        </div>
      ) : (
        <div className="bg-white rounded-lg border border-gray-200 divide-y divide-gray-50">
          {files.map((doc) => (
            <div key={doc.id} className="flex items-center gap-3 p-3">
              <div className="w-9 h-9 rounded bg-gray-100 flex items-center justify-center flex-shrink-0 text-gray-500">
                {isImage(doc.mime_type) ? (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" /></svg>
                ) : (
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2 2H6a2 2 0 01-2-2V4z" clipRule="evenodd" /></svg>
                )}
              </div>
              <a href={`/api/documents/${encodeURIComponent(doc.r2_key)}`} target="_blank" rel="noopener"
                className="flex-1 min-w-0 hover:text-[#83B81A]">
                <div className="text-sm font-medium text-gray-900 truncate">{doc.filename}</div>
                <div className="text-xs text-gray-400">{fileSize(doc.size_bytes)}{doc.uploaded_by_name ? ` · ${doc.uploaded_by_name}` : ''}</div>
              </a>
              {canManage && (
                <>
                  <button type="button" onClick={() => toggleVisible(doc)}
                    title={doc.client_visible ? 'Visible to client — click to hide' : 'Hidden from client — click to show'}
                    className={`text-xs px-2 py-1 rounded-full flex-shrink-0 ${doc.client_visible ? 'bg-[#AEDE4A]/20 text-[#5f8410]' : 'bg-gray-100 text-gray-400'}`}>
                    {doc.client_visible ? 'Client can see' : 'Internal'}
                  </button>
                  <button type="button" onClick={() => remove(doc)} disabled={busy === doc.id}
                    className="text-gray-300 hover:text-red-500 flex-shrink-0" title="Delete">
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
                  </button>
                </>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
