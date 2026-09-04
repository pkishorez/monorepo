import type { BetterAuthOptions } from 'better-auth';

interface AuthModelConfig {
  google: { clientId: string; clientSecret: string };
  cookieCacheMaxAge?: number;
}

/** Options that shape both Better Auth's runtime model and generated schema. */
export const authModelOptions = (config: AuthModelConfig) =>
  ({
    socialProviders: {
      google: config.google,
    },
    session: {
      storeSessionInDatabase: true,
      // `refreshCache` is DB-less. On a Cookie Cache miss this worker already
      // falls through to its Session Store, so the two should not be combined.
      cookieCache: {
        enabled: true,
        maxAge: config.cookieCacheMaxAge ?? 300,
      },
    },
    verification: {
      storeInDatabase: true,
    },
    // Cloudflare KV cannot atomically increment counters and rejects the
    // default 10-second TTL. Keep rate limiting in the primary database.
    rateLimit: {
      storage: 'database',
    },
  }) satisfies BetterAuthOptions;
