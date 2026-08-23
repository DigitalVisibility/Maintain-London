import type { APIRoute } from 'astro';
import { queryOne, execute, now } from '../../../lib/db';
import { canAccessProject } from '../../../lib/access';
import { hasCap } from '../../../lib/capabilities';
import { validateDraftPayload } from '../../../lib/diary-ai';
import type { DiaryDraft, DiaryDraftPayload, DiaryDraftStatus } from '../../../types/diary';

export const prerender = false;

/**
 * Load a draft and authorise it from its **own** project_id.
 *
 * Never from a query parameter or a body field: authorising the caller's claim
 * about a row, rather than the row itself, is how one business ends up reading
 * another's. A row the caller may not reach answers 404, the same as one that
 * never existed, so probing ids reveals nothing.
 */
async function loadDraft(
  env: App.Locals['runtime']['env'],
  locals: App.Locals,
  id: string | undefined
): Promise<{ ok: true; draft: DiaryDraft } | { ok: false; response: Response }> {
  if (!locals.user) {
    return { ok: false, response: new Response('Unauthorized', { status: 401 }) };
  }
  // A client never reads or settles a staff draft — it is internal working
  // material, not released content.
  if (locals.role === 'client' || !hasCap(locals, 'edit_diary')) {
    return { ok: false, response: Response.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  if (!id) {
    return { ok: false, response: Response.json({ error: 'Not found' }, { status: 404 }) };
  }

  const draft = await queryOne<DiaryDraft>(env.DB, 'SELECT * FROM diary_drafts WHERE id = ?', [id]);
  if (!draft || !(await canAccessProject(env.DB, locals, draft.project_id))) {
    return { ok: false, response: Response.json({ error: 'Not found' }, { status: 404 }) };
  }
  return { ok: true, draft };
}

/**
 * Parse the stored payload for the client.
 *
 * A payload that no longer parses is reported as null rather than throwing:
 * the row still tells the operative that a draft was made, and "this one can't
 * be read, write it by hand" is a better answer than a 500.
 */
function parsePayload(draft: DiaryDraft): DiaryDraftPayload | null {
  if (!draft.payload) return null;
  try {
    return validateDraftPayload(JSON.parse(draft.payload));
  } catch {
    return null;
  }
}

/** GET /api/drafts/:id — one draft with its parsed payload. */
export const GET: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  const loaded = await loadDraft(env, locals, params.id);
  if (!loaded.ok) return loaded.response;

  return Response.json({ draft: loaded.draft, payload: parsePayload(loaded.draft) });
};

/**
 * PATCH /api/drafts/:id — body { status: 'applied' | 'discarded' }
 *
 * This records the *outcome* of a draft and nothing else. It deliberately does
 * not write to entry_activities, entry_personnel or any other diary table.
 *
 * The diary has exactly one write path — the entry save in
 * /api/entries — and that is where authorisation, the operative's own
 * client-visibility clamp, and the stable child ids from
 * src/lib/diary-children.ts are all enforced. Photos link to a variation or a
 * delivery by id, and an approval request points back at the variation that
 * raised it; a second writer that minted its own ids would quietly orphan both.
 * So the UI applies a draft by loading it into the diary form and saving as
 * normal, then calls this to say what happened. The gap is the design.
 */
export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const { env } = locals.runtime;
  const loaded = await loadDraft(env, locals, params.id);
  if (!loaded.ok) return loaded.response;
  const { draft } = loaded;

  const body = await request.json().catch(() => null) as { status?: unknown } | null;
  const status = body?.status as DiaryDraftStatus | undefined;

  // 'pending' and 'failed' are states the server sets; a caller only ever
  // settles a draft one way or the other.
  if (status !== 'applied' && status !== 'discarded') {
    return Response.json({ error: "status must be 'applied' or 'discarded'" }, { status: 400 });
  }

  // Nothing was proposed, so nothing can have been applied. Discarding a failed
  // draft is fine — that is how it leaves the screen.
  if (status === 'applied' && !draft.payload) {
    return Response.json({ error: 'This draft has no payload to apply' }, { status: 400 });
  }

  const appliedAt = status === 'applied' ? now() : null;

  await execute(
    env.DB,
    'UPDATE diary_drafts SET status = ?, applied_at = ? WHERE id = ?',
    [status, appliedAt, draft.id]
  );

  const updated = await queryOne<DiaryDraft>(
    env.DB, 'SELECT * FROM diary_drafts WHERE id = ?', [draft.id]
  );
  return Response.json({ draft: updated });
};

/**
 * DELETE /api/drafts/:id — remove a draft entirely.
 *
 * Discarding keeps the record that a draft was made and rejected; deleting is
 * for tidying up. Both are offered because a rejected draft is useful evidence
 * while the day is live, and clutter a month later.
 */
export const DELETE: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  const loaded = await loadDraft(env, locals, params.id);
  if (!loaded.ok) return loaded.response;

  await execute(env.DB, 'DELETE FROM diary_drafts WHERE id = ?', [loaded.draft.id]);
  return Response.json({ deleted: loaded.draft.id });
};
