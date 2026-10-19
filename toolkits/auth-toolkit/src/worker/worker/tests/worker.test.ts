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

import type { PagesContext } from '../pages.js';
import { authWorker, makeAuthWorker } from '../worker.js';

const config = {
  url: 'https://auth.example.com',
  secret: 'test-secret-test-secret-test-secret',
  database: {} as never,
  google: { clientId: 'test', clientSecret: 'test' },
  cookieDomain: '.example.com',
  brand: { name: 'Example' },
};

const options = (call = 0) => mocks.betterAuth.mock.calls[call]?.[0];
const pluginIds = (call = 0) =>
  options(call).plugins.map((plugin: { id: string }) => plugin.id);

const fromOrigin = (origin: string, init: RequestInit = {}) =>
  new Request('https://auth.example.com/api/auth/get-session', {
    ...init,
    headers: { Origin: origin, ...init.headers },
  });

describe('authWorker', () => {
  beforeEach(() => {
    mocks.authHandler.mockClear();
    mocks.betterAuth.mockReset();
    mocks.betterAuth.mockReturnValue({ handler: mocks.authHandler });
  });

  describe('trust under the Shared Cookie Domain', () => {
    it('answers a preflight from any origin under it without better-auth', async () => {
      const { handler } = authWorker(config);
      const response = await handler(
        fromOrigin('https://deep.preview.example.com', {
          method: 'OPTIONS',
          headers: {
            'Access-Control-Request-Headers': 'content-type',
            'Access-Control-Request-Method': 'GET',
          },
        }),
      );
      expect(response.status).toBe(204);
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
        'https://deep.preview.example.com',
      );
      expect(response.headers.get('Access-Control-Allow-Credentials')).toBe(
        'true',
      );
      expect(response.headers.get('Access-Control-Allow-Headers')).toBe(
        'content-type',
      );
      expect(mocks.authHandler).not.toHaveBeenCalled();
    });

    it('trusts the bare domain and keeps Vary on normal responses', async () => {
      const { handler } = authWorker(config);
      const response = await handler(fromOrigin('https://example.com'));
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
        'https://example.com',
      );
      expect(response.headers.get('Vary')).toContain('Accept-Encoding');
      expect(response.headers.get('Vary')).toContain('Origin');
    });

    it.each([
      'https://app.example.com.attacker.test',
      'https://notexample.com',
      'http://app.example.com',
      'null',
    ])('does not trust %s', async (origin) => {
      const { handler } = authWorker(config);
      const response = await handler(fromOrigin(origin));
      expect(response.headers.has('Access-Control-Allow-Origin')).toBe(false);
      expect(response.headers.get('Vary')).toContain('Origin');
      const preflight = await handler(
        fromOrigin(origin, { method: 'OPTIONS' }),
      );
      expect(preflight.status).toBe(403);
    });

    it('trusts plaintext origins only when the worker itself is plaintext', async () => {
      const { handler } = authWorker({
        ...config,
        url: 'http://auth.localhost:8787',
        cookieDomain: 'localhost',
      });
      const response = await handler(
        new Request('http://auth.localhost:8787/api/auth/get-session', {
          headers: { Origin: 'http://app.localhost:3000' },
        }),
      );
      expect(response.headers.get('Access-Control-Allow-Origin')).toBe(
        'http://app.localhost:3000',
      );
    });

    it('hands better-auth the same rule and a cross-subdomain cookie', () => {
      authWorker(config);
      expect(options().trustedOrigins).toEqual([
        'https://auth.example.com',
        'https://example.com',
        'https://*.example.com',
      ]);
      expect(options().advanced.crossSubDomainCookies).toEqual({
        enabled: true,
        domain: 'example.com',
      });
    });
  });

  it('disables rate limiting and fixes the Cookie Cache at five minutes', () => {
    authWorker(config);
    expect(options().rateLimit).toEqual({ enabled: false });
    expect(options().session.cookieCache).toEqual({
      enabled: true,
      maxAge: 300,
    });
  });

  it('uses only the Primary Database for persisted auth state', () => {
    authWorker(config);
    expect(options().database).toBe(config.database);
    expect(options()).not.toHaveProperty('secondaryStorage');
    expect(options().session.storeSessionInDatabase).toBe(true);
    expect(options().verification.storeInDatabase).toBe(true);
  });

  it('always installs Admin, Bearer, Device Login, and multi-session; Dash only with a key', () => {
    authWorker(config);
    expect(pluginIds(0)).toEqual([
      'admin',
      'bearer',
      'device-authorization',
      'multi-session',
    ]);
    authWorker({ ...config, dashApiKey: '  dash-key  ' });
    expect(pluginIds(1)).toEqual([
      'admin',
      'bearer',
      'device-authorization',
      'multi-session',
      'dash',
    ]);
    expect(
      options(1).plugins.find((plugin: { id: string }) => plugin.id === 'dash')
        .options.apiKey,
    ).toBe('dash-key');
    authWorker({ ...config, dashApiKey: '   ' });
    expect(pluginIds(2)).not.toContain('dash');
  });

  it('turns the Authorization Server Role on with self-registration only', () => {
    authWorker({
      ...config,
      oauth: {
        resources: {
          'https://mcp.example.com': { 'notes:read': 'Read notes' },
        },
      },
    });
    expect(pluginIds()).toEqual(
      expect.arrayContaining(['jwt', 'oauth-provider', 'cimd']),
    );
    const provider = options().plugins.find(
      (plugin: { id: string }) => plugin.id === 'oauth-provider',
    );
    expect(provider.options).toMatchObject({
      allowDynamicClientRegistration: true,
      allowUnauthenticatedClientRegistration: true,
      resources: ['https://mcp.example.com'],
    });
    expect(provider.options.scopes).toContain('notes:read');
    expect(provider.options.scopes).toContain('openid');
  });

  it.each([
    [undefined, 5],
    [3, 3],
  ] as const)(
    'uses one Account limit for the plugin and the pages (%s)',
    async (maxAccounts, expected) => {
      const { handler } = makeAuthWorker(
        { ...config, maxAccounts },
        {
          assets: {},
          fetch: async (_request: Request, context: PagesContext) =>
            Response.json(context),
        },
      );
      const plugin = options().plugins.find(
        (plugin: { id: string }) => plugin.id === 'multi-session',
      );
      expect(plugin.options.maximumSessions).toBe(expected);
      const page = await handler(new Request('https://auth.example.com/login'));
      expect(await page.json()).toEqual({
        brand: { name: 'Example' },
        maxAccounts: expected,
        cookieDomain: 'example.com',
        origin: 'https://auth.example.com',
        // Functions, read in-process; JSON drops them.
        reads: {},
      });
    },
  );

  it.each([
    ['theme=dark', 'dark'],
    ['other=1; theme=light', 'light'],
    ['theme=sepia', undefined],
    ['theme=system', undefined],
  ] as const)(
    'hands the pages the Theme from the cookie (%s)',
    async (cookie, theme) => {
      const { handler } = makeAuthWorker(config, {
        assets: {},
        fetch: async (_request: Request, context: PagesContext) =>
          Response.json(context),
      });
      const page = await handler(
        new Request('https://auth.example.com/', { headers: { cookie } }),
      );
      expect(((await page.json()) as { theme?: string }).theme).toBe(theme);
    },
  );

  it('gives the pages every Scope in words, OpenID included', async () => {
    const { handler } = makeAuthWorker(
      {
        ...config,
        oauth: {
          resources: {
            'https://mcp.example.com': { 'notes:read': 'Read your notes' },
            'https://api.example.com': { 'notes:read': 'Read your notes' },
          },
        },
      },
      {
        assets: {},
        fetch: async (_request: Request, context: PagesContext) =>
          Response.json(context.oauth),
      },
    );
    const page = await handler(new Request('https://auth.example.com/consent'));
    const { scopes } = (await page.json()) as {
      scopes: Record<string, string>;
    };
    expect(scopes['notes:read']).toBe('Read your notes');
    expect(scopes.openid).toBeTruthy();
  });

  describe('the User Admission Policy', () => {
    const validate = () => options().user.validateUserInfo;

    it('admits on true and refuses on false', async () => {
      const admit = vi.fn(({ email }: { email: string }) =>
        email.endsWith('@example.com'),
      );
      authWorker({ ...config, admit });
      expect(
        await validate()({ user: { email: 'ada@example.com', name: 'Ada' } }),
      ).toBeUndefined();
      expect(admit).toHaveBeenCalledWith({
        email: 'ada@example.com',
        name: 'Ada',
      });
      expect(
        await validate()({ user: { email: 'eve@evil.test', name: 'Eve' } }),
      ).toMatchObject({ error: 'not_admitted' });
    });

    it('is absent unless configured', () => {
      authWorker(config);
      expect(options().user).toBeUndefined();
    });
  });

  describe('config validation', () => {
    it.each([
      [{ cookieDomain: '' }, /cookieDomain/],
      [{ cookieDomain: 'https://example.com' }, /cookieDomain/],
      [{ cookieDomain: '.other.com' }, /not under cookieDomain/],
      [{ url: 'auth.example.com' }, /url must be an absolute URL/],
      [{ brand: { name: ' ' } }, /brand.name/],
      [{ maxAccounts: 0 }, /maxAccounts/],
      [{ maxAccounts: 1.5 }, /maxAccounts/],
      [{ oauth: { resources: { 'not a url': {} } } }, /absolute URL/],
      [
        { oauth: { resources: { 'https://a.example.com': { 'a b': 'x' } } } },
        /valid scope name/,
      ],
      [
        {
          oauth: {
            resources: {
              'https://a.example.com': { read: 'Read notes' },
              'https://b.example.com': { read: 'Read photos' },
            },
          },
        },
        /two different descriptions/,
      ],
    ])('refuses %j', (overrides, message) => {
      expect(() => authWorker({ ...config, ...overrides })).toThrow(message);
    });
  });
});
