import type { APIRoute } from 'astro';
import { queryAll, queryOne, execute, now } from '../../../lib/db';
import { expectedForProject, minutesOf } from '../../../lib/attendance';
import { sendToUser } from '../../../lib/push';

export const prerender = false;

/**
 * POST /api/cron/clock-reminders — nudge people who forgot to clock in or out.
 *
 * Called by the sidecar cron Worker (same Bearer CRON_SECRET as the summaries
 * sweep). Run it every ~15 minutes during working hours. Each nudge fires once:
 * a "clock out" reminder stamps the open session; a "clock in" reminder is
 * recorded per person per day. Fires GRACE minutes after the expected time.
 */
const GRACE = 30;

export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  const secret = env.CRON_SECRET;
  if (!secret || request.headers.get('authorization') !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return Response.json({ skipped: 'push not configured' });
  }

  const d = new Date();
  const today = d.toISOString().slice(0, 10);
  const nowMin = d.getUTCHours() * 60 + d.getUTCMinutes();

  const projects = await queryAll<{ id: string; name: string; org_id: string }>(
    env.DB, "SELECT id, name, org_id FROM projects WHERE status = 'active'"
  );

  let remindedOut = 0;
  let remindedIn = 0;

  for (const p of projects) {
    const expected = await expectedForProject(env.DB, p.org_id, p.id, today);
    const byUser = new Map(expected.filter((e) => e.user_id).map((e) => [e.user_id as string, e]));

    // ── "Don't forget to clock OUT" — open sessions past their expected end ──
    const open = await queryAll<{ id: string; user_id: string }>(
      env.DB,
      `SELECT id, user_id FROM time_sessions
        WHERE project_id = ? AND status IN ('active','on_break') AND reminded_at IS NULL`,
      [p.id]
    );
    for (const s of open) {
      const exp = byUser.get(s.user_id);
      const endMin = exp ? minutesOf(exp.end) : null;
      if (endMin == null || nowMin <= endMin + GRACE) continue;
      await sendToUser(env.DB, env, s.user_id, {
        title: 'Time to clock out?',
        body: `You're still clocked in to ${p.name}.`,
        url: `/project-hub/project/${p.id}`,
        tag: `clockout-${p.id}`,
      });
      await execute(env.DB, 'UPDATE time_sessions SET reminded_at = ? WHERE id = ?', [now(), s.id]);
      remindedOut++;
    }

    // ── "Don't forget to clock IN" — expected but no session anywhere today ──
    for (const e of expected) {
      if (!e.user_id) continue;
      const startMin = minutesOf(e.start);
      if (startMin == null || nowMin <= startMin + GRACE) continue;

      const anySession = await queryOne<{ id: string }>(
        env.DB, 'SELECT id FROM time_sessions WHERE user_id = ? AND date(clock_in) = date(?)', [e.user_id, today]
      );
      if (anySession) continue; // already clocked in somewhere today

      const already = await queryOne<{ user_id: string }>(
        env.DB, 'SELECT user_id FROM clock_in_reminders WHERE user_id = ? AND date = ?', [e.user_id, today]
      );
      if (already) continue;

      await execute(env.DB, 'INSERT INTO clock_in_reminders (user_id, date, created_at) VALUES (?, ?, ?)', [e.user_id, today, now()]);
      await sendToUser(env.DB, env, e.user_id, {
        title: 'Don’t forget to clock in',
        body: `You're expected on site at ${p.name} today.`,
        url: `/project-hub/project/${p.id}`,
        tag: `clockin-${today}`,
      });
      remindedIn++;
    }
  }

  return Response.json({ remindedIn, remindedOut });
};
