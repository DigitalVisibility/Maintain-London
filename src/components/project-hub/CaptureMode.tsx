import { useCallback, useEffect, useRef, useState } from 'react';
import VoiceRecorder from './VoiceRecorder';
import type { EntryFile, Project, VoiceNote } from '../../types/diary';

interface Props {
  projectId: string;
  project: Project;
  /** The diary entry every shot is attached to — resolved server-side. */
  entryId: string;
  initialFiles?: EntryFile[];
  userName?: string;
}

/**
 * One photo taken (or already on the entry) in this session. Uploads run in the
 * background, so a shot exists on screen long before it exists in the database:
 * `fileId` is what tells the two apart.
 */
interface Shot {
  localId: string;
  /** Object URL for a freshly captured frame, or the served URL for an existing file. */
  previewUrl: string;
  status: 'uploading' | 'uploaded' | 'failed';
  /** Kept so a failed upload can be retried without asking for the shot again. */
  file?: File;
  fileId?: string;
  caption?: string;
  captionPending?: boolean;
  error?: string;
  takenAt: string;
}

type CameraState = 'starting' | 'live' | 'unavailable';

/** Geolocation is best-effort: a photo with no coordinates beats a photo not taken. */
const GEO_OPTIONS: PositionOptions = {
  enableHighAccuracy: true,
  timeout: 8000,
  maximumAge: 60000,
};

/**
 * Local key for a shot. Not crypto.randomUUID: that is exposed only in secure
 * contexts, and the insecure-context phone is exactly the one falling back to
 * the native camera input.
 */
function newLocalId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function stopStream(stream: MediaStream | null | undefined) {
  // Leaving a camera running on someone's phone is never acceptable — every
  // exit path (unmount, navigation, failure) comes through here.
  stream?.getTracks().forEach((track) => track.stop());
}

export default function CaptureMode({ projectId, project, entryId, initialFiles = [], userName }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const fallbackInputRef = useRef<HTMLInputElement>(null);
  /**
   * Last known fix, cached at mount and read synchronously at shutter time so
   * the button never waits on the GPS.
   */
  const positionRef = useRef<{ lat: number; lng: number } | null>(null);
  /** Object URLs we created, revoked together on unmount. */
  const objectUrlsRef = useRef<string[]>([]);

  const [cameraState, setCameraState] = useState<CameraState>('starting');
  const [cameraError, setCameraError] = useState<string>('');
  const [shots, setShots] = useState<Shot[]>(() =>
    initialFiles
      .filter((f) => f.mime_type?.startsWith('image/'))
      .map((f) => ({
        localId: f.id,
        previewUrl: `/api/photos/${encodeURIComponent(f.r2_key)}`,
        status: 'uploaded' as const,
        fileId: f.id,
        caption: f.caption || f.ai_caption,
        takenAt: f.taken_at || f.created_at,
      }))
  );
  const [voiceNotes, setVoiceNotes] = useState<VoiceNote[]>([]);
  const [openShot, setOpenShot] = useState<string | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [message, setMessage] = useState<string>('');

  /* ---------------------------------------------------------------- camera */

  useEffect(() => {
    let cancelled = false;

    async function start() {
      // getUserMedia is absent on insecure origins and on locked-down site
      // phones. That is the common path here, not an edge case — fall through
      // to the native camera input rather than showing a black rectangle.
      if (!navigator.mediaDevices?.getUserMedia) {
        setCameraState('unavailable');
        setCameraError('This device will not stream the camera to the browser. Use the camera button below.');
        return;
      }

      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });

        if (cancelled) {
          stopStream(stream);
          return;
        }

        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          // Some browsers reject the autoplay promise even when playback then
          // starts; the element also carries autoPlay/muted/playsInline.
          videoRef.current.play().catch(() => {});
        }
        setCameraState('live');
      } catch (err: any) {
        stopStream(streamRef.current);
        streamRef.current = null;
        setCameraState('unavailable');
        setCameraError(
          err?.name === 'NotAllowedError'
            ? 'Camera access was blocked. Use the camera button below, or allow the camera in your browser settings.'
            : 'No live camera available on this device. Use the camera button below.'
        );
      }
    }

    start();

    // pagehide also covers iOS back-forward cache, where unmount never runs.
    const release = () => {
      stopStream(streamRef.current);
      streamRef.current = null;
    };
    window.addEventListener('pagehide', release);

    return () => {
      cancelled = true;
      window.removeEventListener('pagehide', release);
      release();
    };
  }, []);

  useEffect(() => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        positionRef.current = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      },
      () => {
        // Denied or timed out — shots simply go up without coordinates.
      },
      GEO_OPTIONS
    );
  }, []);

  useEffect(() => {
    const urls = objectUrlsRef;
    return () => {
      urls.current.forEach((url) => URL.revokeObjectURL(url));
      urls.current = [];
    };
  }, []);

  /* ---------------------------------------------------------------- upload */

  const requestCaption = useCallback(async (localId: string, fileId: string) => {
    try {
      const res = await fetch('/api/photos/caption', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ file_ids: [fileId] }),
      });
      if (!res.ok) throw new Error('caption failed');
      const data = await res.json();
      const result = (data.results || []).find((r: any) => r.id === fileId);
      setShots((prev) =>
        prev.map((s) =>
          s.localId === localId
            ? { ...s, captionPending: false, caption: result?.ai_caption || s.caption }
            : s
        )
      );
    } catch {
      // A missing caption is cosmetic — the photo is safely stored either way.
      setShots((prev) => prev.map((s) => (s.localId === localId ? { ...s, captionPending: false } : s)));
    }
  }, []);

  const uploadShot = useCallback(
    async (localId: string, file: File, takenAt: string) => {
      setShots((prev) =>
        prev.map((s) => (s.localId === localId ? { ...s, status: 'uploading', error: undefined } : s))
      );

      try {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('entry_id', entryId);
        formData.append('file_type', 'photo');
        formData.append('taken_at', takenAt);
        const pos = positionRef.current;
        if (pos) {
          formData.append('lat', String(pos.lat));
          formData.append('lng', String(pos.lng));
        }

        const res = await fetch('/api/photos/upload', { method: 'POST', body: formData });
        if (!res.ok) {
          const err = await res.json().catch(() => ({}));
          throw new Error(err.error || 'Upload failed');
        }
        const data = await res.json();

        setShots((prev) =>
          prev.map((s) =>
            s.localId === localId
              ? {
                  ...s,
                  status: 'uploaded',
                  fileId: data.id,
                  caption: data.caption || s.caption,
                  captionPending: true,
                  file: undefined,
                  error: undefined,
                }
              : s
          )
        );

        // Captioning is slow and never blocks the shutter or the strip.
        void requestCaption(localId, data.id);
      } catch (err: any) {
        setShots((prev) =>
          prev.map((s) =>
            s.localId === localId ? { ...s, status: 'failed', error: err?.message || 'Upload failed' } : s
          )
        );
      }
    },
    [entryId, requestCaption]
  );

  const queueShot = useCallback(
    (file: File) => {
      const localId = newLocalId();
      const previewUrl = URL.createObjectURL(file);
      objectUrlsRef.current.push(previewUrl);
      // The clock at the moment the shutter fired, not when the upload lands.
      const takenAt = new Date().toISOString();

      setShots((prev) => [...prev, { localId, previewUrl, status: 'uploading', file, takenAt }]);

      // Deliberately not awaited: burst shooting must not queue behind the network.
      void uploadShot(localId, file, takenAt);
    },
    [uploadShot]
  );

  /* --------------------------------------------------------------- shutter */

  const handleShutter = useCallback(() => {
    if (cameraState !== 'live') {
      fallbackInputRef.current?.click();
      return;
    }

    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return;

    navigator.vibrate?.(15);

    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(video, 0, 0, width, height);

    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setMessage('That frame could not be saved. Try again.');
          return;
        }
        queueShot(new File([blob], `site-${Date.now()}.jpg`, { type: 'image/jpeg' }));
      },
      'image/jpeg',
      0.92
    );
  }, [cameraState, queueShot]);

  function handleFallbackFiles(list: FileList | null) {
    if (!list) return;
    Array.from(list).forEach((file) => queueShot(file));
    // Reset so the same photo can be picked twice in a row.
    if (fallbackInputRef.current) fallbackInputRef.current.value = '';
  }

  function retry(shot: Shot) {
    if (!shot.file) return;
    void uploadShot(shot.localId, shot.file, shot.takenAt);
  }

  /* ----------------------------------------------------------------- draft */

  async function writeUpTheDay() {
    setDrafting(true);
    setMessage('');
    try {
      const res = await fetch('/api/drafts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          project_id: projectId,
          entry_id: entryId,
          file_ids: shots.filter((s) => s.fileId).map((s) => s.fileId),
          voice_note_ids: voiceNotes.map((n) => n.id),
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Could not write up the day');
      }
      const data = await res.json();
      window.location.href = `/project-hub/project/${projectId}/diary/${entryId}?draft=${encodeURIComponent(data.draft.id)}`;
    } catch (err: any) {
      // Stay put: the photos are already saved and losing this screen would
      // mean losing the session's context.
      setMessage(err?.message || 'Could not write up the day. Your photos are saved.');
      setDrafting(false);
    }
  }

  /* ------------------------------------------------------------------- ui */

  const pending = shots.filter((s) => s.status === 'uploading').length;
  const uploaded = shots.filter((s) => s.status === 'uploaded').length;
  const failed = shots.filter((s) => s.status === 'failed').length;
  const selected = shots.find((s) => s.localId === openShot) || null;
  const canDraft = shots.some((s) => s.fileId) || voiceNotes.length > 0;

  return (
    <div className="fixed inset-0 flex flex-col bg-black text-white">
      {/* Header — near-black behind white text, so it survives direct sunlight. */}
      <header className="flex items-center gap-3 px-3 py-2 bg-black">
        <a
          href={`/project-hub/project/${projectId}/`}
          className="flex items-center justify-center w-11 h-11 rounded-full bg-white/10 text-white flex-shrink-0"
          aria-label="Leave capture mode"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </a>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold truncate">{project.name}</div>
          <div className="text-xs text-white/70 truncate">
            {userName ? `${userName} · ` : ''}
            {new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}
          </div>
        </div>
        <div className="text-right text-xs leading-tight flex-shrink-0">
          <div className="font-semibold text-[#AEDE4A]">{uploaded} saved</div>
          {pending > 0 && <div className="text-white/70">{pending} sending</div>}
          {failed > 0 && <div className="text-red-400">{failed} failed</div>}
        </div>
      </header>

      {/* Viewfinder */}
      <div className="relative flex-1 min-h-0 bg-black overflow-hidden">
        {/* playsInline and muted are mandatory: without them iOS Safari refuses
            to play the stream inline and shows a black rectangle. */}
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={`absolute inset-0 w-full h-full object-cover ${cameraState === 'live' ? '' : 'hidden'}`}
        />
        <canvas ref={canvasRef} className="hidden" />

        {cameraState === 'starting' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 text-white/80">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-10 w-10 animate-pulse" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
            <span className="text-sm">Starting the camera…</span>
          </div>
        )}

        {cameraState === 'unavailable' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 px-6 text-center">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-12 w-12 text-white/60" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
            </svg>
            <p className="text-sm text-white/80 max-w-xs">{cameraError}</p>
            <button
              type="button"
              onClick={() => fallbackInputRef.current?.click()}
              className="inline-flex items-center gap-2 px-6 min-h-[60px] rounded-full bg-[#AEDE4A] active:bg-[#9BCF3A] text-gray-900 font-semibold text-base"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4 5a2 2 0 00-2 2v8a2 2 0 002 2h12a2 2 0 002-2V7a2 2 0 00-2-2h-1.586a1 1 0 01-.707-.293l-1.121-1.121A2 2 0 0011.172 3H8.828a2 2 0 00-1.414.586L6.293 4.707A1 1 0 015.586 5H4zm6 9a3 3 0 100-6 3 3 0 000 6z" clipRule="evenodd" />
              </svg>
              Open camera
            </button>
          </div>
        )}

        {/* Session strip, laid over the viewfinder so it costs no vertical space. */}
        {shots.length > 0 && (
          <div className="absolute left-0 right-0 bottom-0 px-2 py-2 bg-gradient-to-t from-black/90 to-transparent">
            <div className="flex gap-2 overflow-x-auto pb-1">
              {shots
                .slice()
                .reverse()
                .map((shot) => (
                  <button
                    key={shot.localId}
                    type="button"
                    onClick={() => setOpenShot(shot.localId)}
                    className="relative flex-shrink-0 w-16 h-16 rounded-lg overflow-hidden bg-neutral-900 border border-white/20"
                  >
                    <img src={shot.previewUrl} alt="" className="w-full h-full object-cover" />
                    {shot.status === 'uploading' && (
                      <span className="absolute inset-0 bg-black/50 flex items-center justify-center">
                        <span className="w-4 h-4 rounded-full border-2 border-white/40 border-t-[#AEDE4A] animate-spin" />
                      </span>
                    )}
                    {shot.status === 'failed' && (
                      <span className="absolute inset-0 bg-red-900/70 flex items-center justify-center text-[10px] font-semibold">
                        Retry
                      </span>
                    )}
                    {shot.status === 'uploaded' && (
                      <span className="absolute bottom-0.5 right-0.5 w-4 h-4 rounded-full bg-[#AEDE4A] flex items-center justify-center">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-3 w-3 text-gray-900" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                        </svg>
                      </span>
                    )}
                  </button>
                ))}
            </div>
          </div>
        )}
      </div>

      {/* Errors — from an upload, a voice note, or the write-up. */}
      {message && (
        <div className="px-3 py-2 bg-red-950 text-red-100 text-sm flex items-start gap-2">
          <span className="flex-1">{message}</span>
          <button type="button" onClick={() => setMessage('')} className="text-red-200 font-semibold px-2 py-1">
            Dismiss
          </button>
        </div>
      )}

      {/* Controls — all within one thumb's reach, and no hover-only affordances
          because a phone has no hover state. */}
      <div className="bg-black px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-3">
        <div className="flex items-center justify-between gap-3">
          {/* Hold-to-talk beside the shutter: a note about the day as a whole. */}
          <div className="w-24 flex justify-start">
            <VoiceRecorder
              entryId={entryId}
              projectId={projectId}
              compact
              onNote={(note) => setVoiceNotes((prev) => [...prev, note])}
              onError={(msg) => setMessage(msg)}
            />
          </div>

          <button
            type="button"
            onClick={handleShutter}
            aria-label="Take photo"
            className="w-[84px] h-[84px] rounded-full bg-white active:bg-white/70 ring-4 ring-[#AEDE4A] flex items-center justify-center flex-shrink-0"
          >
            <span className="w-[68px] h-[68px] rounded-full bg-[#AEDE4A]" />
          </button>

          <div className="w-24 flex justify-end">
            {failed > 0 ? (
              <button
                type="button"
                onClick={() => shots.filter((s) => s.status === 'failed').forEach(retry)}
                className="px-3 min-h-[56px] rounded-xl bg-red-600 active:bg-red-700 text-white text-xs font-semibold"
              >
                Retry {failed}
              </button>
            ) : (
              <button
                type="button"
                onClick={() => fallbackInputRef.current?.click()}
                aria-label="Choose photos already on this phone"
                className="w-14 h-14 rounded-xl bg-white/10 active:bg-white/20 flex items-center justify-center"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>
        </div>

        <button
          type="button"
          onClick={writeUpTheDay}
          disabled={drafting || !canDraft}
          className="w-full min-h-[60px] rounded-xl bg-[#AEDE4A] active:bg-[#9BCF3A] disabled:bg-white/15 disabled:text-white/50 text-gray-900 font-bold text-base flex items-center justify-center gap-2"
        >
          {drafting ? (
            <>
              <span className="w-5 h-5 rounded-full border-2 border-gray-900/30 border-t-gray-900 animate-spin" />
              Writing up the day…
            </>
          ) : (
            <>
              <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                <path d="M17.414 2.586a2 2 0 00-2.828 0L7 10.172V13h2.828l7.586-7.586a2 2 0 000-2.828z" />
                <path fillRule="evenodd" d="M2 6a2 2 0 012-2h4a1 1 0 010 2H4v10h10v-4a1 1 0 112 0v4a2 2 0 01-2 2H4a2 2 0 01-2-2V6z" clipRule="evenodd" />
              </svg>
              Write up the day
            </>
          )}
        </button>
        {drafting && (
          <p className="text-center text-xs text-white/70">This takes a few seconds. Keep the screen open.</p>
        )}
      </div>

      {/* Fallback capture: the common path on locked-down site phones. */}
      <input
        ref={fallbackInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        multiple
        onChange={(e) => handleFallbackFiles(e.target.files)}
        className="hidden"
      />

      {/* Per-shot sheet: its caption, a voice note about this one shot, retry. */}
      {selected && (
        <div className="fixed inset-0 z-50 bg-black/95 flex flex-col">
          <div className="flex items-center justify-between px-3 py-2">
            <span className="text-sm text-white/70">
              {new Date(selected.takenAt).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}
            </span>
            <button
              type="button"
              onClick={() => setOpenShot(null)}
              className="w-11 h-11 rounded-full bg-white/10 flex items-center justify-center"
              aria-label="Close photo"
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>

          <div className="flex-1 min-h-0 flex items-center justify-center px-3">
            <img src={selected.previewUrl} alt="" className="max-w-full max-h-full object-contain rounded-lg" />
          </div>

          <div className="px-3 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] space-y-3">
            <p className="text-sm text-white/90 min-h-[1.25rem]">
              {selected.captionPending ? 'Describing this photo…' : selected.caption || 'No description yet.'}
            </p>

            {selected.status === 'failed' && (
              <div className="flex items-center gap-3">
                <span className="flex-1 text-sm text-red-300">{selected.error || 'Upload failed'}</span>
                <button
                  type="button"
                  onClick={() => retry(selected)}
                  className="px-4 min-h-[56px] rounded-xl bg-red-600 active:bg-red-700 text-white font-semibold"
                >
                  Retry upload
                </button>
              </div>
            )}

            {selected.fileId ? (
              <VoiceRecorder
                entryId={entryId}
                projectId={projectId}
                fileId={selected.fileId}
                compact
                onNote={(note) => setVoiceNotes((prev) => [...prev, note])}
                onError={(msg) => setMessage(msg)}
              />
            ) : (
              <p className="text-xs text-white/70">
                A voice note can be attached once this photo has finished sending.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
