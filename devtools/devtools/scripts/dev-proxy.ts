import type { IncomingHttpHeaders } from 'node:http';

export const isTrustedOrigin = ({
  host,
  origin,
}: Pick<IncomingHttpHeaders, 'host' | 'origin'>) => {
  if (origin === undefined) return true;
  if (host === undefined || !URL.canParse(origin)) return false;
  return new URL(origin).host === host.toLowerCase();
};
