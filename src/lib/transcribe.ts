/**
 * Whisper transcription, run on the Cloudflare Workers AI binding.
 *
 * The point of voice capture is that a day on site can be recorded by talking.
 * Someone in gloves, in the rain, halfway up a scaffold will *say* a note they
 * would never stop and type — so the recording has to be the easy part and the
 * transcript has to arrive on its own.
 *
 * Transcription runs where the audio already is, on the edge, rather than
 * shipping the file to a third party: it keeps the round trip short enough to
 * do inline on upload, and keeps site recordings inside our own infrastructure.
 */

import type { WorkersAI } from '../types/diary';

/**
 * Whisper large v3 turbo — the fastest of the Whisper family on Workers AI.
 * Site audio is short (a minute or two of someone describing a room), so
 * turbo's accuracy trade-off costs us far less than the latency would.
 */
const MODEL = '@cf/openai/whisper-large-v3-turbo';

/**
 * What a phone or laptop actually hands us. MediaRecorder gives WebM/Opus on
 * Chrome and Android and MP4/AAC on iOS; the rest cover files picked from a
 * device rather than recorded in the page.
 */
export const ALLOWED_AUDIO_TYPES = new Set([
  'audio/webm',
  'audio/ogg',
  'audio/mp4',
  'audio/mpeg',
  'audio/wav',
  'audio/x-m4a',
]);

const MAX_SIZE = 25 * 1024 * 1024; // 25MB — roughly half an hour of Opus.

/**
 * Browsers report the recording codec as a parameter — 'audio/webm;codecs=opus'
 * — which is the same container by any other name. Compare on the base type so
 * a perfectly valid recording isn't rejected over its codec string.
 */
export function normaliseAudioType(mimeType: string): string {
  return (mimeType || '').split(';')[0].trim().toLowerCase();
}

export function validateAudio(
  mimeType: string,
  size: number
): { valid: true } | { valid: false; error: string } {
  const base = normaliseAudioType(mimeType);
  if (!ALLOWED_AUDIO_TYPES.has(base)) {
    return {
      valid: false,
      error: `Audio type "${mimeType}" is not allowed. Accepted: WebM, Ogg, MP4, MP3, WAV, M4A.`,
    };
  }
  if (size > MAX_SIZE) {
    return {
      valid: false,
      error: `Recording size (${(size / 1024 / 1024).toFixed(1)}MB) exceeds the 25MB limit.`,
    };
  }
  return { valid: true };
}

/** Build a voice-note key: voice/{scope}/{scopeId}/{timestamp}-{filename} */
export function buildVoiceKey(scope: string, scopeId: string, filename: string): string {
  const ts = Date.now();
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  return `voice/${scope}/${scopeId}/${ts}-${safe}`;
}

/**
 * What Whisper hands back. The binding is typed `unknown` on our side (see
 * WorkersAI in types/diary), so nothing here trusts the shape — we narrow
 * before reading, and treat a missing transcript as a failure rather than as
 * an empty note.
 */
interface WhisperResult {
  text?: unknown;
  language?: unknown;
  transcription_info?: { language?: unknown } | null;
}

/**
 * Transcribe one recording. Throws if the binding is missing or the model
 * returns nothing usable — the caller records the error on the voice note so
 * it surfaces as "needs typing by hand" rather than vanishing, with the audio
 * still in R2 to be replayed or retried.
 */
export async function transcribeAudio(
  ai: WorkersAI | undefined,
  audio: ArrayBuffer
): Promise<{ text: string; language?: string }> {
  if (!ai) throw new Error('Workers AI binding is not available');
  if (!audio.byteLength) throw new Error('Recording is empty');

  // This model takes the audio as a plain array of byte values, not a
  // Uint8Array and not base64 — passing the typed array straight through
  // serialises to an object and the model hears silence.
  const bytes = Array.from(new Uint8Array(audio));

  const raw = (await ai.run(MODEL, { audio: bytes })) as WhisperResult | null;

  const text = typeof raw?.text === 'string' ? raw.text.trim() : '';
  if (!text) throw new Error('Whisper returned no transcript');

  // Newer Whisper responses nest the detected language under transcription_info;
  // older ones put it at the top level. Take whichever is there.
  const detected = raw?.transcription_info?.language ?? raw?.language;
  const language = typeof detected === 'string' && detected ? detected : undefined;

  return { text, language };
}
