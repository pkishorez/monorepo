import type { AuthOptions } from '@kestack/auth-toolkit/server/rpc';
import { LOCAL_SESSION_COOKIE } from '../../../shared/contracts/local-session/index.ts';

/*
 * How the Worker asks who a request is from. A deployed build asks the Auth
 * Worker its URL names, about the Auth Worker's own cookie. A Local mode
 * build, `CONSOLE_AUTH_URL` empty, asks nobody: the browser keeps its Active
 * Local Account's token in a cookie of its own, read here as the bearer a
 * Local mode server verifies.
 */

const authUrl = import.meta.env.VITE_CONSOLE_AUTH_URL ?? '';

export const authOptions: AuthOptions =
  authUrl === '' ? { local: true } : { url: authUrl };

const cookieValue = (header: string | null, name: string) => {
  for (const pair of (header ?? '').split(';')) {
    const at = pair.indexOf('=');
    if (at > 0 && pair.slice(0, at).trim() === name)
      return decodeURIComponent(pair.slice(at + 1).trim());
  }
  return null;
};

/** `request` as the verifier reads it: in Local mode, its Local Token as the bearer. */
export const asVerified = (request: Request): Request => {
  if (authOptions.local !== true) return request;
  const token = cookieValue(
    request.headers.get('cookie'),
    LOCAL_SESSION_COOKIE,
  );
  return new Request(request.url, {
    headers: token === null ? {} : { authorization: `Bearer ${token}` },
  });
};
