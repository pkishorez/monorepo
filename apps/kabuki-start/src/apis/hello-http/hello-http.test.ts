import { describe, expect, it } from 'vitest';
import type { Principal } from '@kestack/auth-toolkit';
import { testAuth } from '@kestack/auth-toolkit/server/http';
import { OWNER } from '../access/index.ts';
import { serve } from './worker.server.ts';

/*
 * The HTTP Worker answered in-process, with `testAuth` saying who calls:
 * `/public` for anyone, `/authenticated` for any signed-in User (401
 * otherwise), `/authorized` for the owner alone (403 for anyone else), and
 * the site's preflight allowed with credentials.
 */

const SITE = 'https://start.test';

/** A signed-in User, as the Auth Worker would give one: only what the handler reads. */
const ada = {
  kind: 'session',
  user: { id: 'u1', name: 'Ada', email: 'ada@demo.test' },
  session: { id: 's1' },
} as unknown as Principal;

/** The owner, signed in. */
const owner = {
  kind: 'session',
  user: { id: 'u2', name: 'Kishore', email: OWNER },
  session: { id: 's2' },
} as unknown as Principal;

const get = (path: string, caller: Principal | null) =>
  serve(
    testAuth(caller),
    SITE,
  )(new Request(`https://http.test${path}`, { headers: { origin: SITE } }));

describe('the HTTP Worker', () => {
  it('answers /public for anyone', async () => {
    const response = await get('/public', null);
    expect(response.status).toBe(200);
    expect(await response.json()).toBe(
      'Hello, whoever you are, from the HTTP Worker',
    );
  });

  it('refuses the guarded endpoints with no Account: 401', async () => {
    for (const path of ['/authenticated', '/authorized']) {
      const response = await get(path, null);
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ _tag: 'Unauthenticated' });
    }
  });

  it('answers /authenticated for any signed-in User, letting the site read it', async () => {
    const response = await get('/authenticated', ada);
    expect(response.status).toBe(200);
    expect(await response.json()).toBe(
      'Hello Ada, signed in, from the HTTP Worker',
    );
    expect(response.headers.get('access-control-allow-origin')).toBe(SITE);
    expect(response.headers.get('access-control-allow-credentials')).toBe(
      'true',
    );
  });

  it('refuses /authorized to anyone but the owner, 403, and answers the owner', async () => {
    const refused = await get('/authorized', ada);
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ _tag: 'Forbidden' });
    const answered = await get('/authorized', owner);
    expect(answered.status).toBe(200);
    expect(await answered.json()).toBe(
      'Hello Kishore, the owner, from the HTTP Worker',
    );
  });

  it("answers the site's preflight", async () => {
    const response = await serve(
      testAuth(null),
      SITE,
    )(
      new Request('https://http.test/authenticated', {
        method: 'OPTIONS',
        headers: {
          origin: SITE,
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'expect-user',
        },
      }),
    );
    expect(response.status).toBeLessThan(300);
    expect(response.headers.get('access-control-allow-origin')).toBe(SITE);
    expect(response.headers.get('access-control-allow-headers')).toContain(
      'expect-user',
    );
  });
});
