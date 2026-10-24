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

  it('installs Test Sign-In only with testUsers', () => {
    authWorker(config);
    expect(pluginIds(0)).not.toContain('test-sign-in');
    authWorker({ ...config, testUsers: {} });
    expect(pluginIds(1)).toContain('test-sign-in');
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

    const google = { method: 'oauth', oauth: { providerId: 'google' } };

    it('admits on true and refuses on false', async () => {
      const admit = vi.fn(({ email }: { email: string }) =>
        email.endsWith('@example.com'),
      );
      authWorker({ ...config, admit });
      expect(
        await validate()({
          user: { email: 'ada@example.com', name: 'Ada' },
          source: google,
        }),
      ).toBeUndefined();
      expect(admit).toHaveBeenCalledWith({
        email: 'ada@example.com',
        name: 'Ada',
      });
      expect(
        await validate()({
          user: { email: 'eve@evil.com', name: 'Eve' },
          source: google,
        }),
      ).toMatchObject({ error: 'not_admitted' });
    });

    it('is absent unless configured', () => {
      authWorker(config);
      expect(options().user).toBeUndefined();
    });

    it('refuses a .test email from Google, with admit', async () => {
      authWorker({ ...config, admit: () => true });
      expect(
        await validate()({
          user: { email: 'eve@example.TEST', name: 'Eve' },
          source: google,
        }),
      ).toMatchObject({ error: 'not_admitted' });
    });

    it.each([{}, { admit: () => true }])(
      'creates a Test User only through Test Sign-In, with %j',
      async (overrides) => {
        authWorker({ ...config, ...overrides });
        const create = options().databaseHooks.user.create.before;
        const eve = { email: 'eve@example.test', name: 'Eve' };
        await expect(
          create(eve, { path: '/callback/google' }),
        ).rejects.toMatchObject({ body: { code: 'not_admitted' } });
        await expect(create(eve, null)).rejects.toBeDefined();
        await expect(
          create(eve, { path: '/test/sign-in' }),
        ).resolves.toBeUndefined();
        await expect(
          create({ email: 'ada@example.com', name: 'Ada' }, null),
        ).resolves.toBeUndefined();
      },
    );

    it('leaves Test Sign-In’s Test Users to it, without asking admit', async () => {
      const admit = vi.fn(() => false);
      authWorker({ ...config, admit, testUsers: {} });
      expect(
        await validate()({
          user: { email: 'ada@example.test', name: 'ada' },
          source: { method: 'test-sign-in' },
        }),
      ).toBeUndefined();
      expect(admit).not.toHaveBeenCalled();
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
      [{ testUsers: { key: '' } }, /testUsers.key must be a non-empty string/],
      [{ testUsers: { key: 42 } }, /testUsers.key must be a non-empty string/],
      [{ testUsers: { allow: true } }, /testUsers.allow must be a function/],
      [{ testUsers: 'yes' }, /testUsers must be an object/],
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
      expect(() => authWorker({ ...config, ...(overrides as object) })).toThrow(
        message,
      );
    });

    it('accepts testUsers with or without a key and allow', () => {
      for (const testUsers of [{}, { key: 'k', allow: () => true }]) {
        expect(() => authWorker({ ...config, testUsers })).not.toThrow();
      }
    });
  });
});
