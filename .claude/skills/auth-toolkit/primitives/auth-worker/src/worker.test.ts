import { memoryPrimaryDatabase } from 'auth-toolkit/database/memory';
import { createAuthWorker } from 'auth-toolkit/worker';
import { describe, expect, it } from 'vitest';
import {
  authConfigFor,
  cookieCacheMaxAge,
  localHost,
  productionHost,
} from '../infra/config.ts';

// The real configuration on the in-memory Provider: a bad host fails here
// instead of at the first deploy.
const workerFor = (host: string) =>
  createAuthWorker({
    ...authConfigFor(host),
    secret: 'test-secret-test-secret-test-secret',
    database: memoryPrimaryDatabase(),
    google: { clientId: 'test', clientSecret: 'test' },
    cookieCacheMaxAge,
  }).handler;

describe.each([productionHost, localHost])('auth worker at %s', (host) => {
  const handler = workerFor(host);
  const { cookieDomain } = authConfigFor(host);
  const origin = `https://app${cookieDomain}`;

  it('answers a preflight from an origin under the cookie domain', async () => {
    const response = await handler(
      new Request(`https://${host}/api/auth/get-session`, {
        method: 'OPTIONS',
        headers: { Origin: origin, 'Access-Control-Request-Method': 'GET' },
      }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(origin);
  });

  it('rejects a preflight from another site', async () => {
    const response = await handler(
      new Request(`https://${host}/api/auth/get-session`, {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://evil.invalid',
          'Access-Control-Request-Method': 'GET',
        },
      }),
    );
    expect(response.status).toBe(403);
  });

  it('serves the Better Auth health route', async () => {
    const response = await handler(new Request(`https://${host}/api/auth/ok`));
    expect(response.status).toBe(200);
  });
});
