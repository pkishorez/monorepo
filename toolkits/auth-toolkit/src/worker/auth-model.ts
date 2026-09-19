import type { BetterAuthOptions, BetterAuthPlugin } from 'better-auth';
import { admin, bearer, deviceAuthorization, jwt } from 'better-auth/plugins';
import { cimd } from '@better-auth/cimd';
import {
  DEFAULT_OAUTH_SCOPES,
  oauthProvider,
} from '@better-auth/oauth-provider';
import { workerClientMetadataFetch } from './client-metadata-fetch.js';

interface AuthModelConfig {
  google: { clientId: string; clientSecret: string };
  cookieCacheMaxAge?: number | undefined;
}

export interface ScopeDefinition {
  name: string;
  /** Shown to the User on the consent page. */
  description: string;
}

/** `manual`: an Administrator creates every client. `dynamic`: clients
 * self-register (RFC 7591). `cimd`: clients are identified by the metadata
 * document at their own HTTPS URL. */
export type ClientRegistration = 'manual' | 'dynamic' | 'cimd' | 'dynamic+cimd';

export interface AuthorizationServerConfig {
  /** Each Resource Server's audience URL, e.g. `https://api.example.com`. */
  resources: string[];
  /** Scopes beyond OpenID's `openid`, `profile`, `email`, `offline_access`. */
  scopes?: ReadonlyArray<ScopeDefinition>;
  /** @default 'manual' */
  clientRegistration?: ClientRegistration | undefined;
}

const allowsDynamicRegistration = (registration: ClientRegistration) =>
  registration === 'dynamic' || registration === 'dynamic+cimd';

const allowsClientMetadataDocuments = (registration: ClientRegistration) =>
  registration === 'cimd' || registration === 'dynamic+cimd';

export const AUTH_PAGES = {
  login: '/login',
  consent: '/consent',
  device: '/device',
} as const;

export const authModelOptions = (config: AuthModelConfig): BetterAuthOptions =>
  ({
    socialProviders: {
      google: { ...config.google, prompt: 'select_account' },
    },
    session: {
      storeSessionInDatabase: true,
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
    plugins: [
      admin(),
      bearer(),
      deviceAuthorization({ verificationUri: AUTH_PAGES.device }),
    ],
  }) satisfies BetterAuthOptions;

export const authorizationServerOptions = (
  config: AuthorizationServerConfig,
): Pick<BetterAuthOptions, 'plugins' | 'disabledPaths'> => {
  const registration = config.clientRegistration ?? 'manual';
  return {
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
        scopes: [
          ...DEFAULT_OAUTH_SCOPES,
          ...(config.scopes ?? []).map((scope) => scope.name),
        ],
        allowDynamicClientRegistration: allowsDynamicRegistration(registration),
        allowUnauthenticatedClientRegistration:
          allowsDynamicRegistration(registration),
        customAccessTokenClaims: ({ user }) =>
          user ? { email: user.email, name: user.name } : {},
      }) as BetterAuthPlugin,
      ...(allowsClientMetadataDocuments(registration)
        ? [
            cimd({
              fetchClientMetadataResource: workerClientMetadataFetch,
              metadataProfile: 'mcp-2026-07-28',
            }) as BetterAuthPlugin,
          ]
        : []),
    ],
    disabledPaths: ['/token'],
  };
};
