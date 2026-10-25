import { makeSignature } from 'better-auth/crypto';
import type { AuthWorkerConfig } from '../config.js';
import { authWorker } from '../service.js';

export const baseURL = 'https://auth.example.com';
export const origin = 'https://app.example.com';
export const secret = 'test-secret-test-secret-test-secret';

export const config = {
  url: baseURL,
  secret,
  google: { clientId: 'test', clientSecret: 'test' },
  cookieDomain: '.example.com',
  brand: { name: 'Example' },
} satisfies Omit<AuthWorkerConfig, 'database'>;

/** `make` for a test file, over a fresh Primary Database each time. The
 * test passes `memory` in, so this helper imports nothing but the worker. */
export const makeWith =
  (database: () => AuthWorkerConfig['database']) =>
  (overrides: Partial<AuthWorkerConfig> = {}) =>
    authWorker({ ...config, database: database(), ...overrides });

export type Worker = ReturnType<typeof authWorker>;

export const CHROME_MAC =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36';

/** Signs a User in the way a browser ends up after Google: a Session in the
 * Primary Database, its signed token as the session cookie, and the same
 * under the Account's own multi-session cookie. */
export const signIn = async (
  worker: Worker,
  email: string,
  userAgent = CHROME_MAC,
) => {
  const context = await worker.auth.$context;
  const user =
    (await context.internalAdapter.findUserByEmail(email))?.user ??
    (await context.internalAdapter.createUser(
      { name: email.split('@')[0]!, email, emailVerified: true },
      { method: 'email-password' },
    ));
  const session = await context.internalAdapter.createSession(user.id, false, {
    userAgent,
  });
  const value = encodeURIComponent(
    `${session.token}.${await makeSignature(session.token, secret)}`,
  );
  const name = context.authCookies.sessionToken.name;
  return {
    user,
    session,
    token: session.token,
    active: `${name}=${value}`,
    account: `${name}_multi-${session.token.toLowerCase()}=${value}`,
  };
};

export const cookies = (...parts: string[]) => parts.join('; ');

export const get = (
  worker: Worker,
  path: string,
  headers: Record<string, string> = {},
) => worker.handler(new Request(`${baseURL}/api/auth${path}`, { headers }));

export const post = (
  worker: Worker,
  path: string,
  body: unknown = {},
  headers: Record<string, string> = {},
) =>
  worker.handler(
    new Request(`${baseURL}/api/auth${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin, ...headers },
      body: JSON.stringify(body),
    }),
  );

/** A POST the way a program sends it: no Origin, no Sec-Fetch headers. */
export const postAsProgram = (
  worker: Worker,
  path: string,
  body: unknown = {},
  headers: Record<string, string> = {},
) =>
  worker.handler(
    new Request(`${baseURL}/api/auth${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  );

/** The headers of a call from the Auth Worker's own pages. */
export const fromPages = (cookie: string) => ({ cookie, origin: baseURL });

/** The browser's cookies after a response: each Set-Cookie replaces or
 * expires the cookie of its name. */
export const applyCookies = (cookie: string, response: Response) => {
  const jar = new Map(
    cookie
      .split('; ')
      .filter(Boolean)
      .map((part) => [part.slice(0, part.indexOf('=')), part] as const),
  );
  for (const set of response.headers.getSetCookie()) {
    const pair = set.split(';')[0]!;
    const name = pair.slice(0, pair.indexOf('='));
    if (/max-age=0/i.test(set) || pair.endsWith('=')) jar.delete(name);
    else jar.set(name, pair);
  }
  return [...jar.values()].join('; ');
};

export const whoIs = async (worker: Worker, cookie: string) =>
  (
    (await (await get(worker, '/get-session', { cookie })).json()) as {
      user: { email: string };
    } | null
  )?.user.email;
