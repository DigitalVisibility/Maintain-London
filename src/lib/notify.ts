/**
 * Notifications for the project message thread.
 *
 * The client's complaint: "something needs to notify me or a team member when a
 * new message arrives so it can be actioned." A message that reaches nobody is
 * worse than no message at all — the sender believes they've told you.
 *
 * The design constraint is the opposite failure: a notification that fires on
 * every single message trains people to ignore all of them. So we email a person
 * about a thread at most once per quiet period; if they haven't come back to read
 * it yet, another email saying the same thing adds nothing.
 */

import { queryAll, queryOne, execute, generateId, now } from './db';
import { sendEmail, emailLayout, loadSender } from './email';
import { baseUrlForOrgId } from './platform';
import type { Project } from '../types/diary';

/** In 'chase' mode, don't email the same person about a thread more often than this. */
const QUIET_PERIOD_MINUTES = 30;

/**
 * How persistent a business wants its message alerts to be.
 *
 *  'once'  — the default. You're told a thread has something new, and not told
 *            again until you've actually looked at it. Reading re-arms it, so the
 *            next message notifies straight away. Quiet inbox; the unread badge
 *            carries anything you miss.
 *  'chase' — keep reminding while new messages keep arriving and you still
 *            haven't read them, at most one email every 30 minutes.
 */
export type NotifyMode = 'once' | 'chase';

export interface NotifyEnv {
  DB: D1Database;
  RESEND_API_KEY?: string;
  BETTER_AUTH_URL?: string;
}

interface Recipient {
  id: string;
  email: string;
  name: string | null;
  /** Clients land in the portal; staff land in the project. */
  isClient: boolean;
}

/**
 * Who should hear about this message? Whoever is on the *other side* of it —
 * a client's message goes to the team, the team's goes to the client. Nobody is
 * ever notified about their own message.
 */
async function audienceFor(
  db: D1Database,
  project: Project,
  authorId: string,
  authorIsClient: boolean
): Promise<Recipient[]> {
  if (authorIsClient) {
    // The client spoke — tell the people who can act on it.
    const staff = await queryAll<{ id: string; email: string; name: string | null }>(
      db,
      `SELECT u.id, u.email, u.name
         FROM memberships m JOIN user u ON u.id = m.user_id
        WHERE m.org_id = ? AND m.role IN ('owner', 'admin', 'manager')`,
      [project.org_id ?? '']
    );
    return staff
      .filter((s) => s.id !== authorId && s.email)
      .map((s) => ({ ...s, isClient: false }));
  }

  // The team spoke — tell the client.
  const clients = await queryAll<{ id: string; email: string; name: string | null }>(
    db,
    `SELECT u.id, u.email, u.name
       FROM project_clients pc JOIN user u ON u.id = pc.user_id
      WHERE pc.project_id = ?`,
    [project.id]
  );
  return clients
    .filter((c) => c.id !== authorId && c.email)
    .map((c) => ({ ...c, isClient: true }));
}

/**
 * Have we already told this person about this thread recently?
 *
 * Pure, and separate from the database read, because the parsing is the part
 * that bites: D1 stores "2026-07-12 21:09:42.740" — a space, and no timezone.
 * Handing that to Date.parse directly is interpreted as *local* time by some
 * engines and rejected outright by others, so the throttle would either never
 * fire or never stop firing. Normalise it to ISO explicitly.
 *
 * Unknown or unparseable means "not notified" — the safe direction is to send a
 * duplicate, not to swallow the only alert someone was going to get.
 */
export function withinQuietPeriod(lastNotifiedAt: string | null | undefined, nowMs: number): boolean {
  if (!lastNotifiedAt) return false;

  const iso = lastNotifiedAt.includes('T') ? lastNotifiedAt : lastNotifiedAt.replace(' ', 'T');
  const last = Date.parse(/[Z+]|-\d\d:\d\d$/.test(iso) ? iso : `${iso}Z`);
  if (!Number.isFinite(last)) return false;

  return nowMs - last < QUIET_PERIOD_MINUTES * 60_000;
}

/**
 * Should we stay quiet about this thread for this person?
 *
 * In 'once' mode, any outstanding stamp means quiet — we've told them and they
 * haven't looked yet, so saying it again adds nothing. Marking the thread read
 * clears the stamp, which is what re-arms the alert.
 *
 * In 'chase' mode the stamp expires after the quiet period, so a client who keeps
 * messaging keeps getting through.
 */
async function stayQuiet(
  db: D1Database,
  projectId: string,
  userId: string,
  mode: NotifyMode
): Promise<boolean> {
  const row = await queryOne<{ last_notified_at: string | null }>(
    db,
    'SELECT last_notified_at FROM message_reads WHERE project_id = ? AND user_id = ?',
    [projectId, userId]
  );
  if (!row?.last_notified_at) return false;

  return mode === 'once' ? true : withinQuietPeriod(row.last_notified_at, Date.now());
}

/** Record that we've emailed this person about this thread. */
async function stampNotified(db: D1Database, projectId: string, userId: string): Promise<void> {
  const timestamp = now();
  await execute(
    db,
    `INSERT INTO message_reads (id, project_id, user_id, last_notified_at, created_at)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT (project_id, user_id)
     DO UPDATE SET last_notified_at = excluded.last_notified_at`,
    [generateId(), projectId, userId, timestamp, timestamp]
  );
}

/** A one-glance excerpt of the message, for the email. */
export function preview(body: string): string {
  const clean = body.trim().replace(/\s+/g, ' ');
  return clean.length > 240 ? `${clean.slice(0, 240)}…` : clean;
}

/** The message body is user input and goes into an HTML email — escape it. */
export const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface NewMessage {
  project: Project;
  body: string;
  authorId: string;
  authorName: string | null;
  authorIsClient: boolean;
}

/**
 * Email the other side about a new message. Never throws — a notification that
 * fails must not fail the message itself; the message is already saved and
 * visible in the thread either way.
 */
export async function notifyNewMessage(env: NotifyEnv, msg: NewMessage): Promise<void> {
  try {
    const recipients = await audienceFor(env.DB, msg.project, msg.authorId, msg.authorIsClient);
    if (recipients.length === 0) return;

    const orgId = msg.project.org_id ?? null;

    // The email goes out as the business that owns the project — never as the
    // platform, and never as another tenant.
    const [sender, org] = await Promise.all([
      loadSender(env.DB, orgId),
      queryOne<{ message_notify: string }>(
        env.DB, 'SELECT message_notify FROM organisations WHERE id = ?', [orgId ?? '']
      ),
    ]);
    const mode: NotifyMode = org?.message_notify === 'chase' ? 'chase' : 'once';

    const base = await baseUrlForOrgId(env, env.DB, orgId);
    const author = msg.authorName || (msg.authorIsClient ? 'The client' : 'The team');

    for (const to of recipients) {
      if (await stayQuiet(env.DB, msg.project.id, to.id, mode)) continue;

      const url = to.isClient
        ? `${base}/project-hub/portal/${msg.project.id}`
        : `${base}/project-hub/project/${msg.project.id}`;

      const sent = await sendEmail(env.RESEND_API_KEY, {
        to: to.email,
        from: sender.from,
        replyTo: sender.replyTo,
        subject: `New message on ${msg.project.name}`,
        html: emailLayout({
          sender,
          heading: `New message on ${msg.project.name}`,
          body: `<p style="margin:0 0 8px"><strong>${escapeHtml(author)}</strong> wrote:</p>
                 <blockquote style="margin:0 0 14px;padding:10px 14px;border-left:3px solid ${sender.brandColor};background:#F9FAFB;color:#374151">
                   ${escapeHtml(preview(msg.body))}
                 </blockquote>
                 <p style="margin:0;color:#6B7280;font-size:13px">Reply in the project hub so the whole conversation stays in one place.</p>`,
          ctaLabel: 'Read and reply',
          ctaUrl: url,
        }),
      });

      // Stamp only on a successful send, so a transient email failure doesn't
      // silence the alert about a message nobody was ever told about.
      if (sent) await stampNotified(env.DB, msg.project.id, to.id);
    }
  } catch (err) {
    console.error('notifyNewMessage failed', err);
  }
}
