import { Effect } from 'effect';
import { exportJWK, generateKeyPair, SignJWT } from 'jose';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { Authz } from '@kstackz/auth-toolkit/guard';
import { authz } from '@kstackz/auth-toolkit/server/cloud';
import { AUTH_URL, LEDGER_RESOURCE } from '../stage.ts';

const issuer = `${AUTH_URL}/api/auth`;
const keys = await generateKeyPair('EdDSA', { extractable: true });
const kid = 'test-key';

const token = (claims: {
  aud: string | string[];
  iss?: string;
  exp?: string;
}) =>
  new SignJWT({ client_id: 'ledger', email: 'ada@ledger.test', name: 'Ada' })
    .setProtectedHeader({ alg: 'EdDSA', kid })
    .setSubject('user-ada')
    .setIssuer(claims.iss ?? issuer)
    .setAudience(claims.aud)
    .setIssuedAt()
    .setExpirationTime(claims.exp ?? '15m')
    .sign(keys.privateKey);

const resolve = (bearer: string) =>
  Effect.runPromise(
    Effect.flatMap(Authz.Resolver, (resolver) =>
      resolver.resolve(
        new Request('https://kstack.kishore.computer/rpc', {
          method: 'POST',
          headers: { authorization: `Bearer ${bearer}` },
        }),
      ),
    ).pipe(
      Effect.provide(
        authz.cloud({ authWorkerUrl: AUTH_URL, resource: LEDGER_RESOURCE }),
      ),
    ),
  );

describe("the cloud Backend's sign-in check", () => {
  beforeAll(async () => {
    const jwk = { ...(await exportJWK(keys.publicKey)), kid, alg: 'EdDSA' };
    // The sign-in service, as the Worker reaches it: its keys, and no
    // Session for any bearer.
    vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
      const url = new URL(input instanceof Request ? input.url : input);
      return url.pathname === '/api/auth/jwks'
        ? Response.json({ keys: [jwk] })
        : Response.json(null);
    });
  });
  afterAll(() => vi.unstubAllGlobals());

  it('accepts a Ledger Access Token as its User', async () => {
    const resolved = await resolve(
      await token({ aud: [LEDGER_RESOURCE, `${issuer}/oauth2/userinfo`] }),
    );
    expect(resolved?.current).toEqual({
      kind: 'token',
      user: { id: 'user-ada', email: 'ada@ledger.test', name: 'Ada' },
      client: { id: 'ledger' },
      scopes: [],
    });
  });

  it('refuses an Access Token for another Resource Server', async () => {
    expect(
      await resolve(await token({ aud: 'https://mcp.kishore.computer/mcp' })),
    ).toBeNull();
  });

  it('refuses one from another issuer', async () => {
    expect(
      await resolve(
        await token({
          aud: LEDGER_RESOURCE,
          iss: 'https://auth.example.com/api/auth',
        }),
      ),
    ).toBeNull();
  });

  it('refuses an expired one', async () => {
    expect(
      await resolve(await token({ aud: LEDGER_RESOURCE, exp: '-1m' })),
    ).toBeNull();
  });
});
