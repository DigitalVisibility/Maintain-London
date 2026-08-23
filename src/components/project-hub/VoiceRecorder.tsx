import { useState, useRef, useEffect } from 'react';
import type { VoiceNote } from '../../types/diary';
import { queueVoiceNote, requestVoiceSync } from '../../lib/offline';

interface Props {
  entryId?: string;
  quoteId?: string;
  projectId?: string;
  /** entry_files.id when the note is commentary on one specific photo. */
  fileId?: string;
  /** Notes already attached, so the component can render them without refetching. */
  notes?: VoiceNote[];
  /** Tighter layout, for embedding in a table row or under a photo. */
  compact?: boolean;
  /** Fired when a note finishes (online) or is queued (offline). */
  onNote?: (note: VoiceNote) => void;
  onError?: (message: string) => void;
}

/**
 * iOS Safari only ever reports `audio/mp4` as supported, so the type must be
 * probed rather than hardcoded — a webm-only recorder is silently broken on
 * every iPhone, which is most of the site workforce.
 */
const MIME_CANDIDATES = [
  'audio/webm;codecs=opus',
  'audio/webm',
  'audio/mp4',
  'audio/ogg;codecs=opus',
];

/** 25MB server limit; five minutes of Opus sits comfortably inside it. */
const MAX_SECONDS = 300;

/** Below this, the press reads as a tap, so we latch instead of stopping. */
const TAP_MS = 400;

/** Stable identity for the default: a fresh `[]` per render would make the
 *  prop-sync effect below re-run forever. */
const NO_NOTES: VoiceNote[] = [];

function pickMimeType(): string | null {
  if (typeof MediaRecorder === 'undefined') return null;
  for (const type of MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(type)) return type;
    } catch {
      // Some older browsers throw here rather than returning false.
    }
  }
  // An empty string lets MediaRecorder choose for itself, which is still better
  // than refusing to record on a browser we did not anticipate.
  return '';
}

function extensionFor(mime: string): string {
  if (mime.includes('mp4')) return 'm4a';
  if (mime.includes('ogg')) return 'ogg';
  if (mime.includes('wav')) return 'wav';
  return 'webm';
}

/** Never surface a raw DOMException — nobody on site can act on "NotAllowedError". */
function describeMicError(err: unknown): string {
  const name = (err as { name?: string })?.name || '';
  switch (name) {
    case 'NotAllowedError':
    case 'PermissionDeniedError':
    case 'SecurityError':
      return 'Microphone blocked. Allow microphone access in your browser settings.';
    case 'NotFoundError':
    case 'DevicesNotFoundError':
      return 'No microphone found on this device.';
    case 'NotReadableError':
    case 'TrackStartError':
      return 'Microphone is busy in another app. Close it and try again.';
    case 'OverconstrainedError':
      return 'This device’s microphone cannot be used for recording.';
    default:
      return 'Could not start recording on this device.';
  }
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function VoiceRecorder({
  entryId,
  quoteId,
  projectId,
  fileId,
  notes = NO_NOTES,
  compact = false,
  onNote,
  onError,
}: Props) {
  const [list, setList] = useState<VoiceNote[]>(notes);
  const [recording, setRecording] = useState(false);
  const [latched, setLatched] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startedAtRef = useRef(0);
  const timerRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  // 'holding' = finger still down; 'latched' = tapped once, runs until next tap.
  const modeRef = useRef<'idle' | 'holding' | 'latched'>('idle');
  const pressStartRef = useRef(0);
  const startedRef = useRef(false);
  const ignoreReleaseRef = useRef(false);
  const stopOnStartRef = useRef(false);
  const mountedRef = useRef(true);

  // The parent owns the canonical list; mirror it whenever it changes so an
  // upstream refetch is not clobbered by our local copy.
  useEffect(() => {
    setList(notes);
  }, [notes]);

  useEffect(() => {
    return () => {
      mountedRef.current = false;
      teardown();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function report(message: string) {
    setError(message);
    onError?.(message);
  }

  /** Release the mic and every timer. Safe to call more than once. */
  function teardown() {
    if (timerRef.current !== null) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    // A live mic indicator left burning on someone's phone is unacceptable, so
    // tracks are killed on stop, on unmount and on every error path.
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    recorderRef.current = null;
    startedRef.current = false;
  }

  function startMeter(stream: MediaStream) {
    try {
      const Ctx = window.AudioContext || (window as any).webkitAudioContext;
      if (!Ctx) return;
      const ctx: AudioContext = new Ctx();
      audioCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setLevel(Math.min(1, rms * 4));
        rafRef.current = requestAnimationFrame(tick);
      };
      rafRef.current = requestAnimationFrame(tick);
    } catch {
      // The meter is cosmetic — never let it break the recording itself.
    }
  }

  async function startRecording() {
    setError(null);
    setNotice(null);

    if (typeof window !== 'undefined' && !window.isSecureContext) {
      report('Recording needs a secure (https) connection.');
      modeRef.current = 'idle';
      return;
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      report('This browser cannot record audio. Try Chrome or Safari.');
      modeRef.current = 'idle';
      return;
    }

    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      report(describeMicError(err));
      modeRef.current = 'idle';
      teardown();
      return;
    }

    if (!mountedRef.current) {
      stream.getTracks().forEach((t) => t.stop());
      return;
    }

    streamRef.current = stream;
    const mimeType = pickMimeType();
    let recorder: MediaRecorder;
    try {
      recorder = mimeType ? new MediaRecorder(stream, { mimeType }) : new MediaRecorder(stream);
    } catch {
      try {
        recorder = new MediaRecorder(stream);
      } catch (err) {
        report(describeMicError(err));
        modeRef.current = 'idle';
        teardown();
        return;
      }
    }

    chunksRef.current = [];
    recorderRef.current = recorder;
    startedRef.current = true;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) chunksRef.current.push(e.data);
    };

    recorder.onerror = () => {
      report('Recording stopped unexpectedly. Please try again.');
      modeRef.current = 'idle';
      setRecording(false);
      setLatched(false);
      teardown();
    };

    recorder.onstop = () => {
      const type = recorder.mimeType || mimeType || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type });
      const seconds = Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000));
      chunksRef.current = [];
      teardown();
      setRecording(false);
      setLatched(false);
      setLevel(0);
      setElapsed(0);
      if (blob.size > 0) void submit(blob, type, seconds);
    };

    startedAtRef.current = Date.now();
    // A timeslice keeps chunks flowing, so a crash mid-note still leaves audio.
    recorder.start(1000);
    setRecording(true);
    setElapsed(0);
    startMeter(stream);

    timerRef.current = window.setInterval(() => {
      const secs = (Date.now() - startedAtRef.current) / 1000;
      setElapsed(secs);
      if (secs >= MAX_SECONDS) {
        setNotice('Stopped at the 5-minute limit. Record another note if you need more.');
        stopRecording();
      }
    }, 200);

    // The finger came up while the permission prompt was still open.
    if (stopOnStartRef.current) {
      stopOnStartRef.current = false;
      stopRecording();
    }
  }

  function stopRecording() {
    modeRef.current = 'idle';
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stop();
        return;
      } catch {
        // Fall through to the manual teardown below.
      }
    }
    teardown();
    setRecording(false);
    setLatched(false);
  }

  function handlePressStart() {
    if (uploading) return;
    if (modeRef.current === 'latched') {
      // Second tap of a latched note: stop, and swallow the pointerup that is
      // about to follow this pointerdown.
      ignoreReleaseRef.current = true;
      stopRecording();
      return;
    }
    if (modeRef.current !== 'idle') return;
    pressStartRef.current = Date.now();
    stopOnStartRef.current = false;
    modeRef.current = 'holding';
    void startRecording();
  }

  function handlePressEnd() {
    if (ignoreReleaseRef.current) {
      ignoreReleaseRef.current = false;
      return;
    }
    if (modeRef.current !== 'holding') return;

    const heldFor = Date.now() - pressStartRef.current;
    // If the mic has not opened yet, the "hold" was really spent waiting on the
    // permission prompt — latch rather than throwing the note away.
    if (heldFor < TAP_MS || !startedRef.current) {
      modeRef.current = 'latched';
      setLatched(true);
      return;
    }
    stopRecording();
  }

  async function submit(blob: Blob, mimeType: string, seconds: number) {
    const fileName = `voice-${Date.now()}.${extensionFor(mimeType)}`;
    const file = new File([blob], fileName, { type: mimeType });

    const formData = new FormData();
    formData.append('audio', file);
    if (entryId) formData.append('entry_id', entryId);
    if (quoteId) formData.append('quote_id', quoteId);
    if (projectId) formData.append('project_id', projectId);
    if (fileId) formData.append('file_id', fileId);
    formData.append('duration_s', String(seconds));

    // Queued audio lives in IndexedDB, so it survives a reload, a killed tab or
    // a flat battery — losing a spoken note is worse than losing a typed one.
    const queueLocally = async () => {
      const id = crypto.randomUUID();
      try {
        await queueVoiceNote(id, '/api/voice', formData);
        await requestVoiceSync();
      } catch {
        report('Could not save that note offline. Device storage may be full.');
        return;
      }
      const optimistic: VoiceNote = {
        id,
        entry_id: entryId,
        quote_id: quoteId,
        project_id: projectId,
        file_id: fileId,
        r2_key: '',
        mime_type: mimeType,
        size_bytes: blob.size,
        duration_s: seconds,
        status: 'pending',
        created_by: '',
        created_at: new Date().toISOString(),
      };
      setList((prev) => [...prev, optimistic]);
      setNotice('Saved offline. It will upload when you have signal.');
      onNote?.(optimistic);
    };

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      await queueLocally();
      return;
    }

    setUploading(true);
    try {
      const res = await fetch('/api/voice', { method: 'POST', body: formData });

      if (!res.ok) {
        let message = 'Upload failed';
        try {
          const err = await res.json();
          message = err.error || message;
        } catch {
          // Non-JSON error body — keep the generic message.
        }
        throw new Error(message);
      }

      const note = (await res.json()) as VoiceNote;
      setList((prev) => [...prev, note]);
      if (note.status === 'failed') {
        setNotice('Recorded, but we could not transcribe it. The audio is saved — tap retry.');
      }
      onNote?.(note);
    } catch (err: any) {
      // Signal dropping mid-upload is the normal case on site. A TypeError from
      // fetch means the request never completed, so queue instead of losing it.
      if (
        (typeof navigator !== 'undefined' && navigator.onLine === false) ||
        err instanceof TypeError
      ) {
        await queueLocally();
      } else {
        report(err?.message || 'Upload failed');
      }
    } finally {
      setUploading(false);
    }
  }

  async function handleRetry(note: VoiceNote) {
    setBusyId(note.id);
    setError(null);
    try {
      const res = await fetch(`/api/voice/${note.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'retry' }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Retry failed');
      }
      const updated = (await res.json()) as VoiceNote;
      setList((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
      onNote?.(updated);
    } catch (err: any) {
      report(err?.message || 'Could not retry that transcription');
    } finally {
      setBusyId(null);
    }
  }

  async function handleDelete(note: VoiceNote) {
    if (!confirm('Delete this voice note?')) return;
    setBusyId(note.id);
    try {
      const res = await fetch(`/api/voice/${note.id}`, { method: 'DELETE' });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Delete failed');
      }
      setList((prev) => prev.filter((n) => n.id !== note.id));
    } catch (err: any) {
      report(err?.message || 'Failed to delete voice note');
    } finally {
      setBusyId(null);
    }
  }

  const remaining = Math.max(0, MAX_SECONDS - elapsed);
  const nearLimit = recording && remaining <= 30;

  return (
    <div className={compact ? 'space-y-2' : 'space-y-4'}>
      {/* Record button — big enough to hit with gloves on */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={uploading}
          onPointerDown={handlePressStart}
          onPointerUp={handlePressEnd}
          onPointerLeave={handlePressEnd}
          onPointerCancel={handlePressEnd}
          onContextMenu={(e) => e.preventDefault()}
          className={`inline-flex items-center justify-center gap-2 font-semibold rounded-md transition-colors select-none touch-none disabled:opacity-60 ${
            recording
              ? 'bg-red-500 hover:bg-red-600 text-white'
              : 'bg-[#AEDE4A] hover:bg-[#9BCF3A] text-gray-900'
          } ${compact ? 'px-3 min-h-[40px] text-xs' : 'px-5 min-h-[56px] text-base w-full sm:w-auto'}`}
          style={{ WebkitUserSelect: 'none', WebkitTouchCallout: 'none' }}
        >
          {recording ? (
            <span
              className="rounded-full bg-white/90 flex-shrink-0"
              style={{
                width: compact ? 10 : 14,
                height: compact ? 10 : 14,
                // Pulses with mic input, so the user can see it is listening.
                transform: `scale(${1 + level * 0.9})`,
                transition: 'transform 80ms linear',
              }}
            />
          ) : (
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className={compact ? 'h-4 w-4' : 'h-5 w-5'}
              viewBox="0 0 20 20"
              fill="currentColor"
            >
              <path fillRule="evenodd" d="M7 4a3 3 0 016 0v5a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
            </svg>
          )}
          {uploading
            ? 'Uploading…'
            : recording
              ? `${formatTime(elapsed)} — ${latched ? 'Tap to stop' : 'Release to stop'}`
              : compact
                ? 'Record'
                : 'Hold to record'}
        </button>

        {!recording && !uploading && !compact && (
          <span className="text-xs text-gray-400">Hold to talk, or tap once to keep recording.</span>
        )}
      </div>

      {nearLimit && (
        <div className="text-xs text-amber-600">
          {formatTime(remaining)} left before the 5-minute limit.
        </div>
      )}

      {/* Inline messages */}
      {error && (
        <div className="flex items-start gap-2 p-3 rounded-md border border-red-200 bg-red-50">
          <div className="flex-1 text-xs text-red-600">{error}</div>
          <button type="button" onClick={() => setError(null)} className="text-gray-400 hover:text-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      {notice && (
        <div className="flex items-start gap-2 p-3 rounded-md border border-gray-200 bg-gray-50">
          <div className="flex-1 text-xs text-gray-600">{notice}</div>
          <button type="button" onClick={() => setNotice(null)} className="text-gray-400 hover:text-gray-600">
            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>
      )}

      {/* Existing notes */}
      {list.length > 0 && (
        <div className="space-y-2">
          {list.map((note) => (
            <div
              key={note.id}
              className={`rounded-md border ${
                note.status === 'failed' ? 'border-amber-200 bg-amber-50' : 'border-gray-200 bg-gray-50'
              } ${compact ? 'p-2' : 'p-3'}`}
            >
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded bg-gray-200 flex items-center justify-center flex-shrink-0">
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 text-gray-500" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M7 4a3 3 0 016 0v5a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
                  </svg>
                </div>

                <div className="flex-1 min-w-0">
                  {note.status === 'pending' ? (
                    <div className="text-sm text-gray-500 italic">
                      {/* No r2_key yet means it never reached the server. */}
                      {note.r2_key ? 'Transcribing…' : 'Saved offline — waiting for signal'}
                    </div>
                  ) : note.status === 'failed' ? (
                    <button
                      type="button"
                      onClick={() => handleRetry(note)}
                      disabled={busyId === note.id}
                      className="text-sm text-amber-700 hover:text-amber-800 text-left disabled:opacity-60"
                    >
                      {busyId === note.id ? 'Retrying…' : 'Couldn’t transcribe — tap to retry'}
                    </button>
                  ) : (
                    <div className="text-sm text-gray-900 whitespace-pre-wrap break-words">
                      {note.transcript || <span className="italic text-gray-400">No speech detected</span>}
                    </div>
                  )}

                  <div className="text-xs text-gray-400 mt-0.5">
                    {note.duration_s ? formatTime(note.duration_s) : ''}
                    {note.status === 'failed' && note.error ? ` · ${note.error}` : ''}
                  </div>

                  {note.status !== 'pending' && (
                    <audio
                      controls
                      preload="none"
                      src={`/api/voice/${note.id}/audio`}
                      className="mt-2 w-full max-w-sm h-8"
                    />
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleDelete(note)}
                  disabled={busyId === note.id}
                  className="p-1.5 text-gray-400 hover:text-red-500 transition-colors disabled:opacity-60"
                  title="Delete"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                  </svg>
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {list.length === 0 && !recording && !uploading && !compact && (
        <div className="text-center py-6 text-sm text-gray-400">
          <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 mx-auto mb-2 text-gray-300" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M7 4a3 3 0 016 0v5a3 3 0 11-6 0V4zm4 10.93A7.001 7.001 0 0017 8a1 1 0 10-2 0A5 5 0 015 8a1 1 0 00-2 0 7.001 7.001 0 006 6.93V17H6a1 1 0 100 2h8a1 1 0 100-2h-3v-2.07z" clipRule="evenodd" />
          </svg>
          No voice notes yet. Hold the button and talk.
        </div>
      )}
    </div>
  );
}
