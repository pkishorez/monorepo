import {
  Client,
  StreamableHTTPClientTransport,
} from '@modelcontextprotocol/client';
import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createResourceServer } from '../index.ts';

const authWorkerUrl = 'https://auth.example.com';
const issuer = `${authWorkerUrl}/api/auth`;
const resource = 'https://mcp.example.com/mcp';

const server = createResourceServer({
  authWorkerUrl,
  resource,
  requiredScopes: ['__SCOPE__'],
});

let privateKey: CryptoKey;
let jwks: { keys: Record<string, unknown>[] };

beforeAll(async () => {
  const pair = await generateKeyPair('EdDSA');
  privateKey = pair.privateKey;
  jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1' }] };
});

const mint = (scope = 'openid __SCOPE__') =>
  new SignJWT({
    scope,
    client_id: 'inspector',
    email: 'ada@example.com',
    name: 'Ada',
  })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'k1' })
    .setIssuer(issuer)
    .setAudience(resource)
    .setSubject('u1')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(privateKey);

// The Auth Worker's JWKS is the only thing the server fetches.
const stubJwks = () =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL) => {
      expect(String(input)).toBe(`${issuer}/jwks`);
      return Response.json(jwks);
    }),
  );

const connect = async (token: string) => {
  const client = new Client({ name: 'test', version: '0.0.0' });
  const transport = new StreamableHTTPClientTransport(new URL(resource), {
    // Route the client straight into the handler, no network.
    fetch: (input, init) => server(new Request(input, init)),
    requestInit: { headers: { authorization: `Bearer ${token}` } },
  });
  await client.connect(transport);
  return client;
};

describe('the MCP Server', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('describes itself at / and knows nothing else', async () => {
    const landing = await server(new Request('https://mcp.example.com/'));
    expect(landing.status).toBe(200);
    expect(await landing.text()).toContain(resource);
    const other = await server(new Request('https://mcp.example.com/nope'));
    expect(other.status).toBe(404);
  });

  it('publishes where to log in', async () => {
    const response = await server(
      new Request(
        'https://mcp.example.com/.well-known/oauth-protected-resource/mcp',
      ),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      resource,
      authorization_servers: [issuer],
      scopes_supported: ['__SCOPE__'],
    });
  });

  it('is not reachable without an Access Token', async () => {
    const response = await server(
      new Request(resource, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'ping' }),
      }),
    );
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain(
      'resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp"',
    );
  });

  it('serves tools to a logged-in Client Application', async () => {
    stubJwks();
    const client = await connect(await mint());
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name).sort()).toEqual(['echo', 'whoami']);

    const whoami = await client.callTool({ name: 'whoami', arguments: {} });
    const text = (whoami.content as { type: string; text: string }[])[0]?.text;
    expect(JSON.parse(text ?? '{}')).toEqual({
      user: { id: 'u1', email: 'ada@example.com', name: 'Ada' },
      client: { id: 'inspector' },
      scopes: ['openid', '__SCOPE__'],
    });

    const echo = await client.callTool({
      name: 'echo',
      arguments: { message: 'hi' },
    });
    expect((echo.content as { text: string }[])[0]?.text).toBe('hi');
    await client.close();
  });

  it('refuses a token without the required Scope', async () => {
    stubJwks();
    await expect(connect(await mint('openid'))).rejects.toThrow();
  });
});
