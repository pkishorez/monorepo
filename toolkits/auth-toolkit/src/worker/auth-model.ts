import type { BetterAuthOptions, BetterAuthPlugin } from 'better-auth';
import { admin, jwt } from 'better-auth/plugins';
import {
  DEFAULT_OAUTH_SCOPES,
  oauthDeviceAuthorization,
  oauthProvider,
} from '@better-auth/oauth-provider';

interface AuthModelConfig {
  google: { clientId: string; clientSecret: string };
  cookieCacheMaxAge?: number | undefined;
}

/** A Scope a Client Application may request; the description is what the
 * consent page shows the User. */
export interface ScopeDefinition {
  name: string;
  description: string;
}

/** The Authorization Server Role: on only when a deployment configures it. */
export interface AuthorizationServerConfig {
  /** Each Resource Server's audience URL, e.g. `https://api.example.com`.
   * An Access Token is bound to exactly one of them. */
  resources: string[];
  /** Scopes beyond OpenID's `openid`, `profile`, `email`, `offline_access`. */
  scopes?: ReadonlyArray<ScopeDefinition>;
}

/** The pages the Auth Worker app serves; the provider redirects to them. */
export const AUTHORIZATION_SERVER_PAGES = {
  login: '/login',
  consent: '/consent',
  device: '/device',
} as const;

/** Identity Role options that shape both Better Auth's runtime model and the
 * generated schema. */
export const authModelOptions = (config: AuthModelConfig): BetterAuthOptions =>
  ({
    socialProviders: {
      google: { ...config.google, prompt: 'select_account' },
    },
    session: {
      storeSessionInDatabase: true,
      // `refreshCache` is DB-less. On a Cookie Cache miss this worker already
      // reads the Primary Database, so the two should not be combined.
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

/** Authorization Server Role plugins. Access Tokens are JWTs signed by the JWT
 * plugin's keys; the User's email and name ride along as claims so a Resource
 * Server can build a Token Principal without calling back. Dynamic client
 * registration stays off. */
export const authorizationServerOptions = (
  config: AuthorizationServerConfig,
): Pick<BetterAuthOptions, 'plugins' | 'disabledPaths'> => ({
  plugins: [
    // The JWT plugin exists for the OAuth provider's signing keys only: no
    // session JWT header, and no `/token` route handing out user JWTs.
    jwt({ disableSettingJwtHeader: true }),
    oauthProvider({
      loginPage: AUTHORIZATION_SERVER_PAGES.login,
      consentPage: AUTHORIZATION_SERVER_PAGES.consent,
      // Seeding resource rows happens at init; the generator's mock adapter
      // has no tables yet, so it passes none.
      ...(config.resources.length > 0 ? { resources: config.resources } : {}),
      scopes: [
        ...DEFAULT_OAUTH_SCOPES,
        ...(config.scopes ?? []).map((scope) => scope.name),
      ],
      allowDynamicClientRegistration: false,
      customAccessTokenClaims: ({ user }) =>
        user ? { email: user.email, name: user.name } : {},
      // The provider's endpoint types trip exactOptionalPropertyTypes; the
      // plugin itself is a regular Better Auth plugin.
    }) as BetterAuthPlugin,
    oauthDeviceAuthorization({
      verificationUri: AUTHORIZATION_SERVER_PAGES.device,
    }) as BetterAuthPlugin,
  ],
  disabledPaths: ['/token'],
});
