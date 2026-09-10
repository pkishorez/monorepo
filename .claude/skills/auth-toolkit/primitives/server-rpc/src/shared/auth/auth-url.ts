const productionAuthUrl = 'https://__PRODUCTION_AUTH_HOST__';
const localAuthUrl = 'https://__LOCAL_AUTH_HOST__';

/** Local dev uses the local Auth Worker; every deployed stage uses production.
 * Decided by the app's own hostname, so no env plumbing is needed. */
export const authUrlFor = (hostname: string): string =>
  hostname.endsWith('.computer') || hostname === 'localhost'
    ? localAuthUrl
    : productionAuthUrl;
