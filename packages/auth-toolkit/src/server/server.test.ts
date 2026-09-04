import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  getSession: vi.fn(),
  createAuthClient: vi.fn(),
}));

vi.mock('better-auth/client', () => ({
  createAuthClient: mocks.createAuthClient,
}));

import { verifyRequest } from './server.js';

describe('verifyRequest', () => {
  beforeEach(() => {
    mocks.getSession.mockReset();
    mocks.createAuthClient.mockReset();
    mocks.createAuthClient.mockReturnValue({ getSession: mocks.getSession });
    mocks.getSession.mockResolvedValue({
      data: { session: { id: 's1' }, user: { id: 'u1' } },
    });
  });

  it('forwards the cookie and x-forwarded-* headers to the Auth Worker', async () => {
    const request = new Request('https://api.example.com/whoami', {
      headers: {
        cookie: 'session=abc',
        'x-forwarded-for': '203.0.113.1',
        'x-forwarded-proto': 'https',
        'x-not-forwarded': 'should-be-dropped',
      },
    });

    await verifyRequest({ authWorkerUrl: 'https://auth.example.com', request });

    const [{ fetchOptions }] = mocks.getSession.mock.calls[0]!;
    expect(fetchOptions.headers).toEqual({
      cookie: 'session=abc',
      'x-forwarded-for': '203.0.113.1',
      'x-forwarded-proto': 'https',
    });
  });

  it('returns refreshed cookies as separate Set-Cookie values', async () => {
    mocks.getSession.mockImplementationOnce(({ fetchOptions }) => {
      const headers = new Headers();
      headers.append('set-cookie', 'session=refreshed; Path=/; HttpOnly');
      headers.append('set-cookie', 'session_cache=chunk; Path=/; HttpOnly');
      fetchOptions.onSuccess({ response: new Response(null, { headers }) });

      return Promise.resolve({
        data: { session: { id: 's1' }, user: { id: 'u1' } },
      });
    });

    const verified = await verifyRequest({
      authWorkerUrl: 'https://auth.example.com',
      request: new Request('https://api.example.com/whoami', {
        headers: { cookie: 'session=abc' },
      }),
    });

    expect(verified?.refreshedCookies).toEqual([
      'session=refreshed; Path=/; HttpOnly',
      'session_cache=chunk; Path=/; HttpOnly',
    ]);
  });
});
