import type { APIRoute } from 'astro';
import { queryOne, execute, now } from '../../../lib/db';
import { canAccessProject } from '../../../lib/access';
import { hasCap } from '../../../lib/capabilities';
import { createDraft } from '../../../lib/summary';
import { resolveSchedule, todayIn } from '../../../lib/summary-schedule';
import type { Milestone } from './index';
import type { Project, Organisation } from '../../../types/diary';

export const prerender = false;

async function load(env: any, locals: App.Locals, id: string) {
  const milestone = await queryOne<Milestone>(
    env.DB, 'SELECT * FROM project_milestones WHERE id = ?', [id]
  );
  if (!milestone) return { error: Response.json({ error: 'Not found' }, { status: 404 }) };

  if (!hasCap(locals, 'manage_projects') || !(await canAccessProject(env.DB, locals, milestone.project_id))) {
    return { error: Response.json({ error: 'Forbidden' }, { status: 403 }) };
  }
  return { milestone };
}

/**
 * PATCH /api/milestones/:id  { name?, target_date?, triggers_summary?, status? }
 *
 * Marking a milestone complete is the roofer's trigger: the moment the roof is
 * watertight, the client gets an update covering everything since the last one —
 * and later, this is the same event a stage payment falls due on.
 */
export const PATCH: APIRoute = async ({ locals, params, request }) => {
  const { env } = locals.runtime;
  const user = locals.user;
  if (!user || !locals.org) return new Response('Unauthorized', { status: 401 });

  const found = await load(env, locals, params.id!);
  if ('error' in found) return found.error;
  const { milestone } = found;

  const body = await request.json().catch(() => ({})) as {
    name?: string; target_date?: string | null;
    triggers_summary?: boolean; status?: 'pending' | 'complete';
  };

  const completing = body.status === 'complete' && milestone.status !== 'complete';
  const status = body.status ?? milestone.status;

  await execute(
    env.DB,
    `UPDATE project_milestones
        SET name = ?, target_date = ?, triggers_summary = ?, status = ?,
            completed_at = ?, completed_by = ?
      WHERE id = ?`,
    [
      body.name?.trim() || milestone.name,
      body.target_date === undefined ? milestone.target_date : body.target_date,
      body.triggers_summary === undefined
        ? milestone.triggers_summary
        : (body.triggers_summary ? 1 : 0),
      status,
      status === 'complete' ? (milestone.completed_at ?? now()) : null,
      status === 'complete' ? (milestone.completed_by ?? user.id) : null,
      milestone.id,
    ]
  );

  // Only draft on the transition into complete, and only if this milestone is
  // one the team wants the client told about.
  const wantsSummary = body.triggers_summary ?? !!milestone.triggers_summary;
  let summaryId: string | null = null;

  if (completing && wantsSummary) {
    const project = await queryOne<Project & Record<string, any>>(
      env.DB, 'SELECT * FROM projects WHERE id = ?', [milestone.project_id]
    );
    const org = await queryOne<Organisation & Record<string, any>>(
      env.DB, 'SELECT * FROM organisations WHERE id = ?', [locals.org.id]
    );

    if (project) {
      const schedule = resolveSchedule(org ?? {}, project);
      const summary = await createDraft(env, {
        project,
        periodEnd: todayIn(schedule.timezone, Date.now()),
        trigger: 'milestone',
        milestoneId: milestone.id,
        milestoneName: body.name?.trim() || milestone.name,
      });
      summaryId = summary?.id ?? null;
    }
  }

  return Response.json({ status: 'updated', summary_id: summaryId });
};

/** DELETE /api/milestones/:id */
export const DELETE: APIRoute = async ({ locals, params }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const found = await load(env, locals, params.id!);
  if ('error' in found) return found.error;

  await execute(env.DB, 'DELETE FROM project_milestones WHERE id = ?', [found.milestone.id]);
  return Response.json({ status: 'deleted' });
};
