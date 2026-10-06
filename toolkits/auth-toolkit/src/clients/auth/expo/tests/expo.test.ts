import { createHash, randomUUID } from 'node:crypto';
import { Effect } from 'effect';
import { decodeJwt } from 'jose';
import { describe, expect, it } from 'vitest';
import { memoryPrimaryDatabase } from '../../../../auth-worker/database/sqlite/memory/index.js';
import { createAuthWorker } from '../../../../auth-worker/worker/index.js';
import { Auth } from '../../service/index.js';
import { makeAuth } from '../accounts.js';
import type { Authorized, Device } from '../device.js';

const authWorkerUrl = 'https://auth.example.com';
const ledger = {
  clientId: 'ledger',
  redirectUri: 'ledger://oauth/callback',
  resource: 'https://ledger.example.com/rpc',
};

/** A real Auth Worker in memory, with the app as a First-Party client. */
const authWorker = () =>
  createAuthWorker({
    baseURL: authWorkerUrl,
    secret: 'test-secret-test-secret-test-secret',
    google: { clientId: 'test', clientSecret: 'test' },
    trustedOrigins: [],
    branding: { appName: 'Example' },
    database: memoryPrimaryDatabase(),
    authorizationServer: {
      resources: [],
      firstPartyClients: [
        { ...ledger, name: 'Ledger', redirectUris: [ledger.redirectUri] },
      ],
    },
    testSignIn: { stage: 'local' },
  }).handler;

/** A phone: secure storage in a Map, and a sign-in sheet in which `who`
 * signs in with the Test Sign-In, PKCE and `state` as expo-auth-session
 * does them. */
const fakePhone = (handler: (request: Request) => Promise<Response>) => {
  const secrets = new Map<string, string>();
  const opened: string[] = [];
  const sheet = { who: 'ada@ledger.test' as string | null, tamper: false };
  const device: Device = {
    secrets: {
      get: async (key) => secrets.get(key) ?? null,
      set: async (key, value) => void secrets.set(key, value),
      remove: async (key) => void secrets.delete(key),
    },
    authorize: async (request): Promise<Authorized> => {
      if (sheet.who === null) return { type: 'cancelled' };
      const verifier = `${randomUUID()}${randomUUID()}`;
      const state = randomUUID();
      const url = new URL(request.authorizationEndpoint);
      url.search = new URLSearchParams({
        ...request.params,
        response_type: 'code',
        client_id: request.clientId,
        redirect_uri: request.redirectUri,
        scope: request.scopes.join(' '),
        state,
        code_challenge: createHash('sha256')
          .update(verifier)
          .digest('base64url'),
        code_challenge_method: 'S256',
      }).toString();
      const login = new URL(
        (await handler(new Request(url))).headers.get('location')!,
        authWorkerUrl,
      );
      const signedIn = await handler(
        new Request(`${authWorkerUrl}/api/auth/sign-in/test`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email: sheet.who,
            oauth_query: login.search.slice(1),
          }),
        }),
      );
      const back = new URL(((await signedIn.json()) as { url: string }).url);
      const returned = sheet.tamper ? 'forged' : back.searchParams.get('state');
      if (returned !== state) {
        return { type: 'error', code: 'state_mismatch' };
      }
      return {
        type: 'code',
        code: back.searchParams.get('code')!,
        codeVerifier: verifier,
      };
    },
    open: async (url) => void opened.push(url),
  };
  return { device, secrets, sheet, opened };
};

const setUp = () => {
  const handler = authWorker();
  let now = Date.now();
  let online = true;
  const requests: string[] = [];
  const phone = fakePhone(handler);
  const environment = {
    now: () => now,
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      if (!online) throw new TypeError('Network request failed');
      const request = new Request(input, init);
      requests.push(new URL(request.url).pathname);
      return handler(request);
    }) as typeof fetch,
  };
  const auth = makeAuth(
    { ...ledger, authWorkerUrl },
    phone.device,
    environment,
  );
  const run = <A, E>(effect: Effect.Effect<A, E, Auth>) =>
    Effect.runPromise(Effect.provideService(effect, Auth, auth));
  return {
    ...phone,
    run,
    requests,
    handler,
    later: (ms: number) => void (now += ms),
    offline: () => void (online = false),
  };
};

const list = Effect.flatMap(Auth, (auth) => auth.list);
const signIn = Effect.flatMap(Auth, (auth) => auth.signIn());
const emails = (accounts: ReadonlyArray<{ user: { email: string } }>) =>
  accounts.map(({ user }) => user.email);

describe('authExpo', () => {
  it('signs a User in with a Ledger Access Token and keeps it in secure storage', async () => {
    const { run, secrets } = setUp();
    await run(signIn);
    const [ada] = await run(list);
    expect(ada).toMatchObject({
      user: { email: 'ada@ledger.test', name: 'ada' },
      active: true,
    });
    expect(decodeJwt(ada!.token).aud).toContain(ledger.resource);
    // One entry for the User, one roster without tokens.
    expect([...secrets.keys()].sort()).toEqual([
      `auth.user.${ada!.user.id}`,
      'auth.users',
    ]);
    expect(secrets.get('auth.users')).not.toContain(ada!.token);
  });

  it('adds a second User, and the Account Switch changes the active one', async () => {
    const { run, sheet } = setUp();
    await run(signIn);
    sheet.who = 'grace@ledger.test';
    await run(signIn);
    let accounts = await run(list);
    expect(emails(accounts)).toEqual(['ada@ledger.test', 'grace@ledger.test']);
    expect(accounts.find(({ active }) => active)?.user.email).toBe(
      'grace@ledger.test',
    );

    const ada = accounts[0]!;
    await run(Effect.flatMap(Auth, (auth) => auth.switchTo(ada.token)));
    accounts = await run(list);
    expect(accounts.find(({ active }) => active)?.user.email).toBe(
      'ada@ledger.test',
    );
  });

  it('refreshes an expiring Access Token, rotating the refresh token', async () => {
    const { run, secrets, later } = setUp();
    await run(signIn);
    const [before] = await run(list);
    const key = `auth.user.${before!.user.id}`;
    const spent = JSON.parse(secrets.get(key)!).refreshToken as string;

    later(15 * 60_000);
    const [after] = await run(list);
    expect(after!.token).not.toBe(before!.token);
    expect(JSON.parse(secrets.get(key)!).refreshToken).not.toBe(spent);
    // Switching by the old token still finds the same User.
    await run(Effect.flatMap(Auth, (auth) => auth.switchTo(before!.token)));
  });

  it('refreshes once when asked twice at the same time', async () => {
    const { run, later, requests } = setUp();
    await run(signIn);
    later(15 * 60_000);
    requests.length = 0;
    const [a, b] = await Promise.all([run(list), run(list)]);
    expect(
      requests.filter((path) => path.endsWith('/oauth2/token')),
    ).toHaveLength(1);
    expect(a[0]!.token).toBe(b[0]!.token);
  });

  it('signs a User out whose refresh token was reused elsewhere', async () => {
    const { run, secrets, later, handler } = setUp();
    await run(signIn);
    const [ada] = await run(list);
    const stolen = JSON.parse(secrets.get(`auth.user.${ada!.user.id}`)!)
      .refreshToken as string;
    // A thief refreshes first; the phone's refresh is then a reuse.
    await handler(
      new Request(`${authWorkerUrl}/api/auth/oauth2/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: stolen,
          client_id: ledger.clientId,
          resource: ledger.resource,
        }),
      }),
    );
    later(15 * 60_000);
    // The phone still holds the stolen token, now spent: the chain dies.
    expect(await run(list)).toEqual([]);
  });

  it('revokes the refresh token on Sign Out and forgets the User', async () => {
    const { run, secrets, requests } = setUp();
    await run(signIn);
    const [ada] = await run(list);
    await run(Effect.flatMap(Auth, (auth) => auth.signOut(ada!.token)));
    expect(requests).toContain('/api/auth/oauth2/revoke');
    expect(await run(list)).toEqual([]);
    expect([...secrets.keys()]).toEqual(['auth.users']);
  });

  it('signs everyone out', async () => {
    const { run, sheet } = setUp();
    await run(signIn);
    sheet.who = 'grace@ledger.test';
    await run(signIn);
    await run(Effect.flatMap(Auth, (auth) => auth.signOutAll));
    expect(await run(list)).toEqual([]);
  });

  it('completes without anyone when the sheet is closed', async () => {
    const { run, sheet } = setUp();
    sheet.who = null;
    await run(signIn);
    expect(await run(list)).toEqual([]);
    expect(
      await run(Effect.flatMap(Auth, (auth) => auth.takeLoginError)),
    ).toBeNull();
  });

  it('reports a forged state once, and signs nobody in', async () => {
    const { run, sheet } = setUp();
    sheet.tamper = true;
    await run(signIn);
    expect(await run(list)).toEqual([]);
    const take = Effect.flatMap(Auth, (auth) => auth.takeLoginError);
    expect(await run(take)).toEqual({ code: 'state_mismatch' });
    expect(await run(take)).toBeNull();
  });

  it('keeps a User with their last token while offline', async () => {
    const { run, later, offline } = setUp();
    await run(signIn);
    const [before] = await run(list);
    later(15 * 60_000);
    offline();
    const [after] = await run(list);
    expect(after!.token).toBe(before!.token);
    const signOut = Effect.flatMap(Auth, (auth) => auth.signOut(before!.token));
    await expect(run(signOut)).rejects.toThrow();
    expect(await run(list)).toHaveLength(1);
  });
});
