import { describe, expect, it } from 'vitest';
import type { Principal } from '@kestack/auth-toolkit';
import { fakeGuard } from '@kestack/auth-toolkit/fake';
import { OWNER } from '../access/index.ts';
import { serve } from './worker.server.ts';

/*
 * The RPC Worker answered in-process, with `fakeGuard.rpc({ as })` saying who calls:
 * the public call for anyone, the authenticated one for any signed-in User,
 * the authorized one for the owner alone, and CORS with credentials for the
 * site's origin alone.
 */

const SITE = 'https://start.test';

/** A signed-in User, as the Auth Worker would give one: only what the handler reads. */
const ada = {
  kind: 'session',
  user: { id: 'u1', name: 'Ada', email: 'ada@demo.test' },
  session: { id: 's1' },
  test: true,
} as unknown as Principal;

/** The owner, signed in. */
const owner = {
  kind: 'session',
  user: { id: 'u2', name: 'Kishore', email: OWNER },
  session: { id: 's2' },
  test: false,
} as unknown as Principal;

type Tag = 'Public' | 'Authenticated' | 'Authorized';

/** One call as the RPC client writes it: an NDJSON Request frame. */
const frame = (tag: Tag) =>
  JSON.stringify({
    _tag: 'Request',
    id: 0,
    tag,
    payload: null,
    traceId: '0'.repeat(32),
    spanId: '0'.repeat(16),
    sampled: true,
    headers: [],
  });

const call = async (tag: Tag, caller: Principal | null, origin = SITE) => {
  const response = await serve(
    fakeGuard.rpc({ as: caller }),
    SITE,
  )(
    new Request('https://rpc.test/', {
      method: 'POST',
      headers: { 'content-type': 'application/ndjson', origin },
      body: `${frame(tag)}\n`,
    }),
  );
  return { response, body: await response.text() };
};

describe('the RPC Worker', () => {
  it('answers the public call for anyone', async () => {
    const { body } = await call('Public', null);
    expect(body).toContain('Hello, whoever you are, from the RPC Worker');
  });

  it('refuses the guarded calls with no Account', async () => {
    for (const tag of ['Authenticated', 'Authorized'] as const) {
      const { body } = await call(tag, null);
      expect(body).toContain('"error":{"_tag":"Unauthenticated"');
    }
  });

  it('answers the authenticated call for any signed-in User, letting the site read it', async () => {
    const { response, body } = await call('Authenticated', ada);
    expect(body).toContain('Hello Ada, signed in, from the RPC Worker');
    expect(response.headers.get('access-control-allow-origin')).toBe(SITE);
    expect(response.headers.get('access-control-allow-credentials')).toBe(
      'true',
    );
  });

  it('refuses the authorized call to anyone but the owner, and answers the owner', async () => {
    const refused = await call('Authorized', ada);
    expect(refused.body).toContain('"_tag":"Forbidden"');
    const { body } = await call('Authorized', owner);
    expect(body).toContain('Hello Kishore, the owner, from the RPC Worker');
  });

  it('lets no other origin read it', async () => {
    const { response } = await call(
      'Authenticated',
      ada,
      'https://elsewhere.test',
    );
    expect(response.headers.get('access-control-allow-origin')).toBeNull();
  });

  it("answers the site's preflight", async () => {
    const response = await serve(
      fakeGuard.rpc({ as: null }),
      SITE,
    )(
      new Request('https://rpc.test/', {
        method: 'OPTIONS',
        headers: {
          origin: SITE,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type, traceparent',
        },
      }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get('access-control-allow-headers')).toBe(
      'content-type, traceparent',
    );
  });
});
