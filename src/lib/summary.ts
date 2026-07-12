/**
 * The client-summary pipeline.
 *
 * One pipeline, three triggers — a calendar cadence, a completed milestone, or
 * a person pressing "generate now". They differ only in *what pulled the
 * trigger*, because every summary covers the same thing: the period since the
 * last one was sent. That's what lets "every Friday" and "when the roof went
 * watertight" share a single code path.
 *
 *   gather the period → Claude drafts → approval queue → send → archive
 *
 * Nothing is sent without a person approving it.
 */

import { generateId, now, queryAll, queryOne, execute } from './db';
import { loadEntriesInPeriod } from './entries';
import { draftSummary } from './ai';
import { sendEmail, emailLayout } from './email';
import { uploadToR2 } from './r2';
import { dayAfter } from './summary-schedule';
import type { Project } from '../types/diary';

export type SummaryTrigger = 'scheduled' | 'manual' | 'milestone';
export type SummaryStatus = 'draft' | 'approved' | 'sent' | 'skipped';

export interface Summary {
  id: string;
  org_id: string | null;
  project_id: string;
  period_start: string;
  period_end: string;
  trigger: SummaryTrigger;
  milestone_id: string | null;
  status: SummaryStatus;
  title: string | null;
  narrative: string | null;
  entry_count: number;
  photo_count: number;
  r2_key: string | null;
  recipients: string | null;
  approved_by: string | null;
  approved_at: string | null;
  sent_at: string | null;
  error: string | null;
  created_at: string;
}

export interface Env {
  DB: D1Database;
  R2: R2Bucket;
  ANTHROPIC_API_KEY?: string;
  RESEND_API_KEY?: string;
  BETTER_AUTH_URL?: string;
}

/**
 * Where the next summary's period begins: the day after the last one ended, or
 * — for a project's first summary — its first diary entry. Chaining periods this
 * way is what stops a day of work being reported twice or falling through a gap
 * when the cadence changes mid-project.
 */
async function periodStartFor(db: D1Database, projectId: string, periodEnd: string): Promise<string> {
  const last = await queryOne<{ period_end: string }>(
    db,
    `SELECT period_end FROM summaries
      WHERE project_id = ? AND status IN ('approved', 'sent')
      ORDER BY period_end DESC LIMIT 1`,
    [projectId]
  );
  if (last?.period_end) return dayAfter(last.period_end);

  const first = await queryOne<{ date: string }>(
    db,
    'SELECT date FROM diary_entries WHERE project_id = ? ORDER BY date LIMIT 1',
    [projectId]
  );
  return first?.date ?? periodEnd;
}

/** A draft already waiting on this project — don't stack another on top of it. */
export function pendingDraft(db: D1Database, projectId: string): Promise<{ id: string } | null> {
  return queryOne<{ id: string }>(
    db,
    `SELECT id FROM summaries WHERE project_id = ? AND status = 'draft' LIMIT 1`,
    [projectId]
  );
}

export interface CreateDraftOptions {
  project: Project;
  periodEnd: string;
  trigger: SummaryTrigger;
  milestoneId?: string | null;
  milestoneName?: string | null;
}

/**
 * Build a draft and put it in the approval queue.
 *
 * A failed Claude call is not a failed summary: the draft is still created, with
 * the error recorded and the narrative left empty, so it surfaces in the queue
 * to be written by hand rather than disappearing silently.
 */
export async function createDraft(env: Env, opts: CreateDraftOptions): Promise<Summary | null> {
  const { project, periodEnd, trigger } = opts;

  if (await pendingDraft(env.DB, project.id)) return null;

  const periodStart = await periodStartFor(env.DB, project.id, periodEnd);
  const entries = await loadEntriesInPeriod(env.DB, project.id, periodStart, periodEnd);

  // A scheduled summary with nothing to report is noise — skip it silently.
  // A milestone or a deliberate "generate now" always produces something.
  if (entries.length === 0 && trigger === 'scheduled') return null;

  const photoCount = entries.reduce(
    (sum, e) => sum + e.files.filter((f) => f.mime_type.startsWith('image/')).length,
    0
  );

  let title: string | null = null;
  let narrative: string | null = null;
  let error: string | null = null;

  try {
    const draft = await draftSummary(env.ANTHROPIC_API_KEY ?? '', {
      project,
      entries,
      periodStart,
      periodEnd,
      milestone: opts.milestoneName,
    });
    title = draft.title;
    narrative = draft.narrative;
  } catch (err: any) {
    error = `Draft failed: ${err?.message ?? 'unknown error'}`;
    title = `Progress update — ${periodEnd}`;
  }

  const id = generateId();
  const timestamp = now();

  await execute(
    env.DB,
    `INSERT INTO summaries
       (id, org_id, project_id, period_start, period_end, trigger, milestone_id,
        status, title, narrative, entry_count, photo_count, error, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?)`,
    [
      id, project.org_id ?? null, project.id, periodStart, periodEnd, trigger,
      opts.milestoneId ?? null, title, narrative, entries.length, photoCount,
      error, timestamp,
    ]
  );

  return queryOne<Summary>(env.DB, 'SELECT * FROM summaries WHERE id = ?', [id]);
}

/** Everyone who should receive this project's updates. */
async function recipientsFor(db: D1Database, project: Project): Promise<string[]> {
  const linked = await queryAll<{ email: string }>(
    db,
    `SELECT u.email FROM project_clients pc
       JOIN user u ON u.id = pc.user_id
      WHERE pc.project_id = ?`,
    [project.id]
  );

  const emails = linked.map((r) => r.email).filter(Boolean);
  if (project.client_email && !emails.includes(project.client_email)) {
    emails.push(project.client_email);
  }
  return emails;
}

function paragraphs(narrative: string): string {
  return narrative
    .split(/\n\s*\n/)
    .map((p) => `<p style="margin:0 0 14px">${p.trim().replace(/\n/g, '<br>')}</p>`)
    .join('');
}

/**
 * Approve a draft: email it to the client and archive exactly what was sent.
 *
 * The archive is the point of the R2 copy — six months on, "what did we actually
 * tell them in July?" has one answer, not a reconstruction.
 */
export async function approveAndSend(
  env: Env,
  summary: Summary,
  project: Project,
  approver: { id: string; name?: string | null }
): Promise<{ ok: true; recipients: string[] } | { ok: false; error: string }> {
  if (!summary.narrative?.trim()) {
    return { ok: false, error: 'This summary has no content to send.' };
  }

  const recipients = await recipientsFor(env.DB, project);
  if (recipients.length === 0) {
    return { ok: false, error: 'This project has no client to send to.' };
  }

  const portalUrl = `${env.BETTER_AUTH_URL ?? 'https://maintainlondon.co.uk'}/project-hub/portal/${project.id}`;
  const heading = summary.title || `Progress update — ${project.name}`;
  const html = emailLayout({
    heading,
    body: `${paragraphs(summary.narrative)}
      <p style="color:#6B7280;font-size:13px">Covering ${summary.period_start} to ${summary.period_end}.</p>`,
    ctaLabel: 'View photos and full details',
    ctaUrl: portalUrl,
  });

  const timestamp = now();

  // Archive before sending: if the send fails we still have the record, and if
  // the archive fails we haven't told the client something we can't reproduce.
  const r2Key = `summaries/${project.id}/${summary.id}.html`;
  await uploadToR2(env.R2, r2Key, new TextEncoder().encode(html).buffer as ArrayBuffer, 'text/html', {
    projectId: project.id,
    summaryId: summary.id,
  });

  const sent = await sendEmail(env.RESEND_API_KEY, {
    to: recipients,
    subject: heading,
    html,
  });

  if (!sent) {
    await execute(
      env.DB,
      `UPDATE summaries SET error = ?, r2_key = ? WHERE id = ?`,
      ['Email failed to send — try again.', r2Key, summary.id]
    );
    return { ok: false, error: 'The email failed to send. The draft has been kept.' };
  }

  await execute(
    env.DB,
    `UPDATE summaries
        SET status = 'sent', approved_by = ?, approved_at = ?, sent_at = ?,
            recipients = ?, r2_key = ?, error = NULL
      WHERE id = ?`,
    [approver.id, timestamp, timestamp, recipients.join(', '), r2Key, summary.id]
  );

  return { ok: true, recipients };
}
