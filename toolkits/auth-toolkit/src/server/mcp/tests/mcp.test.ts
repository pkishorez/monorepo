import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { createMcpResourceServer, type TokenPrincipal } from '../index.js';

const authWorkerUrl = 'https://auth.example.com';
const issuer = `${authWorkerUrl}/api/auth`;
const resource = 'https://mcp.example.com/mcp';

let privateKey: CryptoKey;
let jwks: { keys: Record<string, unknown>[] };

beforeAll(async () => {
  const pair = await generateKeyPair('EdDSA');
  privateKey = pair.privateKey;
  jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1' }] };
});

const mint = (
  claims: Record<string, unknown> = {},
  audience = resource,
  key: CryptoKey = privateKey,
) =>
  new SignJWT({
    scope: 'openid mcp:demo',
    client_id: 'inspector',
    email: 'ada@example.com',
    name: 'Ada',
    ...claims,
  })
    .setProtectedHeader({ alg: 'EdDSA', kid: 'k1' })
    .setIssuer(issuer)
    .setAudience(audience)
    .setSubject('u1')
    .setIssuedAt()
    .setExpirationTime('5m')
    .sign(key);

const seen: TokenPrincipal[] = [];
const server = createMcpResourceServer({
  authWorkerUrl,
  resource,
  requiredScopes: ['mcp:demo'],
  handler: (_request, principal) => {
    seen.push(principal);
    return Response.json({ ok: true, user: principal.user.email });
  },
});

const call = (init: RequestInit = {}, path = '/mcp') =>
  server(
    new Request(`https://mcp.example.com${path}`, {
      method: 'POST',
      ...init,
    }),
  );

describe('createMcpResourceServer', () => {
  afterEach(() => vi.unstubAllGlobals());

  const stubJwks = () =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe(`${issuer}/jwks`);
        return Response.json(jwks);
      }),
    );

  it('publishes Protected Resource Metadata at both RFC 9728 paths', async () => {
    for (const path of [
      '/.well-known/oauth-protected-resource/mcp',
      '/.well-known/oauth-protected-resource',
    ]) {
      const response = await call({ method: 'GET' }, path);
      expect(response.status).toBe(200);
      expect(response.headers.get('access-control-allow-origin')).toBe('*');
      expect(await response.json()).toEqual({
        resource,
        authorization_servers: [issuer],
        bearer_methods_supported: ['header'],
        scopes_supported: ['mcp:demo'],
      });
    }
    const preflight = await call(
      { method: 'OPTIONS' },
      '/.well-known/oauth-protected-resource/mcp',
    );
    expect(preflight.status).toBe(204);
  });

  it('challenges a request without a token, naming the metadata URL', async () => {
    const response = await call();
    expect(response.status).toBe(401);
    const challenge = response.headers.get('www-authenticate') ?? '';
    expect(challenge).toMatch(/^Bearer /);
    expect(challenge).toContain(
      'resource_metadata="https://mcp.example.com/.well-known/oauth-protected-resource/mcp"',
    );
    const body = (await response.json()) as { jsonrpc: string; error: unknown };
    expect(body.jsonrpc).toBe('2.0');
    expect(body.error).toBeDefined();
    expect(seen).toHaveLength(0);
  });

  it('ignores a browser Session cookie entirely', async () => {
    const response = await call({
      headers: { cookie: 'better-auth.session_token=anything' },
    });
    expect(response.status).toBe(401);
  });

  it('hands a valid token to the handler as a Token Principal', async () => {
    stubJwks();
    const response = await call({
      headers: { authorization: `Bearer ${await mint()}` },
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      ok: true,
      user: 'ada@example.com',
    });
    expect(seen.at(-1)).toEqual({
      kind: 'token',
      user: { id: 'u1', email: 'ada@example.com', name: 'Ada' },
      client: { id: 'inspector' },
      scopes: ['openid', 'mcp:demo'],
    });
  });

  it('refuses a token minted for another Resource Server', async () => {
    stubJwks();
    const response = await call({
      headers: {
        authorization: `Bearer ${await mint({}, 'https://other.example.com')}`,
      },
    });
    expect(response.status).toBe(401);
    expect(response.headers.get('www-authenticate')).toContain(
      'resource_metadata=',
    );
  });

  it('refuses a token signed by a stranger', async () => {
    stubJwks();
    const { privateKey: stranger } = await generateKeyPair('EdDSA');
    const response = await call({
      headers: {
        authorization: `Bearer ${await mint({}, resource, stranger)}`,
      },
    });
    expect(response.status).toBe(401);
  });

  it('answers a token missing a required Scope with insufficient_scope', async () => {
    stubJwks();
    const before = seen.length;
    const response = await call({
      headers: { authorization: `Bearer ${await mint({ scope: 'openid' })}` },
    });
    expect(response.status).toBe(403);
    const challenge = response.headers.get('www-authenticate') ?? '';
    expect(challenge).toContain('error="insufficient_scope"');
    expect(challenge).toContain('mcp:demo');
    expect(seen).toHaveLength(before);
  });
});
