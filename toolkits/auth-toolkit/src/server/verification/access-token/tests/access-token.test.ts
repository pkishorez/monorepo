import { SignJWT, exportJWK, generateKeyPair } from 'jose';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { verifyAccessToken } from '../access-token.js';

const authWorkerUrl = 'https://auth.example.com';
const issuer = `${authWorkerUrl}/api/auth`;
const resource = 'https://api.example.com';

let privateKey: CryptoKey;
let jwks: { keys: Record<string, unknown>[] };

beforeAll(async () => {
  const pair = await generateKeyPair('EdDSA');
  privateKey = pair.privateKey;
  jwks = { keys: [{ ...(await exportJWK(pair.publicKey)), kid: 'k1' }] };
});

const mint = (claims: Record<string, unknown>, audience = resource) =>
  new SignJWT({
    scope: 'openid notes:read',
    client_id: 'cli',
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
    .sign(privateKey);

const withToken = (token: string) =>
  new Request('https://api.example.com/notes', {
    headers: { authorization: `Bearer ${token}` },
  });

describe('verifyAccessToken', () => {
  afterEach(() => vi.unstubAllGlobals());

  const stubJwks = () =>
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: RequestInfo | URL) => {
        expect(String(input)).toBe(`${issuer}/jwks`);
        return Response.json(jwks);
      }),
    );

  it('resolves null without an Authorization header', async () => {
    stubJwks();
    const verified = await verifyAccessToken({
      authWorkerUrl,
      resource,
      request: new Request('https://api.example.com/notes'),
    });
    expect(verified).toBeNull();
  });

  it('rejects an opaque Session token as an Access Token', async () => {
    stubJwks();
    const verified = await verifyAccessToken({
      authWorkerUrl,
      resource,
      request: withToken('opaque-session-token'),
    });
    expect(verified).toBeNull();
  });

  it('turns a valid token into a user, client, and scopes', async () => {
    stubJwks();
    const verified = await verifyAccessToken({
      authWorkerUrl,
      resource,
      request: withToken(await mint({})),
    });
    expect(verified).toEqual({
      user: { id: 'u1', email: 'ada@example.com', name: 'Ada' },
      client: { id: 'cli' },
      scopes: ['openid', 'notes:read'],
    });
  });

  it('rejects a token minted for another Resource Server', async () => {
    stubJwks();
    const verified = await verifyAccessToken({
      authWorkerUrl,
      resource,
      request: withToken(await mint({}, 'https://other.example.com')),
    });
    expect(verified).toBeNull();
  });

  it('rejects a token signed by an unknown key', async () => {
    stubJwks();
    const { privateKey: stranger } = await generateKeyPair('EdDSA');
    const forged = await new SignJWT({ scope: 'openid' })
      .setProtectedHeader({ alg: 'EdDSA', kid: 'k1' })
      .setIssuer(issuer)
      .setAudience(resource)
      .setSubject('u1')
      .setExpirationTime('5m')
      .sign(stranger);
    const verified = await verifyAccessToken({
      authWorkerUrl,
      resource,
      request: withToken(forged),
    });
    expect(verified).toBeNull();
  });

  it('fails when the JWKS cannot be fetched', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('down', { status: 503 })),
    );
    // Keys are cached per issuer, so an issuer no other test has used.
    await expect(
      verifyAccessToken({
        authWorkerUrl: 'https://auth-down.example.com',
        resource,
        request: withToken(await mint({})),
      }),
    ).rejects.toThrow();
  });
});
