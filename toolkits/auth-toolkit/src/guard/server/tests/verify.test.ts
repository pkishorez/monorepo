import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  verifySignIn: vi.fn(),
  verifyAccessToken: vi.fn(),
}));

vi.mock('../verification/session.js', () => ({
  verifySignIn: mocks.verifySignIn,
}));
vi.mock('../verification/access-token.js', () => ({
  verifyAccessToken: mocks.verifyAccessToken,
}));

import { verify } from '../index.js';

const url = 'https://auth.example.com';
// better-auth's client hands the expiry over as JSON gives it.
const session = { id: 's1', expiresAt: '2030-01-01T00:00:00.000Z' };
const signIn = { id: 's1', expiresAt: new Date(session.expiresAt) };
const user = { id: 'u1', email: 'ada@example.com', name: 'Ada' };

describe('verify', () => {
  beforeEach(() => {
    mocks.verifySignIn.mockReset();
  });

  it('needs a url', async () => {
    for (const options of [{}, { url: '  ' }]) {
      await expect(
        verify(new Request('https://api.example.com'), options as never),
      ).rejects.toThrow(/url/);
    }
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
    ).toEqual({ kind: 'session', session: signIn, user });
  });

  it('resolves null for nobody and rejects when the Auth Worker is down', async () => {
    mocks.verifySignIn.mockResolvedValueOnce(null);
    const request = new Request('https://api.example.com/ws');
    expect(await verify(request, { url })).toBeNull();
    mocks.verifySignIn.mockRejectedValueOnce(new Error('down'));
    await expect(verify(request, { url })).rejects.toThrow('down');
  });
});
