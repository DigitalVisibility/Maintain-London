/**
 * Authorisation and transcription for voice notes.
 *
 * This lives in lib/ rather than beside the routes because both /api/voice and
 * /api/voice/[id] need it, and a route importing values from a sibling route is
 * a coupling that only holds by accident of bundling. The security-critical
 * branch exists once, here, so there is one place to audit it.
 */

import { queryOne, execute, now } from './db';
import { canAccessEntry, canAccessProject } from './access';
import { hasCap } from './capabilities';
import { transcribeAudio } from './transcribe';
import type { VoiceNote } from '../types/diary';

/** The three things a note can hang off. Exactly one of them is ever set. */
export interface VoiceScope {
  entry_id?: string | null;
  quote_id?: string | null;
  project_id?: string | null;
}

/** A scope that passed authorisation, resolved to the project it sits under. */
export interface AuthorisedScope {
  scope: 'entry' | 'quote' | 'project';
  scopeId: string;
  projectId: string | null;
  orgId: string | null;
}

/**
 * Authorise a voice note's own scope.
 *
 * Recording is authorship: the note is the operative's account of the day, or
 * the estimator's walk-round of a job not yet won. A client is never the author
 * of either, so they are turned away before the capability check even runs —
 * and the capability required is the one for the thing being recorded against,
 * not a blanket "may use voice".
 *
 * Callers must pass the scope taken from the *stored row* when one exists,
 * never from a query parameter: authorising the caller's claim about a note
 * rather than the note itself is how one business once read another's data.
 */
export async function authoriseVoiceScope(
  db: D1Database,
  locals: App.Locals,
  scope: VoiceScope
): Promise<{ ok: true; resolved: AuthorisedScope } | { ok: false; response: Response }> {
  const forbidden = { ok: false as const, response: Response.json({ error: 'Forbidden' }, { status: 403 }) };

  // Clients don't author site records. Checked up front so no later branch can
  // accidentally let one through on a capability an org has widened.
  if (locals.role === 'client') return forbidden;

  const entryId = scope.entry_id || null;
  const quoteId = scope.quote_id || null;
  const projectId = scope.project_id || null;

  if (entryId) {
    if (!hasCap(locals, 'edit_diary')) return forbidden;
    const entryProject = await canAccessEntry(db, locals, entryId);
    if (!entryProject) return forbidden;
    return {
      ok: true,
      resolved: { scope: 'entry', scopeId: entryId, projectId: entryProject, orgId: locals.org?.id ?? null },
    };
  }

  if (quoteId) {
    if (!hasCap(locals, 'manage_quotes') || !locals.org) return forbidden;
    // Quotes predate a project — there is nothing to check them against but the
    // org that raised them.
    const quote = await queryOne<{ org_id: string }>(
      db, 'SELECT org_id FROM quotes WHERE id = ?', [quoteId]
    );
    if (!quote || quote.org_id !== locals.org.id) return forbidden;
    return {
      ok: true,
      resolved: { scope: 'quote', scopeId: quoteId, projectId: null, orgId: quote.org_id },
    };
  }

  if (projectId) {
    if (!hasCap(locals, 'edit_diary')) return forbidden;
    if (!(await canAccessProject(db, locals, projectId))) return forbidden;
    return {
      ok: true,
      resolved: { scope: 'project', scopeId: projectId, projectId, orgId: locals.org?.id ?? null },
    };
  }

  return { ok: false, response: Response.json({ error: 'One of entry_id, quote_id or project_id is required' }, { status: 400 }) };
}

/**
 * Transcribe an already-stored recording and settle the row either way.
 *
 * A model failure must not cost us the audio: the note stays, marked failed
 * with the reason on it, so the operative sees "needs typing by hand" and can
 * replay or retry rather than discovering the day's account simply gone.
 */
export async function transcribeNote(
  env: App.Locals['runtime']['env'],
  noteId: string,
  audio: ArrayBuffer
): Promise<void> {
  try {
    const { text, language } = await transcribeAudio(env.AI, audio);
    await execute(
      env.DB,
      `UPDATE voice_notes
          SET transcript = ?, language = ?, status = 'transcribed', error = NULL, transcribed_at = ?
        WHERE id = ?`,
      [text, language ?? null, now(), noteId]
    );
  } catch (err) {
    await execute(
      env.DB,
      `UPDATE voice_notes SET status = 'failed', error = ?, transcribed_at = NULL WHERE id = ?`,
      [err instanceof Error ? err.message : 'Transcription failed', noteId]
    );
  }
}

/** Read a note back after transcription so the caller gets the settled row. */
export function loadNote(db: D1Database, id: string): Promise<VoiceNote | null> {
  return queryOne<VoiceNote>(db, 'SELECT * FROM voice_notes WHERE id = ?', [id]);
}
