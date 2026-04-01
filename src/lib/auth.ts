import { betterAuth } from 'better-auth';
import { D1Dialect } from 'kysely-d1';

/**
 * Create a Better-Auth instance bound to the current request's D1 database.
 * Must be called per-request since D1 bindings are request-scoped in Workers.
 */
export function createAuth(db: D1Database, secret: string, baseURL: string) {
  return betterAuth({
    database: {
      dialect: new D1Dialect({ database: db }),
      type: 'sqlite',
    },
    baseURL,
    basePath: '/api/auth',
    secret,
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
        },
        phone: {
          type: 'string',
          required: false,
        },
      },
    },
    advanced: {
      useSecureCookies: true,
    },
  });
}

export type Auth = ReturnType<typeof createAuth>;
