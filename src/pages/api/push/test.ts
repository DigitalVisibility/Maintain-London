import type { APIRoute } from 'astro';
import { sendToUser } from '../../../lib/push';

export const prerender = false;

/** POST /api/push/test — send a test notification to the signed-in user's devices. */
export const POST: APIRoute = async ({ locals }) => {
  const { env } = locals.runtime;
  if (!locals.user) return new Response('Unauthorized', { status: 401 });
  if (!env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) {
    return Response.json({ error: 'Push notifications aren’t configured on this deployment yet.' }, { status: 503 });
  }
  await sendToUser(env.DB, env, locals.user.id, {
    title: 'Project Hub',
    body: 'Notifications are working 🎉',
    url: '/project-hub/',
    tag: 'test',
  });
  return Response.json({ success: true });
};
