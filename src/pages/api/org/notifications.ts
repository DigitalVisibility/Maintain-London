import type { APIRoute } from 'astro';
import { queryOne, execute } from '../../../lib/db';
import { hasCap } from '../../../lib/capabilities';

export const prerender = false;

const MODES = ['once', 'chase'] as const;

/** GET /api/org/notifications — how persistent this business wants message alerts. */
export const GET: APIRoute = async ({ locals }) => {
  const { env } = locals.runtime;
  if (!locals.user || !locals.org) return new Response('Unauthorized', { status: 401 });

  const org = await queryOne<{ message_notify: string; name: string; email_from: string | null }>(
    env.DB,
    'SELECT message_notify, name, email_from FROM organisations WHERE id = ?',
    [locals.org.id]
  );

  return Response.json({
    message_notify: org?.message_notify === 'chase' ? 'chase' : 'once',
    sender_name: org?.name ?? '',
    reply_to: org?.email_from ?? '',
  });
};

/** PUT /api/org/notifications  { message_notify?, reply_to? } */
export const PUT: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  if (!locals.user || !locals.org) return new Response('Unauthorized', { status: 401 });
  if (!hasCap(locals, 'manage_users')) return new Response('Forbidden', { status: 403 });

  const body = await request.json().catch(() => ({})) as {
    message_notify?: string;
    reply_to?: string;
  };

  if (body.message_notify && !MODES.includes(body.message_notify as any)) {
    return Response.json({ error: 'Unknown notification mode' }, { status: 400 });
  }

  const org = await queryOne<{ message_notify: string; email_from: string | null }>(
    env.DB, 'SELECT message_notify, email_from FROM organisations WHERE id = ?', [locals.org.id]
  );

  const replyTo = body.reply_to === undefined
    ? org?.email_from ?? null
    : (body.reply_to.trim() || null);

  await execute(
    env.DB,
    'UPDATE organisations SET message_notify = ?, email_from = ? WHERE id = ?',
    [body.message_notify ?? org?.message_notify ?? 'once', replyTo, locals.org.id]
  );

  return Response.json({ status: 'updated' });
};
