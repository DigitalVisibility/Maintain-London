import type { APIRoute } from 'astro';
import { queryAll, execute } from '../../../lib/db';
import { createDraft } from '../../../lib/summary';
import { resolveSchedule, lastOccurrence } from '../../../lib/summary-schedule';
import type { Project } from '../../../types/diary';

export const prerender = false;

/**
 * POST /api/summaries/run — the scheduled sweep.
 *
 * Called by the sidecar cron Worker (Cloudflare Pages has no cron triggers of
 * its own), authenticated with a shared secret rather than a user session.
 *
 * It asks each project "when did your schedule last come due?" and fires only if
 * that occurrence is newer than the last one the project fired for. That makes
 * the sweep idempotent and self-healing: running it every 15 minutes produces one
 * summary per occurrence, and if the worker is down for a day, the next run still
 * catches the occurrence it missed instead of skipping it.
 */
export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;

  const secret = env.CRON_SECRET;
  const auth = request.headers.get('authorization');
  if (!secret || auth !== `Bearer ${secret}`) {
    return new Response('Unauthorized', { status: 401 });
  }

  const nowMs = Date.now();

  // Every active project, with its org's defaults alongside its own overrides.
  const projects = await queryAll<Project & Record<string, any>>(
    env.DB,
    `SELECT p.*,
            o.summary_cadence AS org_cadence, o.summary_day AS org_day,
            o.summary_time AS org_time, o.summary_anchor AS org_anchor,
            o.timezone AS org_timezone
       FROM projects p
       JOIN organisations o ON o.id = p.org_id
      WHERE p.status = 'active'`
  );

  const fired: { project: string; period_end: string }[] = [];
  const skipped: { project: string; reason: string }[] = [];

  for (const project of projects) {
    const schedule = resolveSchedule(
      {
        summary_cadence: project.org_cadence,
        summary_day: project.org_day,
        summary_time: project.org_time,
        summary_anchor: project.org_anchor,
        timezone: project.org_timezone,
      },
      project
    );

    const occurrence = lastOccurrence(schedule, nowMs);
    if (!occurrence) {
      skipped.push({ project: project.id, reason: `no schedule (${schedule.cadence})` });
      continue;
    }

    // Already fired for this occurrence (or a later one).
    const lastFired = project.summary_last_fired_at
      ? Date.parse(project.summary_last_fired_at)
      : 0;
    if (Number.isFinite(lastFired) && lastFired >= occurrence.at) {
      skipped.push({ project: project.id, reason: 'already fired' });
      continue;
    }

    // Stamp first. A crash between drafting and stamping would otherwise re-fire
    // the same occurrence on the next sweep, and a duplicate client email is far
    // worse than a missed one — which a human can always trigger by hand.
    await execute(
      env.DB,
      'UPDATE projects SET summary_last_fired_at = ? WHERE id = ?',
      [new Date(occurrence.at).toISOString(), project.id]
    );

    try {
      const summary = await createDraft(env, {
        project,
        periodEnd: occurrence.date,
        trigger: 'scheduled',
      });
      if (summary) fired.push({ project: project.id, period_end: occurrence.date });
      else skipped.push({ project: project.id, reason: 'nothing to report, or a draft is already pending' });
    } catch (err: any) {
      skipped.push({ project: project.id, reason: `failed: ${err?.message ?? 'unknown'}` });
    }
  }

  return Response.json({ ran_at: new Date(nowMs).toISOString(), fired, skipped });
};
