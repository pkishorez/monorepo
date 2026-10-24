import { Effect } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifySignIn: vi.fn(),
  verifyAccessToken: vi.fn(),
}));

vi.mock('../session.js', () => ({ verifySignIn: mocks.verifySignIn }));
vi.mock('../access-token.js', () => ({
  verifyAccessToken: mocks.verifyAccessToken,
}));

import { resolver, type Target } from '../verification.js';

const url = 'https://auth.example.com';
const resource = 'https://api.example.com';
const jwt = 'eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJ1MSJ9.c2ln';
// better-auth's client hands the expiry over as JSON gives it.
const session = { id: 's1', expiresAt: '2030-01-01T00:00:00.000Z' };
const signIn = { id: 's1', expiresAt: new Date(session.expiresAt) };
const user = { id: 'u1', email: 'ada@example.com', name: 'Ada' };

const resolveWith = (target: Target, headers: Record<string, string>) =>
  Effect.runPromise(
    resolver(target)(new Request('https://api.example.com', { headers })),
  );

describe('resolver', () => {
  beforeEach(() => {
    mocks.verifySignIn.mockReset();
    mocks.verifyAccessToken.mockReset();
    mocks.verifySignIn.mockResolvedValue({
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

  it('resolves a Sign-in Principal from a cookie', async () => {
    expect(await resolveWith({ url }, { cookie: 'session=abc' })).toEqual({
      principal: { kind: 'session', session: signIn, user, test: false },
      refreshedCookies: ['a=1'],
    });
    expect(mocks.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('resolves a Token Principal for a Resource Server', async () => {
    const resolved = await resolveWith(
      { url, resource },
      { authorization: `Bearer ${jwt}`, cookie: 'session=abc' },
    );
    expect(resolved).toEqual({
      principal: {
        kind: 'token',
        user,
        client: { id: 'cli' },
        scopes: ['notes:read'],
        test: false,
      },
      refreshedCookies: [],
    });
    expect(mocks.verifyAccessToken).toHaveBeenCalledWith(url, resource, jwt);
    expect(mocks.verifySignIn).not.toHaveBeenCalled();
  });

  it('never falls back to the cookie when a token is presented', async () => {
    mocks.verifyAccessToken.mockResolvedValue(null);
    mocks.verifySignIn.mockResolvedValue(null);
    const resolved = await resolveWith(
      { url, resource },
      { authorization: `Bearer ${jwt}`, cookie: 'session=abc' },
    );
    expect(resolved).toBeNull();
    const [, request] = mocks.verifySignIn.mock.calls[0]!;
    expect(request.headers.get('authorization')).toBe(`Bearer ${jwt}`);
  });

  it('does not check Access Tokens without a resource', async () => {
    mocks.verifySignIn.mockResolvedValue(null);
    expect(
      await resolveWith({ url }, { authorization: `Bearer ${jwt}` }),
    ).toBeNull();
    expect(mocks.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('resolves a Sign-in Principal from a Device token, with or without a resource', async () => {
    mocks.verifySignIn.mockResolvedValue({
      session,
      user,
      refreshedCookies: [],
    });
    mocks.verifyAccessToken.mockResolvedValue(null);
    for (const target of [{ url }, { url, resource }]) {
      const resolved = await resolveWith(target, {
        authorization: 'Bearer opaque-session-token',
      });
      expect(resolved?.principal).toEqual({
        kind: 'session',
        session: signIn,
        user,
        test: false,
      });
    }
    expect(mocks.verifyAccessToken).toHaveBeenCalledOnce();
    expect(mocks.verifySignIn).toHaveBeenCalledTimes(2);
  });

  it('keeps only the Sign-in id and expiry, never its token', async () => {
    const expiresAt = new Date('2030-01-01T00:00:00.000Z');
    mocks.verifySignIn.mockResolvedValue({
      session: { id: 's1', token: 'secret', userId: 'u1', expiresAt },
      user: { ...user, image: null, emailVerified: true },
      refreshedCookies: [],
    });
    const resolved = await resolveWith({ url }, { cookie: 'session=abc' });
    expect(resolved?.principal).toStrictEqual({
      kind: 'session',
      session: { id: 's1', expiresAt },
      user,
      test: false,
    });
  });

  it('fails when the Auth Worker cannot be asked', async () => {
    mocks.verifySignIn.mockRejectedValue(new Error('down'));
    await expect(
      resolveWith({ url }, { cookie: 'session=abc' }),
    ).rejects.toThrow();
  });
});

describe('Test Users', () => {
  const tess = { id: 't1', email: 'Tess@Example.TEST', name: 'Tess' };

  beforeEach(() => {
    mocks.verifySignIn.mockReset();
    mocks.verifyAccessToken.mockReset();
    mocks.verifySignIn.mockResolvedValue({
      session,
      user: tess,
      refreshedCookies: [],
    });
    mocks.verifyAccessToken.mockResolvedValue({
      user: tess,
      client: { id: 'cli' },
      scopes: [],
    });
  });

  it('marks a Test User on every credential by their email', async () => {
    const cookie = await resolveWith({ url }, { cookie: 'session=abc' });
    expect(cookie?.principal).toMatchObject({ kind: 'session', test: true });

    mocks.verifyAccessToken.mockResolvedValueOnce(null);
    const device = await resolveWith(
      { url, resource },
      { authorization: 'Bearer opaque-session-token' },
    );
    expect(device?.principal).toMatchObject({ kind: 'session', test: true });

    const token = await resolveWith(
      { url, resource },
      { authorization: `Bearer ${jwt}` },
    );
    expect(token?.principal).toMatchObject({ kind: 'token', test: true });
  });
});
