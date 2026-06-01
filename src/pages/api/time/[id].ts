import type { APIRoute } from 'astro';
import { queryOne, execute, now } from '../../../lib/db';

export const prerender = false;

interface Session {
  id: string; org_id: string; user_id: string; status: string;
  break_minutes: number; break_started_at: string | null;
}

/** Parse our 'YYYY-MM-DD HH:MM:SS.sss' timestamps (stored as UTC, no Z). */
function parseTs(ts: string): number {
  return new Date(ts.replace(' ', 'T') + 'Z').getTime();
}

/**
 * PATCH /api/time/:id  { action: 'break_start'|'break_resume'|'clock_out', lat?, lng? }
 * Manage a live session: pause/resume breaks and clock out.
 */
export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const { env } = locals.runtime;
  const user = locals.user;
  if (!user) return new Response('Unauthorized', { status: 401 });

  const session = await queryOne<Session>(env.DB, 'SELECT * FROM time_sessions WHERE id = ?', [params.id]);
  if (!session || session.user_id !== user.id) return Response.json({ error: 'Not found' }, { status: 404 });
  if (session.status === 'completed') return Response.json({ error: 'Already clocked out' }, { status: 409 });

  const body = await request.json().catch(() => ({})) as { action?: string; lat?: number; lng?: number };
  const ts = now();

  // Helper: accumulate any in-progress break into break_minutes.
  let breakMinutes = session.break_minutes ?? 0;
  if (session.status === 'on_break' && session.break_started_at) {
    breakMinutes += Math.max(0, (Date.now() - parseTs(session.break_started_at)) / 60000);
  }

  if (body.action === 'break_start') {
    if (session.status !== 'active') return Response.json({ error: 'Not active' }, { status: 409 });
    await execute(env.DB, `UPDATE time_sessions SET status = 'on_break', break_started_at = ? WHERE id = ?`, [ts, params.id]);
    return Response.json({ status: 'on_break' });
  }

  if (body.action === 'break_resume') {
    await execute(
      env.DB,
      `UPDATE time_sessions SET status = 'active', break_minutes = ?, break_started_at = NULL WHERE id = ?`,
      [breakMinutes, params.id]
    );
    return Response.json({ status: 'active', break_minutes: breakMinutes });
  }

  if (body.action === 'clock_out') {
    // Fixed-break orgs auto-deduct a set break regardless of live pauses.
    const org = await queryOne<{ break_mode: string; fixed_break_minutes: number }>(
      env.DB, 'SELECT break_mode, fixed_break_minutes FROM organisations WHERE id = ?', [session.org_id]
    );
    const finalBreak = org?.break_mode === 'fixed' ? (org.fixed_break_minutes ?? 0) : breakMinutes;

    await execute(
      env.DB,
      `UPDATE time_sessions SET status = 'completed', clock_out = ?, clock_out_lat = ?, clock_out_lng = ?,
        break_minutes = ?, break_started_at = NULL WHERE id = ?`,
      [ts, body.lat ?? null, body.lng ?? null, finalBreak, params.id]
    );
    return Response.json({ status: 'completed', break_minutes: finalBreak });
  }

  return Response.json({ error: 'Unknown action' }, { status: 400 });
};
