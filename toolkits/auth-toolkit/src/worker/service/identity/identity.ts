import type { BetterAuthOptions } from 'better-auth';
import {
  admin,
  bearer,
  deviceAuthorization,
  multiSession,
} from 'better-auth/plugins';
import { AUTH_PAGES } from '../../../contract/index.js';
import { COOKIE_CACHE_SECONDS, DEFAULT_MAX_ACCOUNTS } from '../config.js';

/** The Identity Role: always on. */
export const identityOptions = (config: {
  google: { clientId: string; clientSecret: string };
  maxAccounts?: number | undefined;
}): BetterAuthOptions =>
  ({
    socialProviders: {
      google: { ...config.google, prompt: 'select_account' },
    },
    session: {
      storeSessionInDatabase: true,
      cookieCache: { enabled: true, maxAge: COOKIE_CACHE_SECONDS },
    },
    verification: { storeInDatabase: true },
    rateLimit: { enabled: false },
    onAPIError: { errorURL: AUTH_PAGES.error },
    plugins: [
      admin(),
      bearer(),
      deviceAuthorization({ verificationUri: AUTH_PAGES.device }),
      multiSession({
        maximumSessions: config.maxAccounts ?? DEFAULT_MAX_ACCOUNTS,
      }),
    ],
  }) satisfies BetterAuthOptions;
