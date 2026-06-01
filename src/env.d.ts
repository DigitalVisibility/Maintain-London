/// <reference path="../.astro/types.d.ts" />

type Runtime = import('@astrojs/cloudflare').Runtime<{
  DB: D1Database;
  R2: R2Bucket;
  BETTER_AUTH_SECRET: string;
  BETTER_AUTH_URL: string;
}>;

declare namespace App {
  interface Locals extends Runtime {
    user?: import('./types/diary').User | null;
    session?: { id: string; token: string; userId: string; expiresAt: string } | null;
    /** The active organisation (tenant) for this request. */
    org?: import('./types/diary').Organisation | null;
    /** The signed-in user's role within the active org. */
    role?: string | null;
    /** All orgs the user belongs to (for the org switcher). */
    memberships?: import('./types/diary').MembershipWithOrg[];
  }
}
