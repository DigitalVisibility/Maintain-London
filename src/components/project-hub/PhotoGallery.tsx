import { useState, useRef } from 'react';
import type { EntryFile, FileType } from '../../types/diary';

interface Props {
  entryId: string;
  files: EntryFile[];
  fileType?: FileType;
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

export default function PhotoGallery({ entryId, files, fileType = 'photo', onFilesChange }: Props) {
  const [uploading, setUploading] = useState<UploadingFile[]>([]);
  const [lightbox, setLightbox] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  async function handleFiles(selectedFiles: FileList | null) {
    if (!selectedFiles || selectedFiles.length === 0) return;

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
          linked_to: null,
          created_at: new Date().toISOString(),
        };

        onFilesChange([...files, newFile]);

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

  const imageFiles = files.filter((f) => f.mime_type.startsWith('image/'));
  const docFiles = files.filter((f) => !f.mime_type.startsWith('image/'));

  return (
    <div className="space-y-4">
      {/* Upload buttons */}
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => cameraInputRef.current?.click()}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-[#AEDE4A] hover:bg-[#9BCF3A] text-gray-900 font-semibold rounded-md text-sm transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
          </svg>
          Take Photo
        </button>
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-md text-sm transition-colors"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
          </svg>
          Upload Files
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          {imageFiles.map((file) => (
            <div key={file.id} className="group relative aspect-square rounded-lg overflow-hidden bg-gray-100">
              <img
                src={`/api/photos/${encodeURIComponent(file.r2_key)}`}
                alt={file.caption || file.filename}
                className="w-full h-full object-cover cursor-pointer"
                onClick={() => setLightbox(file.r2_key)}
                loading="lazy"
              />
              {/* Overlay on hover */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-end opacity-0 group-hover:opacity-100">
                <div className="w-full p-2 flex items-center justify-between">
                  <span className="text-xs text-white truncate">{file.caption || file.filename}</span>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(file);
                    }}
                    className="p-1 bg-red-500/80 hover:bg-red-600 text-white rounded transition-colors flex-shrink-0"
                    title="Delete"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </button>
                </div>
              </div>
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
      {files.length === 0 && uploading.length === 0 && (
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
