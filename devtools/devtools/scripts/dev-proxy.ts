import type { IncomingHttpHeaders } from 'node:http';

/**
 * Whether the dev UI's proxy may pass a request on to the DevTools Server.
 * The proxy rewrites Origin to the server's own, so it asks the server's
 * question first: no Origin, as from the CLI, or the page's own origin,
 * here the dev UI that Vite serves at this request's Host.
 */
export const isTrustedOrigin = ({
  host,
  origin,
}: Pick<IncomingHttpHeaders, 'host' | 'origin'>) => {
  if (origin === undefined) return true;
  if (host === undefined || !URL.canParse(origin)) return false;
  return new URL(origin).host === host.toLowerCase();
};
