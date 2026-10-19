import type { BetterAuthOptions, BetterAuthPlugin } from 'better-auth';
import {
  admin,
  bearer,
  deviceAuthorization,
  jwt,
  multiSession,
} from 'better-auth/plugins';
import { cimd } from '@better-auth/cimd';
import {
  DEFAULT_OAUTH_SCOPES,
  oauthProvider,
} from '@better-auth/oauth-provider';
import { AUTH_PAGES, accessTokenUserClaims } from '../../contract/index.js';
import { workerClientMetadataFetch } from './client-metadata-fetch.js';
import { COOKIE_CACHE_SECONDS, DEFAULT_MAX_ACCOUNTS } from './config.js';
import { grantRevocation } from './plugins/index.js';

/** The Identity Role: always on. */
export const authModelOptions = (config: {
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

/** The Authorization Server Role. OAuth Clients register themselves, by
 * Dynamic Client Registration or a Client ID Metadata Document. */
export const authorizationServerOptions = (config: {
  resources: string[];
  scopes: string[];
}): Pick<BetterAuthOptions, 'plugins' | 'disabledPaths'> => ({
  plugins: [
    jwt({ disableSettingJwtHeader: true }),
    oauthProvider({
      loginPage: AUTH_PAGES.login,
      consentPage: AUTH_PAGES.consent,
      // The schema generator's mock adapter has no tables to seed.
      ...(config.resources.length > 0
        ? {
            resources: config.resources,
            clientRegistrationDefaultResources: config.resources,
          }
        : {}),
      scopes: [...new Set<string>([...DEFAULT_OAUTH_SCOPES, ...config.scopes])],
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      customAccessTokenClaims: ({ user }) =>
        user ? accessTokenUserClaims(user) : {},
    }) as BetterAuthPlugin,
    grantRevocation(),
    cimd({
      fetchClientMetadataResource: workerClientMetadataFetch,
      metadataProfile: 'mcp-2026-07-28',
    }) as BetterAuthPlugin,
  ],
  disabledPaths: ['/token'],
});
