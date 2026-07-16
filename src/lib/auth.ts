import { betterAuth } from 'better-auth';
import { D1Dialect } from 'kysely-d1';

/**
 * Create a Better-Auth instance bound to the current request's D1 database.
 * Must be called per-request since D1 bindings are request-scoped in Workers.
 *
 * `platformDomain` (e.g. "projectdash.app") turns on cross-subdomain sessions:
 * the cookie is set on `.projectdash.app` so signing in once is recognised on
 * every business subdomain. Isolation is still enforced downstream — the
 * subdomain pins the business and access needs membership (see middleware).
 * Leave it undefined on the legacy single-domain host for a host-only cookie.
 */
export function createAuth(db: D1Database, secret: string, baseURL: string, platformDomain?: string) {
  const isHttps = baseURL.startsWith('https');
  // Share the session across *.projectdash.app — but NOT for `.localhost`, which
  // browsers refuse as a cookie domain. Local subdomains just get host-only
  // cookies (each subdomain its own login), which is fine for dev.
  const crossSubDomain = platformDomain && platformDomain !== 'localhost'
    ? {
        crossSubDomainCookies: { enabled: true, domain: '.' + platformDomain },
      }
    : {};
  const trustedOrigins = platformDomain
    ? [
        `https://${platformDomain}`, `https://*.${platformDomain}`,
        `http://${platformDomain}`, `http://*.${platformDomain}`,
      ]
    : undefined;

  return betterAuth({
    database: {
      dialect: new D1Dialect({ database: db }),
      type: 'sqlite',
    },
    baseURL,
    basePath: '/api/auth',
    secret,
    ...(trustedOrigins ? { trustedOrigins } : {}),
    emailAndPassword: {
      enabled: true,
      requireEmailVerification: false,
    },
    session: {
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5, // 5 minutes
      },
      expiresIn: 60 * 60 * 24 * 7, // 7 days
      updateAge: 60 * 60 * 24, // 1 day
    },
    user: {
      additionalFields: {
        role: {
          type: 'string',
          defaultValue: 'operative',
          required: false,
          // Never settable via sign-up — the real role is assigned server-side
          // from the invitation when an account is accepted.
          input: false,
        },
        phone: {
          type: 'string',
          required: false,
        },
      },
    },
    advanced: {
      // Secure cookies over HTTPS in production; relaxed on http://localhost so
      // sign-in works in local dev.
      useSecureCookies: isHttps,
      ...crossSubDomain,
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
