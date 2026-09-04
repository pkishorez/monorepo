import type { BetterAuthOptions } from 'better-auth';
import { admin } from 'better-auth/plugins';

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
    rateLimit: {
      enabled: false,
    },
    // Dash uses Admin's fields and session hook for ban enforcement, even
    // though administration itself happens through Better Auth Infrastructure.
    plugins: [admin()],
  }) satisfies BetterAuthOptions;
