import { createHash, randomUUID } from 'node:crypto';
import { createLocalJWKSet, decodeJwt, jwtVerify } from 'jose';
import { describe, expect, it } from 'vitest';
import { memory } from '../../database/sqlite/memory/index.js';
import { createAuthWorker } from '../worker.js';

const baseURL = 'https://auth.example.com';
const api = `${baseURL}/api/auth`;
const ledger = {
  clientId: 'ledger',
  name: 'Ledger',
  redirectUris: ['ledger://oauth/callback'],
  resource: 'https://ledger.example.com/rpc',
};
const mcp = 'https://mcp.example.com/mcp';

const makeWorker = () =>
  createAuthWorker({
    baseURL,
    secret: 'test-secret-test-secret-test-secret',
    google: { clientId: 'test', clientSecret: 'test' },
    trustedOrigins: ['https://app.example.com'],
    branding: { appName: 'Example' },
    database: memory(),
    authorizationServer: {
      resources: [mcp],
      clientRegistration: 'dynamic',
      firstPartyClients: [ledger],
    },
    testSignIn: { stage: 'local' },
  });

type Handler = ReturnType<typeof makeWorker>['handler'];

const pkce = () => {
  const verifier = `${randomUUID()}${randomUUID()}`;
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
};

const authorizeUrl = (params: Record<string, string>) =>
  `${api}/oauth2/authorize?${new URLSearchParams({
    response_type: 'code',
    client_id: ledger.clientId,
    redirect_uri: ledger.redirectUris[0]!,
    scope: 'openid profile email offline_access',
    resource: ledger.resource,
    prompt: 'login',
    ...params,
  })}`;

const form = (handler: Handler, path: string, body: Record<string, string>) =>
  handler(
    new Request(`${api}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams(body),
    }),
  );

interface Tokens {
  access_token: string;
  refresh_token: string;
  id_token: string;
  expires_in: number;
}

/** Authorize with PKCE, sign in with the Test Sign-In, and return to the
 * app's redirect with a code. */
const signIn = async (handler: Handler, email: string) => {
  const { verifier, challenge } = pkce();
  const state = randomUUID();
  const authorize = await handler(
    new Request(
      authorizeUrl({
        state,
        code_challenge: challenge,
        code_challenge_method: 'S256',
      }),
    ),
  );
  expect(authorize.status).toBe(302);
  const login = new URL(authorize.headers.get('location')!, baseURL);
  expect(login.pathname).toBe('/login');

  const signedIn = await handler(
    new Request(`${api}/sign-in/test`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, oauth_query: login.search.slice(1) }),
    }),
  );
  expect(signedIn.status).toBe(200);
  const { url } = (await signedIn.json()) as { url: string };
  const back = new URL(url);
  expect(`${back.protocol}//${back.host}${back.pathname}`).toBe(
    ledger.redirectUris[0],
  );
  expect(back.searchParams.get('state')).toBe(state);
  const code = back.searchParams.get('code')!;

  const exchanged = await form(handler, '/oauth2/token', {
    grant_type: 'authorization_code',
    code,
    redirect_uri: ledger.redirectUris[0]!,
    client_id: ledger.clientId,
    code_verifier: verifier,
    resource: ledger.resource,
  });
  expect(exchanged.status).toBe(200);
  return (await exchanged.json()) as Tokens;
};

const refresh = (handler: Handler, refreshToken: string) =>
  form(handler, '/oauth2/token', {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: ledger.clientId,
    resource: ledger.resource,
  });

describe('a First-Party OAuth client', () => {
  it('signs in with PKCE and no consent, for a 15-minute Ledger token', async () => {
    const { handler } = makeWorker();
    const tokens = await signIn(handler, 'ada@ledger.test');

    const jwks = (await (
      await handler(new Request(`${api}/jwks`))
    ).json()) as Parameters<typeof createLocalJWKSet>[0];
    const { payload } = await jwtVerify(
      tokens.access_token,
      createLocalJWKSet(jwks),
      { issuer: api, audience: ledger.resource },
    );
    expect(payload.exp! - payload.iat!).toBe(900);
    expect(payload).toMatchObject({
      client_id: 'ledger',
      email: 'ada@ledger.test',
    });
    expect(tokens.expires_in).toBe(900);
    expect(decodeJwt(tokens.id_token).sub).toBe(payload.sub);
    const userInfo = await handler(
      new Request(`${api}/oauth2/userinfo`, {
        headers: { authorization: `Bearer ${tokens.access_token}` },
      }),
    );
    expect(await userInfo.json()).toMatchObject({
      sub: payload.sub,
      email: 'ada@ledger.test',
      name: 'ada',
    });
  });

  it('rotates the refresh token on every use, and a reused one revokes the chain', async () => {
    const { handler } = makeWorker();
    const first = await signIn(handler, 'ada@ledger.test');

    const rotated = await refresh(handler, first.refresh_token);
    expect(rotated.status).toBe(200);
    const second = (await rotated.json()) as Tokens;
    expect(second.refresh_token).not.toBe(first.refresh_token);
    expect(decodeJwt(second.access_token).aud).toContain(ledger.resource);

    const reused = await refresh(handler, first.refresh_token);
    expect(reused.status).toBe(400);
    expect(await reused.json()).toMatchObject({ error: 'invalid_grant' });

    // The thief's reuse took the rightful holder's newer token with it.
    const after = await refresh(handler, second.refresh_token);
    expect(after.status).toBe(400);
  });

  it('revokes the refresh token on Sign Out', async () => {
    const { handler } = makeWorker();
    const tokens = await signIn(handler, 'grace@ledger.test');
    const revoked = await form(handler, '/oauth2/revoke', {
      token: tokens.refresh_token,
      token_type_hint: 'refresh_token',
      client_id: ledger.clientId,
    });
    expect(revoked.status).toBe(200);
    expect((await refresh(handler, tokens.refresh_token)).status).toBe(400);
  });

  it('keeps each User their own tokens', async () => {
    const { handler } = makeWorker();
    const ada = await signIn(handler, 'ada@ledger.test');
    const grace = await signIn(handler, 'grace@ledger.test');
    expect(decodeJwt(ada.access_token).sub).not.toBe(
      decodeJwt(grace.access_token).sub,
    );
    await form(handler, '/oauth2/revoke', {
      token: grace.refresh_token,
      token_type_hint: 'refresh_token',
      client_id: ledger.clientId,
    });
    expect((await refresh(handler, ada.refresh_token)).status).toBe(200);
  });

  const authorizeError = async (
    handler: Handler,
    params: Record<string, string>,
  ) => {
    const response = await handler(new Request(authorizeUrl(params)));
    return new URL(response.headers.get('location') ?? '', baseURL);
  };

  it('accepts only its exact redirect URIs and PKCE', async () => {
    const { handler } = makeWorker();
    const { challenge } = pkce();
    const elsewhere = await authorizeError(handler, {
      state: 's',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      redirect_uri: 'ledger://oauth/callback/other',
    });
    expect(elsewhere.protocol).toBe('https:');
    expect(elsewhere.searchParams.get('error')).toBeTruthy();

    const withoutPkce = await authorizeError(handler, { state: 's' });
    expect(withoutPkce.searchParams.get('error')).toBeTruthy();
    expect(withoutPkce.pathname).not.toBe('/login');
  });

  it('cannot get tokens for another Resource Server, nor can others get Ledger ones', async () => {
    const { handler } = makeWorker();
    const { challenge } = pkce();
    const forMcp = await authorizeError(handler, {
      state: 's',
      code_challenge: challenge,
      code_challenge_method: 'S256',
      resource: mcp,
    });
    expect(forMcp.searchParams.get('error')).toBe('invalid_target');

    const registered = await handler(
      new Request(`${api}/oauth2/register`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          redirect_uris: ['http://localhost:6274/oauth/callback'],
          token_endpoint_auth_method: 'none',
          client_name: 'Some MCP client',
        }),
      }),
    );
    const { client_id } = (await registered.json()) as { client_id: string };
    const stranger = await handler(
      new Request(
        authorizeUrl({
          client_id,
          redirect_uri: 'http://localhost:6274/oauth/callback',
          state: 's',
          code_challenge: challenge,
          code_challenge_method: 'S256',
        }),
      ),
    );
    expect(
      new URL(stranger.headers.get('location')!).searchParams.get('error'),
    ).toBe('invalid_target');
  });
});

describe('the First-Party client record', () => {
  it('is written once from the config, and again only when it changes', async () => {
    const { auth, handler } = makeWorker();
    await signIn(handler, 'ada@ledger.test');
    await signIn(handler, 'grace@ledger.test');
    const { adapter } = await auth.$context;
    const stored = await adapter.findOne<{
      createdAt: Date;
      updatedAt: Date;
      skipConsent: boolean;
      redirectUris: string[];
    }>({
      model: 'oauthClient',
      where: [{ field: 'clientId', value: 'ledger' }],
    });
    expect(stored).toMatchObject({
      skipConsent: true,
      redirectUris: ledger.redirectUris,
    });
    expect(stored!.updatedAt.getTime()).toBe(stored!.createdAt.getTime());
  });
});

describe('the Test Sign-In', () => {
  it('refuses to start on any stage but local', () => {
    expect(() =>
      createAuthWorker({
        baseURL,
        secret: 'test-secret-test-secret-test-secret',
        google: { clientId: 'test', clientSecret: 'test' },
        trustedOrigins: [],
        branding: { appName: 'Example' },
        database: memory(),
        testSignIn: { stage: 'prod' },
      }),
    ).toThrow(/only on the "local" stage/);
  });

  it('is not there unless turned on', async () => {
    const { handler } = createAuthWorker({
      baseURL,
      secret: 'test-secret-test-secret-test-secret',
      google: { clientId: 'test', clientSecret: 'test' },
      trustedOrigins: [],
      branding: { appName: 'Example' },
      database: memory(),
    });
    const response = await handler(
      new Request(`${api}/sign-in/test`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'ada@ledger.test' }),
      }),
    );
    expect(response.status).toBe(404);
  });

  it('takes only .test emails, and signs one in with a Session', async () => {
    const { handler } = makeWorker();
    const post = (email: string) =>
      handler(
        new Request(`${api}/sign-in/test`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email }),
        }),
      );
    expect((await post('someone@gmail.com')).status).toBe(400);
    const signedIn = await post('Ada@Ledger.test');
    expect(signedIn.status).toBe(200);
    expect(signedIn.headers.get('set-cookie')).toContain('session_token');
    expect(await signedIn.json()).toMatchObject({
      user: { email: 'ada@ledger.test', name: 'ada' },
    });
  });
});
