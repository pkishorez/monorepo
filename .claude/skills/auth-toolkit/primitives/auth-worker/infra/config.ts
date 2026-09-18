import type { AuthorizationServerConfig, Branding } from 'auth-toolkit/worker';

// Two instances: production and local. Everything else derives from the host.

export const productionHost = '__PRODUCTION_HOST__';
export const localHost = '__LOCAL_HOST__';

/** Cookie Cache TTL in seconds. A cache miss reads D1. */
export const cookieCacheMaxAge = __COOKIE_CACHE_SECONDS__;

/** What the pages show: the application's name and, optionally, an absolute
 * URL to its logo. Without a logo the pages show the name alone. */
export const branding: Branding = {
  appName: '__APP_TITLE__',
};

/** The Authorization Server Role: which Resource Servers Access Tokens may be
 * minted for. Set to `undefined` to run the Identity Role only. */
export const authorizationServer: AuthorizationServerConfig | undefined = {
  // Each Resource Server's audience URL, e.g. 'https://api.example.com'.
  resources: [],
  // Scopes beyond OpenID's, shown on the consent page.
  scopes: [],
};

export const isProdStage = (stage: string): boolean => stage === 'prod';

export const hostFor = (stage: string): string =>
  isProdStage(stage) ? productionHost : localHost;

/** The Shared Cookie Domain is the host minus its first label, and every
 * origin under it is trusted. Sessions never cross that domain. */
export const authConfigFor = (host: string) => {
  const cookieDomain = host.slice(host.indexOf('.'));
  return {
    baseURL: `https://${host}`,
    cookieDomain,
    trustedOrigins: [`https://*${cookieDomain}`],
  };
};
