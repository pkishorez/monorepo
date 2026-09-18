import { describe, expect, it } from 'vitest';
import { memoryPrimaryDatabase } from '../../infra/primary/sqlite/memory/index.js';
import type { Branding } from '../pages.js';
import { createAuthWorker } from '../worker.js';

const baseURL = 'https://auth.example.com';
const config = {
  baseURL,
  secret: 'test-secret-test-secret-test-secret',
  google: { clientId: 'test', clientSecret: 'test' },
  trustedOrigins: ['https://app.example.com'],
  branding: { appName: 'Example' },
};

const get = (handler: (request: Request) => Promise<Response>, path: string) =>
  handler(new Request(`${baseURL}/api/auth${path}`));

describe('Authorization Server Role', () => {
  it('is off unless configured', async () => {
    const { handler } = createAuthWorker({
      ...config,
      database: memoryPrimaryDatabase(),
    });
    const metadata = await get(
      handler,
      '/.well-known/oauth-authorization-server',
    );
    expect(metadata.status).toBe(404);
    expect((await get(handler, '/jwks')).status).toBe(404);
  });

  it('publishes discovery metadata, keys, and the device flow when configured', async () => {
    const { handler } = createAuthWorker({
      ...config,
      database: memoryPrimaryDatabase(),
      authorizationServer: {
        resources: ['https://api.example.com'],
        scopes: [{ name: 'notes:read', description: 'Read notes' }],
      },
    });

    const metadata = await get(
      handler,
      '/.well-known/oauth-authorization-server',
    );
    expect(metadata.status).toBe(200);
    const body = (await metadata.json()) as {
      issuer: string;
      scopes_supported: string[];
      grant_types_supported: string[];
      registration_endpoint?: string;
    };
    expect(body.issuer).toBe(`${baseURL}/api/auth`);
    expect(body.scopes_supported).toContain('notes:read');
    expect(body.grant_types_supported).toContain(
      'urn:ietf:params:oauth:grant-type:device_code',
    );
    expect(body.registration_endpoint).toBeUndefined();

    const jwks = await get(handler, '/jwks');
    expect(jwks.status).toBe(200);
    expect(((await jwks.json()) as { keys: unknown[] }).keys).not.toHaveLength(
      0,
    );

    // The JWT plugin's own user-token route stays closed.
    const token = await get(handler, '/token');
    expect(token.status).toBe(404);
  });
});

describe('the pages app', () => {
  const pages = {
    fetch: (request: Request, context: { branding: Branding }) =>
      Promise.resolve(
        new Response(
          `${String(context.branding.appName)}:${new URL(request.url).pathname}`,
        ),
      ),
    assets: {
      '/assets/app.css': { type: 'text/css', body: 'body{}' },
      '/assets/font.woff2': { type: 'font/woff2', base64: 'AAEC' },
    },
  };
  const withPages = createAuthWorker({
    ...config,
    database: memoryPrimaryDatabase(),
    authorizationServer: { resources: [] },
    pages,
  });

  it('renders pages and server-function calls with the app name', async () => {
    const login = await withPages.handler(new Request(`${baseURL}/login`));
    expect(await login.text()).toBe('Example:/login');
    const fn = await withPages.handler(
      new Request(`${baseURL}/_serverFn/x`, { method: 'POST' }),
    );
    expect(await fn.text()).toBe('Example:/_serverFn/x');
  });

  it('serves embedded text and binary assets as immutable', async () => {
    const css = await withPages.handler(
      new Request(`${baseURL}/assets/app.css`),
    );
    expect(css.headers.get('content-type')).toBe('text/css');
    expect(css.headers.get('cache-control')).toContain('immutable');
    expect(await css.text()).toBe('body{}');
    const font = await withPages.handler(
      new Request(`${baseURL}/assets/font.woff2`),
    );
    expect(new Uint8Array(await font.arrayBuffer())).toEqual(
      new Uint8Array([0, 1, 2]),
    );
  });

  it('answers 404 outside Better Auth when the role is off', async () => {
    const identityOnly = createAuthWorker({
      ...config,
      database: memoryPrimaryDatabase(),
      pages,
    });
    const response = await identityOnly.handler(
      new Request(`${baseURL}/login`),
    );
    expect(response.status).toBe(404);
  });
});
