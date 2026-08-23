import type { APIRoute } from 'astro';
import { execute, generateId, now, queryOne } from '../../../lib/db';

export const prerender = false;

/** GET /api/push/subscribe — the VAPID public key + whether this device is subscribed. */
export const GET: APIRoute = async ({ locals, url }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  const endpoint = url.searchParams.get('endpoint');
  let subscribed = false;
  if (endpoint) {
    const row = await queryOne<{ id: string }>(
      env.DB, 'SELECT id FROM push_subscriptions WHERE endpoint = ? AND user_id = ?', [endpoint, locals.user.id]
    ).catch(() => null);
    subscribed = !!row;
  }
  return Response.json({
    publicKey: env.VAPID_PUBLIC_KEY || null,
    configured: !!(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY),
    subscribed,
  });
};

/** POST /api/push/subscribe { subscription } — save this device's push subscription. */
export const POST: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });

  const body = await request.json().catch(() => ({})) as { subscription?: { endpoint?: string; keys?: { p256dh?: string; auth?: string } } };
  const sub = body.subscription;
  if (!sub?.endpoint || !sub.keys?.p256dh || !sub.keys?.auth) {
    return Response.json({ error: 'Invalid subscription' }, { status: 400 });
  }
  // Upsert by endpoint (a device re-subscribing shouldn't duplicate).
  await execute(
    env.DB,
    `INSERT INTO push_subscriptions (id, org_id, user_id, endpoint, p256dh, auth, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (endpoint) DO UPDATE SET user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth`,
    [generateId(), locals.org?.id ?? null, locals.user.id, sub.endpoint, sub.keys.p256dh, sub.keys.auth, now()]
  );
  return Response.json({ success: true });
};

/** DELETE /api/push/subscribe { endpoint } — remove this device's subscription. */
export const DELETE: APIRoute = async ({ locals, request }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  const body = await request.json().catch(() => ({})) as { endpoint?: string };
  if (body.endpoint) {
    await execute(env.DB, 'DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?', [body.endpoint, locals.user.id]);
  }
  return Response.json({ success: true });
};
