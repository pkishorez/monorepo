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

  it('publishes discovery metadata and keys when configured', async () => {
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
    expect(body.grant_types_supported).not.toContain(
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

  it('serves the same metadata at the RFC 8414 path-inserted URL', async () => {
    const { handler } = createAuthWorker({
      ...config,
      database: memoryPrimaryDatabase(),
      authorizationServer: { resources: [] },
    });
    const inserted = await handler(
      new Request(`${baseURL}/.well-known/oauth-authorization-server/api/auth`),
    );
    expect(inserted.status).toBe(200);
    expect(((await inserted.json()) as { issuer: string }).issuer).toBe(
      `${baseURL}/api/auth`,
    );
  });
});

describe('Client Registration', () => {
  const metadataFor = async (
    clientRegistration: 'manual' | 'dynamic' | 'cimd' | 'dynamic+cimd',
  ) => {
    const { handler } = createAuthWorker({
      ...config,
      database: memoryPrimaryDatabase(),
      authorizationServer: {
        resources: ['https://mcp.example.com/mcp'],
        clientRegistration,
      },
    });
    const response = await get(
      handler,
      '/.well-known/oauth-authorization-server',
    );
    const metadata = (await response.json()) as {
      registration_endpoint?: string;
      client_id_metadata_document_supported?: boolean;
    };
    return { handler, metadata };
  };

  it('is manual by default: no registration endpoint, no metadata documents', async () => {
    const { metadata, handler } = await metadataFor('manual');
    expect(metadata.registration_endpoint).toBeUndefined();
    expect(metadata.client_id_metadata_document_supported).toBeUndefined();
    const attempt = await handler(
      new Request(`${baseURL}/api/auth/oauth2/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_name: 'inspector',
          redirect_uris: ['http://localhost:6274/oauth/callback'],
          token_endpoint_auth_method: 'none',
        }),
      }),
    );
    expect(attempt.status).toBeGreaterThanOrEqual(400);
  });

  const register = (
    handler: (request: Request) => Promise<Response>,
    body: Record<string, unknown>,
  ) =>
    handler(
      new Request(`${baseURL}/api/auth/oauth2/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      }),
    );

  const inspector = {
    redirect_uris: [
      'http://localhost:6274/oauth/callback',
      'http://localhost:6274/oauth/callback/debug',
    ],
    token_endpoint_auth_method: 'none',
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    client_name: 'MCP Inspector',
    client_uri: 'https://github.com/modelcontextprotocol/inspector',
  };

  it('dynamic registers an MCP client unauthenticated, as a native app', async () => {
    const { metadata, handler } = await metadataFor('dynamic');
    expect(metadata.registration_endpoint).toBe(
      `${baseURL}/api/auth/oauth2/register`,
    );
    expect(metadata.client_id_metadata_document_supported).toBeUndefined();
    const registered = await register(handler, inspector);
    expect(registered.status).toBe(201);
    const client = (await registered.json()) as {
      client_id: string;
      client_secret?: string;
      application_type?: string;
      redirect_uris: string[];
    };
    expect(client.client_id).toBeTruthy();
    expect(client.client_secret).toBeUndefined();
    expect(client.application_type).toBe('native');
    expect(client.redirect_uris).toEqual(inspector.redirect_uris);
  });

  it('dynamic still holds web clients to https redirects', async () => {
    const { handler } = await metadataFor('dynamic');
    const web = await register(handler, {
      ...inspector,
      redirect_uris: ['https://app.example.com/callback'],
    });
    expect(web.status).toBe(201);
    expect(
      ((await web.json()) as { application_type?: string }).application_type,
    ).toBe('web');
    const mixed = await register(handler, {
      ...inspector,
      redirect_uris: [
        'http://localhost:6274/oauth/callback',
        'http://evil.example.com/callback',
      ],
    });
    expect(mixed.status).toBe(400);
    const declaredWeb = await register(handler, {
      ...inspector,
      application_type: 'web',
    });
    expect(declaredWeb.status).toBe(400);
  });

  it('cimd advertises metadata documents without a registration endpoint', async () => {
    const { metadata } = await metadataFor('cimd');
    expect(metadata.client_id_metadata_document_supported).toBe(true);
    expect(metadata.registration_endpoint).toBeUndefined();
  });

  it('dynamic+cimd advertises both', async () => {
    const { metadata } = await metadataFor('dynamic+cimd');
    expect(metadata.client_id_metadata_document_supported).toBe(true);
    expect(metadata.registration_endpoint).toBe(
      `${baseURL}/api/auth/oauth2/register`,
    );
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

  it('serves the pages with the Identity Role alone, but not discovery', async () => {
    const identityOnly = createAuthWorker({
      ...config,
      database: memoryPrimaryDatabase(),
      pages,
    });
    const login = await identityOnly.handler(new Request(`${baseURL}/login`));
    expect(login.status).toBe(200);
    const discovery = await identityOnly.handler(
      new Request(`${baseURL}/api/auth/.well-known/oauth-authorization-server`),
    );
    expect(discovery.status).toBe(404);
  });
});
