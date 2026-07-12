/**
 * Summary cron — a sidecar.
 *
 * Cloudflare Pages has no cron triggers, and the Project Hub is deployed on
 * Pages. Rather than migrate the live site onto Workers just to get a scheduler,
 * this tiny Worker owns the clock and nothing else: it wakes up, calls the Hub's
 * sweep endpoint, and goes back to sleep. All the logic — whose summary is due,
 * what period it covers, what it says — stays in the app, where it can be tested
 * and changed without redeploying the schedule.
 *
 * Deploy:
 *   cd workers/summary-cron
 *   npx wrangler secret put CRON_SECRET      # same value as on the Pages project
 *   npx wrangler deploy
 */

export interface Env {
  HUB_URL: string;
  CRON_SECRET: string;
}

async function sweep(env: Env): Promise<Response> {
  const res = await fetch(`${env.HUB_URL}/api/summaries/run`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.CRON_SECRET}`,
      'Content-Type': 'application/json',
    },
  });

  const body = await res.text();
  if (!res.ok) {
    console.error(`summary sweep failed: ${res.status} ${body}`);
  } else {
    console.log(`summary sweep ok: ${body}`);
  }
  return new Response(body, { status: res.status });
}

export default {
  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext) {
    ctx.waitUntil(sweep(env));
  },

  /**
   * Manual trigger, for testing the sweep without waiting for the clock.
   * Requires the same secret — this is not a public endpoint.
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    if (request.headers.get('authorization') !== `Bearer ${env.CRON_SECRET}`) {
      return new Response('Unauthorized', { status: 401 });
    }
    return sweep(env);
  },
};
