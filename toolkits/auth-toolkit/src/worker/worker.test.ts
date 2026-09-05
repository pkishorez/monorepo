import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  authHandler: vi.fn(async () =>
    Promise.resolve(
      new Response('ok', { headers: { Vary: 'Accept-Encoding' } }),
    ),
  ),
  betterAuth: vi.fn(),
}));

vi.mock('better-auth', () => ({ betterAuth: mocks.betterAuth }));

import { createAuthWorker } from './worker.js';

const config = {
  baseURL: 'https://auth.example.com',
  secret: 'test-secret-test-secret-test-secret',
  database: {} as never,
  secondaryStorage: {
    get: async () => null,
    getAndDelete: async () => null,
    set: async () => undefined,
    delete: async () => undefined,
    increment: async () => 1,
  },
  google: { clientId: 'test', clientSecret: 'test' },
  trustedOrigins: ['https://app.example.com', '*.preview.example.com'],
};

describe('createAuthWorker', () => {
  beforeEach(() => {
    mocks.authHandler.mockClear();
    mocks.betterAuth.mockReset();
    mocks.betterAuth.mockReturnValue({ handler: mocks.authHandler });
  });

  it('answers trusted preflight requests without calling Better Auth', async () => {
    const { handler } = createAuthWorker(config);
    const response = await handler(
      new Request('https://auth.example.com/api/auth/get-session', {
        method: 'OPTIONS',
        headers: {
          Origin: 'https://app.example.com',
          'Access-Control-Request-Headers': 'content-type',
          'Access-Control-Request-Method': 'GET',
        },
      }),
    );

    expect(response.status).toBe(204);
    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://app.example.com',
    );
    expect(response.headers.get('Access-Control-Allow-Credentials')).toBe(
      'true',
    );
    expect(response.headers.get('Access-Control-Allow-Headers')).toBe(
      'content-type',
    );
    expect(mocks.authHandler).not.toHaveBeenCalled();
  });

  it('adds CORS headers to normal responses for wildcard origins', async () => {
    const { handler } = createAuthWorker(config);
    const response = await handler(
      new Request('https://auth.example.com/api/auth/get-session', {
        headers: { Origin: 'https://branch.preview.example.com' },
      }),
    );

    expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
      'https://branch.preview.example.com',
    );
    expect(response.headers.get('Vary')).toContain('Accept-Encoding');
    expect(response.headers.get('Vary')).toContain('Origin');
  });

  it('does not grant CORS access to untrusted origins', async () => {
    const { handler } = createAuthWorker(config);
    const response = await handler(
      new Request('https://auth.example.com/api/auth/get-session', {
        headers: { Origin: 'https://app.example.com.attacker.test' },
      }),
    );

    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
    expect(response.headers.get('Vary')).toContain('Origin');
  });

  it('does not match a scheme-less wildcard against a plaintext origin', async () => {
    const { handler } = createAuthWorker(config);
    const response = await handler(
      new Request('https://auth.example.com/api/auth/get-session', {
        headers: { Origin: 'http://branch.preview.example.com' },
      }),
    );

    expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
  });

  it('varies on Origin when rejecting an untrusted preflight', async () => {
    const { handler } = createAuthWorker(config);
    const response = await handler(
      new Request('https://auth.example.com/api/auth/get-session', {
        method: 'OPTIONS',
        headers: { Origin: 'https://attacker.test' },
      }),
    );

    expect(response.status).toBe(403);
    expect(response.headers.get('Vary')).toContain('Origin');
  });

  it('disables Better Auth rate limiting', () => {
    createAuthWorker(config);

    expect(mocks.betterAuth).toHaveBeenCalledWith(
      expect.objectContaining({ rateLimit: { enabled: false } }),
    );
  });

  it('always installs Admin and installs Dash only with a non-empty API key', () => {
    createAuthWorker(config);
    expect(
      mocks.betterAuth.mock.calls[0]?.[0].plugins.map(
        (plugin: { id: string }) => plugin.id,
      ),
    ).toEqual(['admin']);

    createAuthWorker({ ...config, dashApiKey: '  dash-key  ' });
    expect(
      mocks.betterAuth.mock.calls[1]?.[0].plugins.map(
        (plugin: { id: string }) => plugin.id,
      ),
    ).toEqual(['admin', 'dash']);
    expect(
      mocks.betterAuth.mock.calls[1]?.[0].plugins.find(
        (plugin: { id: string }) => plugin.id === 'dash',
      ).options.apiKey,
    ).toBe('dash-key');

    createAuthWorker({ ...config, dashApiKey: '   ' });
    expect(
      mocks.betterAuth.mock.calls[2]?.[0].plugins.map(
        (plugin: { id: string }) => plugin.id,
      ),
    ).toEqual(['admin']);
  });

  it('passes the optional User Admission Policy to Better Auth', () => {
    const validateUser = vi.fn();
    createAuthWorker({ ...config, validateUser });

    expect(mocks.betterAuth).toHaveBeenCalledWith(
      expect.objectContaining({
        user: expect.objectContaining({ validateUserInfo: validateUser }),
      }),
    );
  });

  it('throws on a scheme-less exact trustedOrigins pattern', () => {
    expect(() =>
      createAuthWorker({ ...config, trustedOrigins: ['app.example.com'] }),
    ).toThrow(/Invalid trustedOrigins pattern "app.example.com"/);
  });

  it('throws on a malformed wildcard trustedOrigins pattern', () => {
    expect(() =>
      createAuthWorker({
        ...config,
        trustedOrigins: ['https://*.example.com/path'],
      }),
    ).toThrow(/Invalid trustedOrigins pattern/);
  });
});
