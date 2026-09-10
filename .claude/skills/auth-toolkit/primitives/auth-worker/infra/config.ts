// Two instances: production and local. Everything else derives from the host.

export const productionHost = '__PRODUCTION_HOST__';
export const localHost = '__LOCAL_HOST__';

/** Cookie Cache TTL in seconds. A cache miss reads D1. */
export const cookieCacheMaxAge = __COOKIE_CACHE_SECONDS__;

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
