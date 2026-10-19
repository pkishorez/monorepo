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

import { localToken, localUser } from '../../../contract/index.js';
import type { AuthOptions } from '../options.js';
import { resolver, verify } from '../verification.js';

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
      principal: { kind: 'session', session, user },
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
      expect(resolved?.principal).toEqual({ kind: 'session', session, user });
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

describe('Local mode', () => {
  const ada = localUser({ email: 'ada@demo', name: 'Ada' });
  const token = localToken.make(ada);

  it('resolves the User a Local Token names, asking no one', async () => {
    const resolved = await resolveWith(
      { local: true },
      { authorization: `Bearer ${token}` },
    );
    expect(resolved).toMatchObject({
      principal: {
        kind: 'session',
        user: ada,
        session: { token, userId: ada.id },
      },
      refreshedCookies: [],
    });
    expect(mocks.verifySignIn).not.toHaveBeenCalled();
  });

  it('is unauthenticated without a Local Token', async () => {
    expect(await resolveWith({ local: true }, {})).toBeNull();
    expect(
      await resolveWith({ local: true }, { cookie: `session=${token}` }),
    ).toBeNull();
    expect(
      await resolveWith(
        { local: true },
        { authorization: 'Bearer real-session-token' },
      ),
    ).toBeNull();
  });
});

describe('which mode the options name', () => {
  const ada = localUser({ email: 'ada@demo', name: 'Ada' });
  const token = localToken.make(ada);

  it('is not Local mode for `local: false`', () => {
    expect(() => resolver({ local: false } as never)).toThrow(/local/);
  });

  it('refuses options naming both a url and Local mode', async () => {
    for (const local of [true, false]) {
      const options = { url, local } as never;
      expect(() => resolver(options)).toThrow(/not both/);
      await expect(
        verify(
          new Request('https://api.example.com', {
            headers: { authorization: `Bearer ${token}` },
          }),
          options,
        ),
      ).rejects.toThrow(/not both/);
    }
    expect(mocks.verifySignIn).not.toHaveBeenCalled();
  });

  it('refuses options naming neither', () => {
    expect(() => resolver({} as never)).toThrow(/url/);
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
    ).toEqual({ kind: 'session', session, user });
  });

  it('resolves null for nobody and rejects when the Auth Worker is down', async () => {
    mocks.verifySignIn.mockResolvedValueOnce(null);
    const request = new Request('https://api.example.com/ws');
    expect(await verify(request, { url })).toBeNull();
    mocks.verifySignIn.mockRejectedValueOnce(new Error('down'));
    await expect(verify(request, { url })).rejects.toThrow('down');
  });
});
