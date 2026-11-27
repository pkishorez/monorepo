import { CONNECT_PATH } from '../../../rpc/contract/index.ts';

export interface Dialed {
  readonly name: string;
  readonly url: string;
  readonly app: string;
  readonly environment: string;
}

export const DEFAULT_ENVIRONMENT = 'default';

export const dialUrl = (server: string, dialed: Dialed): string => {
  const base = URL.canParse(server)
    ? new URL(server)
    : new URL(server, dialed.url);
  const url = new URL(base.pathname.replace(/\/$/, '') + CONNECT_PATH, base);
  if (url.protocol === 'http:') url.protocol = 'ws:';
  if (url.protocol === 'https:') url.protocol = 'wss:';
  url.searchParams.set('name', dialed.name);
  url.searchParams.set('url', dialed.url);
  url.searchParams.set('app', dialed.app);
  url.searchParams.set('environment', dialed.environment);
  return url.toString();
};

export const dialedOf = (requested: string): Dialed => {
  const query = new URL(requested, 'http://devtools').searchParams;
  const app = query.get('app') ?? '';
  return {
    app,
    url: query.get('url') ?? '',
    name: query.get('name') || app || 'kabuki',
    environment: query.get('environment') || DEFAULT_ENVIRONMENT,
  };
};
