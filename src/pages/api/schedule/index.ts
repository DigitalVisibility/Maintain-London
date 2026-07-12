import type { APIRoute } from 'astro';
import { queryOne, execute } from '../../../lib/db';
import { canAccessProject } from '../../../lib/access';
import { hasCap } from '../../../lib/capabilities';
import { resolveSchedule, describeSchedule, CADENCES, type Cadence } from '../../../lib/summary-schedule';
import type { Project, Organisation } from '../../../types/diary';

export const prerender = false;

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/**
 * GET /api/schedule?project_id=  — the business default, this project's override
 * (if any), and the schedule that actually applies.
 */
export const GET: APIRoute = async ({ locals, url }) => {
  const { env } = locals.runtime;
  if (!locals.user || !locals.org) return new Response('Unauthorized', { status: 401 });

  const projectId = url.searchParams.get('project_id');
  const org = await queryOne<Organisation & Record<string, any>>(
    env.DB, 'SELECT * FROM organisations WHERE id = ?', [locals.org.id]
  );
  if (!org) return Response.json({ error: 'Organisation not found' }, { status: 404 });

  let project: (Project & Record<string, any>) | null = null;
  if (projectId) {
    if (!(await canAccessProject(env.DB, locals, projectId))) {
      return new Response('Forbidden', { status: 403 });
    }
    project = await queryOne(env.DB, 'SELECT * FROM projects WHERE id = ?', [projectId]);
  }

  const effective = resolveSchedule(org, project);

  return Response.json({
    cadences: CADENCES,
    timezone: org.timezone,
    org: resolveSchedule(org),
    project: project
      ? {
          cadence: project.summary_cadence,
          day: project.summary_day,
          time: project.summary_time,
          anchor: project.summary_anchor,
        }
      : null,
    effective,
    description: describeSchedule(effective),
  });
};

interface Body {
  scope: 'org' | 'project';
  project_id?: string;
  /** null on a project clears the override and falls back to the business default. */
  cadence?: Cadence | null;
  day?: number | null;
  time?: string | null;
  anchor?: string | null;
  timezone?: string;
}

/** PUT /api/schedule — set the business default, or a project's override. */
export const PUT: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  if (!locals.user || !locals.org) return new Response('Unauthorized', { status: 401 });

  const body = await request.json().catch(() => ({})) as Body;

  if (body.cadence != null && !CADENCES.includes(body.cadence)) {
    return Response.json({ error: 'Unknown cadence' }, { status: 400 });
  }
  if (body.time != null && !TIME.test(body.time)) {
    return Response.json({ error: 'Time must be HH:MM' }, { status: 400 });
  }
  if (body.day != null && (body.day < 1 || body.day > 31)) {
    return Response.json({ error: 'Day is out of range' }, { status: 400 });
  }

  if (body.scope === 'project') {
    if (!body.project_id) return Response.json({ error: 'project_id required' }, { status: 400 });
    if (!hasCap(locals, 'manage_projects') || !(await canAccessProject(env.DB, locals, body.project_id))) {
      return Response.json({ error: 'Forbidden' }, { status: 403 });
    }

    // Nulls are meaningful here: they clear the override so the project goes
    // back to following the business default.
    await execute(
      env.DB,
      `UPDATE projects
          SET summary_cadence = ?, summary_day = ?, summary_time = ?, summary_anchor = ?
        WHERE id = ?`,
      [body.cadence ?? null, body.day ?? null, body.time ?? null, body.anchor ?? null, body.project_id]
    );
    return Response.json({ status: 'updated' });
  }

  // Business default. Timezone is org-wide — a project can't sit in another country.
  if (!hasCap(locals, 'manage_users')) {
    return Response.json({ error: 'Forbidden' }, { status: 403 });
  }

  const org = await queryOne<Organisation & Record<string, any>>(
    env.DB, 'SELECT * FROM organisations WHERE id = ?', [locals.org.id]
  );
  if (!org) return Response.json({ error: 'Organisation not found' }, { status: 404 });

  await execute(
    env.DB,
    `UPDATE organisations
        SET summary_cadence = ?, summary_day = ?, summary_time = ?, summary_anchor = ?, timezone = ?
      WHERE id = ?`,
    [
      body.cadence ?? org.summary_cadence,
      body.day ?? org.summary_day,
      body.time ?? org.summary_time,
      body.anchor ?? org.summary_anchor,
      body.timezone ?? org.timezone,
      locals.org.id,
    ]
  );
  return Response.json({ status: 'updated' });
};
