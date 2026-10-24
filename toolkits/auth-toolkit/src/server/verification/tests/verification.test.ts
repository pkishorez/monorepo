import { Effect, Option } from 'effect';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifySignIn: vi.fn(),
  verifyAccessToken: vi.fn(),
}));

vi.mock('../session.js', () => ({ verifySignIn: mocks.verifySignIn }));
vi.mock('../access-token.js', () => ({
  verifyAccessToken: mocks.verifyAccessToken,
}));

import type { Principal } from '../../../guard/index.js';
import type { AuthOptions } from '../options.js';
import { admit, resolver, verify, type Resolution } from '../verification.js';

const url = 'https://auth.example.com';
const resource = 'https://api.example.com';
const jwt = 'eyJhbGciOiJFZERTQSJ9.eyJzdWIiOiJ1MSJ9.c2ln';
const session = { id: 's1' };
const user = { id: 'u1', email: 'ada@example.com', name: 'Ada' };

const resolveWith = (options: AuthOptions, headers: Record<string, string>) =>
  Effect.runPromise(
    resolver(options)(new Request('https://api.example.com', { headers })),
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
      principal: { kind: 'session', session, user, test: false },
      refreshedCookies: ['a=1'],
    });
    expect(mocks.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('resolves a Token Principal when the backend is a Resource Server', async () => {
    const resolved = await resolveWith(
      { url, oauth: { resource } },
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
      { url, oauth: { resource } },
      { authorization: `Bearer ${jwt}`, cookie: 'session=abc' },
    );
    expect(resolved).toBeNull();
    const [, request] = mocks.verifySignIn.mock.calls[0]!;
    expect(request.headers.get('authorization')).toBe(`Bearer ${jwt}`);
  });

  it('does not check Access Tokens without oauth', async () => {
    mocks.verifySignIn.mockResolvedValue(null);
    expect(
      await resolveWith({ url }, { authorization: `Bearer ${jwt}` }),
    ).toBeNull();
    expect(mocks.verifyAccessToken).not.toHaveBeenCalled();
  });

  it('resolves a Sign-in Principal from a Device token, with or without oauth', async () => {
    mocks.verifySignIn.mockResolvedValue({
      session,
      user,
      refreshedCookies: [],
    });
    mocks.verifyAccessToken.mockResolvedValue(null);
    for (const options of [{ url }, { url, oauth: { resource } }]) {
      const resolved = await resolveWith(options, {
        authorization: 'Bearer opaque-session-token',
      });
      expect(resolved?.principal).toEqual({
        kind: 'session',
        session,
        user,
        test: false,
      });
    }
    expect(mocks.verifyAccessToken).toHaveBeenCalledOnce();
    expect(mocks.verifySignIn).toHaveBeenCalledTimes(2);
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
      { url, oauth: { resource } },
      { authorization: 'Bearer opaque-session-token' },
    );
    expect(device?.principal).toMatchObject({ kind: 'session', test: true });

    const token = await resolveWith(
      { url, oauth: { resource } },
      { authorization: `Bearer ${jwt}` },
    );
    expect(token?.principal).toMatchObject({ kind: 'token', test: true });
  });

  it('is nobody to verify unless testUsers admits them', async () => {
    const request = new Request('https://api.example.com/ws', {
      headers: { cookie: 'session=abc' },
    });
    expect(await verify(request, { url })).toBeNull();
    expect(await verify(request, { url, testUsers: true })).toMatchObject({
      test: true,
    });
  });

  describe('admit', () => {
    const resolution = (test: boolean): Resolution => ({
      principal: {
        kind: 'session',
        session,
        user: tess,
        test,
      } as unknown as Principal,
      refreshedCookies: [],
    });
    const run = (resolved: Resolution, testUsers: boolean) =>
      Effect.runPromise(
        Effect.result(
          admit(
            resolved,
            new Request('https://api.example.com'),
            Option.none(),
            {},
            testUsers,
          ),
        ),
      );

    it('refuses a Test User Forbidden, unless testUsers', async () => {
      expect(await run(resolution(true), false)).toMatchObject({
        failure: { _tag: 'Forbidden', reason: 'Test Users are not accepted' },
      });
      expect(await run(resolution(true), true)).toMatchObject({
        success: { test: true },
      });
    });

    it('admits anyone else either way', async () => {
      for (const testUsers of [false, true]) {
        expect(await run(resolution(false), testUsers)).toMatchObject({
          success: { test: false },
        });
      }
    });
  });
});

describe('which options are refused', () => {
  it('refuses options without a url', async () => {
    expect(() => resolver({} as never)).toThrow(/url/);
    expect(() => resolver({ url: '  ' })).toThrow(/url/);
    await expect(
      verify(new Request('https://api.example.com'), {} as never),
    ).rejects.toThrow(/url/);
  });

  it('tells Local mode where it went, url or not', () => {
    for (const options of [{ local: true }, { url, local: true }]) {
      expect(() => resolver(options as never)).toThrow(
        /`local` was removed.*fakeGuard.*@kestack\/auth-toolkit\/fake/,
      );
    }
    expect(mocks.verifySignIn).not.toHaveBeenCalled();
  });
});

describe('verify', () => {
  beforeEach(() => {
    mocks.verifySignIn.mockReset();
  });

  it('resolves the Principal of a plain request', async () => {
    mocks.verifySignIn.mockResolvedValue({
      session,
      user,
      refreshedCookies: [],
    });
    expect(
      await verify(
        new Request('https://api.example.com/ws', {
          headers: { cookie: 'session=abc' },
        }),
        { url },
      ),
    ).toEqual({ kind: 'session', session, user, test: false });
  });

  it('resolves null for nobody and rejects when the Auth Worker is down', async () => {
    mocks.verifySignIn.mockResolvedValueOnce(null);
    const request = new Request('https://api.example.com/ws');
    expect(await verify(request, { url })).toBeNull();
    mocks.verifySignIn.mockRejectedValueOnce(new Error('down'));
    await expect(verify(request, { url })).rejects.toThrow('down');
  });
});
