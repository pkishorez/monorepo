import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifyRequest: vi.fn(),
  verifyAccessToken: vi.fn(),
}));

vi.mock('../../verification/session/index.js', () => ({
  verifyRequest: mocks.verifyRequest,
}));
vi.mock('../../verification/access-token/index.js', () => ({
  verifyAccessToken: mocks.verifyAccessToken,
}));

import { auth } from '../current-auth.js';
import { resolverLive } from '../resolver.js';

const authWorkerUrl = 'https://auth.example.com';
const session = { id: 's1' };
const user = { id: 'u1', email: 'ada@example.com', name: 'Ada' };

const resolveWith = (
  config: Parameters<typeof resolverLive>[0],
  headers: Record<string, string>,
) =>
  Effect.runPromise(
    Effect.flatMap(auth.Resolver, (resolver) =>
      resolver.resolve(new Request('https://api.example.com', { headers })),
    ).pipe(Effect.provide(resolverLive(config))),
  );

describe('resolverLive', () => {
  beforeEach(() => {
    mocks.verifyRequest.mockReset();
    mocks.verifyAccessToken.mockReset();
    mocks.verifyRequest.mockResolvedValue({
      session,
      user,
      refreshedCookies: ['a=1'],
    });
    mocks.verifyAccessToken.mockResolvedValue({
      user,
      client: { id: 'cli' },
      scopes: ['notes:read'],
    });
  });

  it('resolves a Session Principal from a cookie', async () => {
    const resolved = await resolveWith(
      { authWorkerUrl },
      { cookie: 'session=abc' },
    );
    expect(resolved).toEqual({
      currentAuth: { kind: 'session', session, user },
      refreshedCookies: ['a=1'],
    });
    expect(mocks.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('resolves a Token Principal when the backend is a Resource Server', async () => {
    const resolved = await resolveWith(
      { authWorkerUrl, resource: 'https://api.example.com' },
      { authorization: 'Bearer t', cookie: 'session=abc' },
    );
    expect(resolved).toEqual({
      currentAuth: {
        kind: 'token',
        user,
        client: { id: 'cli' },
        scopes: ['notes:read'],
      },
      refreshedCookies: [],
    });
    expect(mocks.verifyRequest).not.toHaveBeenCalled();
  });

  it('never falls back to the cookie when a token is presented', async () => {
    mocks.verifyAccessToken.mockResolvedValue(null);
    const resolved = await resolveWith(
      { authWorkerUrl, resource: 'https://api.example.com' },
      { authorization: 'Bearer bad', cookie: 'session=abc' },
    );
    expect(resolved).toBeNull();
    expect(mocks.verifyRequest).not.toHaveBeenCalled();
  });

  it('rejects a token when no resource is configured', async () => {
    const resolved = await resolveWith(
      { authWorkerUrl },
      { authorization: 'Bearer t' },
    );
    expect(resolved).toBeNull();
    expect(mocks.verifyAccessToken).not.toHaveBeenCalled();
  });
});
