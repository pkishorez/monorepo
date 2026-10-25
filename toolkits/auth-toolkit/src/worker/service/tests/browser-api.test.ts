import { memory } from '../../database/sqlite/memory/index.js';
import { decodeJwt } from 'jose';
import { describe, expect, it } from 'vitest';
import {
  applyCookies,
  baseURL,
  cookies,
  fromPages,
  get,
  makeWith,
  origin,
  post,
  postAsProgram,
  signIn,
  whoIs,
  type Worker,
} from './fixture.js';

const make = makeWith(memory);

/** Two Accounts in one browser, Mary active. */
const twoAccounts = async (worker: Worker = make()) => {
  const ada = await signIn(worker, 'ada@example.com');
  const mary = await signIn(worker, 'mary@example.com');
  return {
    worker,
    ada,
    mary,
    cookie: cookies(mary.active, ada.account, mary.account),
  };
};

const body = async <T>(response: Response) => (await response.json()) as T;

const deviceCode = async (worker: Worker, app = 'acme-cli') =>
  body<{ device_code: string; user_code: string }>(
    await postAsProgram(worker, '/device/code', { client_id: app }),
  );

const deviceRecord = async (worker: Worker, userCode: string) => {
  const { adapter } = await worker.auth.$context;
  return adapter.findOne<{ status: string; userId: string | null }>({
    model: 'deviceCode',
    where: [{ field: 'userCode', value: userCode }],
  });
};

describe('Accounts', () => {
  it('lists this browser’s Accounts and the active one, without tokens', async () => {
    const { worker, ada, mary, cookie } = await twoAccounts();
    const response = await get(worker, '/accounts', { cookie });
    const text = await response.text();
    expect(text).not.toContain(ada.token);
    expect(text).not.toContain(mary.token);
    const listed = JSON.parse(text) as {
      active: string;
      accounts: Array<{ id: string; email: string }>;
    };
    expect(listed.active).toBe(mary.user.id);
    expect(listed.accounts.map((account) => account.email).sort()).toEqual([
      'ada@example.com',
      'mary@example.com',
    ]);
    expect(Object.keys(listed.accounts[0]!).sort()).toEqual([
      'email',
      'id',
      'image',
      'name',
    ]);
  });

  it('lists nobody for a signed-out browser', async () => {
    const response = await get(make(), '/accounts');
    expect(await response.json()).toEqual({ active: null, accounts: [] });
  });

  it('switches by userId', async () => {
    const { worker, ada, cookie } = await twoAccounts();
    const switched = await post(
      worker,
      '/accounts/switch',
      { userId: ada.user.id },
      { cookie },
    );
    expect(await switched.json()).toEqual({ active: ada.user.id });
    expect(switched.headers.has('set-auth-token')).toBe(false);
    expect(await whoIs(worker, applyCookies(cookie, switched))).toBe(
      'ada@example.com',
    );
  });

  it('will not switch to an Account this browser does not hold', async () => {
    const { worker, cookie } = await twoAccounts();
    const stranger = await signIn(worker, 'eve@example.com');
    const response = await post(
      worker,
      '/accounts/switch',
      { userId: stranger.user.id },
      { cookie },
    );
    expect(response.status).toBe(403);
    expect(await whoIs(worker, cookie)).toBe('mary@example.com');
  });

  it('signs out the active Account and names the next one', async () => {
    const { worker, ada, mary, cookie } = await twoAccounts();
    const { internalAdapter } = await worker.auth.$context;
    const out = await post(
      worker,
      '/accounts/sign-out',
      { userId: mary.user.id },
      { cookie },
    );
    expect(await out.json()).toEqual({ active: ada.user.id });
    expect(await internalAdapter.findSession(mary.token)).toBeNull();
    expect(await whoIs(worker, applyCookies(cookie, out))).toBe(
      'ada@example.com',
    );
  });

  it('signs out an Account that is not active and leaves the active one', async () => {
    const { worker, ada, mary, cookie } = await twoAccounts();
    const { internalAdapter } = await worker.auth.$context;
    const out = await post(
      worker,
      '/accounts/sign-out',
      { userId: ada.user.id },
      { cookie },
    );
    expect(await out.json()).toEqual({ active: mary.user.id });
    expect(await internalAdapter.findSession(ada.token)).toBeNull();
    const after = applyCookies(cookie, out);
    expect(await whoIs(worker, after)).toBe('mary@example.com');
    expect(after).not.toContain(ada.token.toLowerCase());
  });

  it('refuses a state change from an origin outside the Shared Cookie Domain', async () => {
    const { worker, ada, cookie } = await twoAccounts();
    for (const origin of ['https://evil.test', '']) {
      const response = await post(
        worker,
        '/accounts/switch',
        { userId: ada.user.id },
        { cookie, origin },
      );
      expect(response.status).toBe(403);
    }
    expect(await whoIs(worker, cookie)).toBe('mary@example.com');
  });
});

describe('Sign-ins', () => {
  it('names each Sign-in of the Active Account and marks this browser', async () => {
    const worker = make();
    const ada = await signIn(worker, 'ada@example.com');
    await signIn(worker, 'ada@example.com', 'acme-cli/1.4.0 (laptop)');
    const response = await get(worker, '/sign-ins', {
      cookie: cookies(ada.active, ada.account),
    });
    const text = await response.text();
    expect(text).not.toContain(ada.token);
    const { signIns } = JSON.parse(text) as {
      signIns: Array<{ name: string; kind: string; current: boolean }>;
    };
    expect(signIns).toEqual([
      expect.objectContaining({
        name: 'Chrome on macOS',
        kind: 'browser',
        current: true,
      }),
      expect.objectContaining({
        name: 'acme-cli on laptop',
        kind: 'device',
        current: false,
      }),
    ]);
  });

  it('needs an Active Account', async () => {
    expect((await get(make(), '/sign-ins')).status).toBe(401);
  });

  it('revokes one Sign-in by id, and only the owner’s', async () => {
    const worker = make();
    const ada = await signIn(worker, 'ada@example.com');
    const cli = await signIn(worker, 'ada@example.com', 'acme-cli/1.0 (box)');
    const eve = await signIn(worker, 'eve@example.com');
    const cookie = cookies(ada.active, ada.account);
    const { internalAdapter } = await worker.auth.$context;

    const foreign = await post(
      worker,
      '/sign-ins/revoke',
      { id: eve.session.id, userId: ada.user.id },
      fromPages(cookie),
    );
    expect(foreign.status).toBe(404);
    expect(await internalAdapter.findSession(eve.token)).not.toBeNull();

    const revoked = await post(
      worker,
      '/sign-ins/revoke',
      { id: cli.session.id, userId: ada.user.id },
      fromPages(cookie),
    );
    expect(await revoked.json()).toEqual({ ok: true });
    expect(await internalAdapter.findSession(cli.token)).toBeNull();
    expect(await whoIs(worker, cookie)).toBe('ada@example.com');
  });

  it('revoking this browser’s Sign-in signs the Account out here', async () => {
    const { worker, ada, mary, cookie } = await twoAccounts();
    const out = await post(
      worker,
      '/sign-ins/revoke',
      { id: mary.session.id, userId: mary.user.id },
      fromPages(cookie),
    );
    expect(await out.json()).toEqual({ active: ada.user.id });
    expect(await whoIs(worker, applyCookies(cookie, out))).toBe(
      'ada@example.com',
    );
  });

  it('signs out everywhere else, keeping this browser', async () => {
    const worker = make();
    const ada = await signIn(worker, 'ada@example.com');
    const cli = await signIn(worker, 'ada@example.com', 'acme-cli/1.0 (box)');
    const cookie = cookies(ada.active, ada.account);
    const { internalAdapter } = await worker.auth.$context;
    const out = await post(
      worker,
      '/sign-ins/revoke-others',
      { userId: ada.user.id },
      fromPages(cookie),
    );
    expect(await out.json()).toEqual({ ok: true, revoked: 1 });
    expect(await internalAdapter.findSession(cli.token)).toBeNull();
    expect(await whoIs(worker, cookie)).toBe('ada@example.com');
  });
});

describe('acting on the Account the page shows', () => {
  // The page shows Ada's lists; another tab has since switched to Mary.
  it('refuses to sign out everywhere else for another Account', async () => {
    const { worker, ada, mary, cookie } = await twoAccounts();
    const cli = await signIn(worker, 'mary@example.com', 'acme-cli/1.0 (box)');
    const { internalAdapter } = await worker.auth.$context;
    const out = await post(
      worker,
      '/sign-ins/revoke-others',
      { userId: ada.user.id },
      fromPages(cookie),
    );
    expect(out.status).toBe(409);
    expect(await out.json()).toMatchObject({ error: 'account_changed' });
    expect(await internalAdapter.findSession(cli.token)).not.toBeNull();
    expect(await internalAdapter.findSession(mary.token)).not.toBeNull();
  });

  it('refuses to revoke a Sign-in for another Account', async () => {
    const { worker, ada, mary, cookie } = await twoAccounts();
    const { internalAdapter } = await worker.auth.$context;
    const out = await post(
      worker,
      '/sign-ins/revoke',
      { id: mary.session.id, userId: ada.user.id },
      fromPages(cookie),
    );
    expect(out.status).toBe(409);
    expect(await internalAdapter.findSession(mary.token)).not.toBeNull();
  });

  it('refuses to revoke a Grant for another Account', async () => {
    const { worker, ada, cookie } = await twoAccounts();
    const out = await post(
      worker,
      '/grants/revoke',
      { id: 'grant', userId: ada.user.id },
      fromPages(cookie),
    );
    expect(out.status).toBe(409);
  });

  it('needs the Account the page shows', async () => {
    const { worker, mary, cookie } = await twoAccounts();
    for (const [path, payload] of [
      ['/sign-ins/revoke', { id: mary.session.id }],
      ['/sign-ins/revoke-others', {}],
      ['/grants/revoke', { id: 'grant' }],
    ] as const) {
      const response = await post(worker, path, payload, fromPages(cookie));
      expect(response.status).toBe(400);
    }
  });
});

describe('the Device Screen', () => {
  it('reads a code’s app without claiming it', async () => {
    const { worker, cookie } = await twoAccounts();
    const code = await deviceCode(worker);
    const response = await get(
      worker,
      `/device/request?user_code=${code.user_code}`,
      { cookie },
    );
    expect(await response.json()).toEqual({
      userCode: code.user_code,
      status: 'pending',
      app: 'acme-cli',
    });
    expect((await deviceRecord(worker, code.user_code))?.userId).toBeNull();
  });

  it('accepts the code as typed, with a dash and in lower case', async () => {
    const worker = make();
    const code = await deviceCode(worker);
    const typed = `${code.user_code.slice(0, 4)}-${code.user_code.slice(4)}`;
    const response = await get(
      worker,
      `/device/request?user_code=${typed.toLowerCase()}`,
    );
    expect(response.status).toBe(200);
  });

  it('says when a code is unknown', async () => {
    const response = await get(make(), '/device/request?user_code=NOPE1234');
    expect(response.status).toBe(400);
    expect(await response.json()).toMatchObject({ error: 'invalid_code' });
  });

  it.each([
    [true, 'approved'],
    [false, 'denied'],
  ] as const)(
    'answers (approve: %s) as a chosen Account that is not active',
    async (approve, status) => {
      const { worker, ada, cookie } = await twoAccounts();
      const code = await deviceCode(worker);
      const response = await post(
        worker,
        '/device/answer',
        { userCode: code.user_code, userId: ada.user.id, approve },
        fromPages(cookie),
      );
      expect(response.status).toBe(200);
      expect(response.headers.getSetCookie()).toEqual([]);
      expect(await response.json()).toEqual({ status });
      expect(await deviceRecord(worker, code.user_code)).toMatchObject({
        status,
        userId: ada.user.id,
      });
      expect(await whoIs(worker, cookie)).toBe('mary@example.com');
    },
  );

  it('gives the Device a Sign-in of the Approving Account', async () => {
    const { worker, ada, cookie } = await twoAccounts();
    const code = await deviceCode(worker);
    await post(
      worker,
      '/device/answer',
      { userCode: code.user_code, userId: ada.user.id, approve: true },
      fromPages(cookie),
    );
    const issued = await body<{ access_token: string }>(
      await worker.handler(
        new Request(`${baseURL}/api/auth/device/token`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'user-agent': 'acme-cli/1.0 (laptop)',
          },
          body: JSON.stringify({
            grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
            device_code: code.device_code,
            client_id: 'acme-cli',
          }),
        }),
      ),
    );
    expect(await whoIs(worker, '')).toBeUndefined();
    const me = await get(worker, '/get-session', {
      authorization: `Bearer ${issued.access_token}`,
    });
    expect(await me.json()).toMatchObject({ user: { id: ada.user.id } });
  });

  it('takes back a code another Account of this browser claimed', async () => {
    const { worker, ada, mary, cookie } = await twoAccounts();
    const code = await deviceCode(worker);
    // better-auth's own lookup claims the code for the Active Account.
    await get(worker, `/device?user_code=${code.user_code}`, { cookie });
    expect((await deviceRecord(worker, code.user_code))?.userId).toBe(
      mary.user.id,
    );
    const response = await post(
      worker,
      '/device/answer',
      { userCode: code.user_code, userId: ada.user.id, approve: true },
      fromPages(cookie),
    );
    expect(response.status).toBe(200);
    expect(await deviceRecord(worker, code.user_code)).toMatchObject({
      status: 'approved',
      userId: ada.user.id,
    });
  });

  it('leaves a code claimed by someone else theirs', async () => {
    const { worker, ada, cookie } = await twoAccounts();
    const eve = await signIn(worker, 'eve@example.com');
    const code = await deviceCode(worker);
    await get(worker, `/device?user_code=${code.user_code}`, {
      authorization: `Bearer ${eve.token}`,
    });
    const response = await post(
      worker,
      '/device/answer',
      { userCode: code.user_code, userId: ada.user.id, approve: true },
      fromPages(cookie),
    );
    expect(response.status).toBe(403);
    expect(await deviceRecord(worker, code.user_code)).toMatchObject({
      status: 'pending',
      userId: eve.user.id,
    });
  });

  it('refuses an Account this browser does not hold, and a second answer', async () => {
    const { worker, ada, cookie } = await twoAccounts();
    const eve = await signIn(worker, 'eve@example.com');
    const code = await deviceCode(worker);
    const answer = (userId: string) =>
      post(
        worker,
        '/device/answer',
        { userCode: code.user_code, userId, approve: true },
        fromPages(cookie),
      );
    expect((await answer(eve.user.id)).status).toBe(403);
    expect((await answer(ada.user.id)).status).toBe(200);
    const again = await answer(ada.user.id);
    expect(again.status).toBe(400);
    expect(await again.json()).toMatchObject({ error: 'already_answered' });
  });
});

const RESOURCE = 'https://api.example.com';
const REDIRECT = 'https://notes.example.org/callback';

const withOAuth = () =>
  make({
    oauth: {
      resources: { [RESOURCE]: { 'notes:read': 'Read your notes' } },
    },
  });

const base64url = (bytes: ArrayBuffer) =>
  Buffer.from(bytes).toString('base64url');

/** Registers a client and starts an authorization in the browser: the
 * worker sends it to the Consent Screen with a signed query. */
const startAuthorization = async (worker: Worker, cookie: string) => {
  const client = await body<{ client_id: string }>(
    await post(worker, '/oauth2/register', {
      client_name: 'Notes',
      redirect_uris: [REDIRECT],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code'],
      response_types: ['code'],
    }),
  );
  const verifier = 'v'.repeat(64);
  const challenge = base64url(
    await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)),
  );
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: client.client_id,
    redirect_uri: REDIRECT,
    scope: 'openid notes:read',
    state: 'state-1',
    code_challenge: challenge,
    code_challenge_method: 'S256',
    resource: RESOURCE,
  });
  const authorize = await get(worker, `/oauth2/authorize?${query}`, {
    cookie,
  });
  const location = new URL(authorize.headers.get('location')!, baseURL);
  expect(location.pathname).toBe('/consent');
  return { clientId: client.client_id, search: location.search, verifier };
};

describe('the Consent Screen', () => {
  it('describes the request from the signed query', async () => {
    const { worker, cookie } = await twoAccounts(withOAuth());
    const { clientId, search } = await startAuthorization(worker, cookie);
    const response = await get(worker, `/consent/request${search}`);
    expect(await response.json()).toEqual({
      client: { id: clientId, name: 'Notes', icon: null, uri: null },
      scopes: [
        { name: 'openid', description: 'Know who you are' },
        { name: 'notes:read', description: 'Read your notes' },
      ],
    });
  });

  it('refuses a tampered query', async () => {
    const { worker, cookie } = await twoAccounts(withOAuth());
    const { search } = await startAuthorization(worker, cookie);
    const tampered = search.replace('notes%3Aread', 'notes%3Awrite');
    expect(tampered).not.toBe(search);
    const response = await get(worker, `/consent/request${tampered}`);
    expect(response.status).toBe(400);
  });

  it('grants as a chosen Account that is not active', async () => {
    const { worker, ada, cookie } = await twoAccounts(withOAuth());
    const { clientId, search, verifier } = await startAuthorization(
      worker,
      cookie,
    );
    const answered = await post(
      worker,
      '/consent/answer',
      { query: search.slice(1), userId: ada.user.id, accept: true },
      fromPages(cookie),
    );
    expect(answered.status).toBe(200);
    expect(answered.headers.getSetCookie()).toEqual([]);
    const { url } = await body<{ url: string }>(answered);
    const redirect = new URL(url);
    expect(redirect.origin + redirect.pathname).toBe(REDIRECT);
    expect(redirect.searchParams.get('state')).toBe('state-1');
    const code = redirect.searchParams.get('code')!;
    expect(code).toBeTruthy();
    expect(await whoIs(worker, cookie)).toBe('mary@example.com');

    const { adapter } = await worker.auth.$context;
    const consents = await adapter.findMany<{ userId: string }>({
      model: 'oauthConsent',
      where: [{ field: 'clientId', value: clientId }],
    });
    expect(consents.map((consent) => consent.userId)).toEqual([ada.user.id]);

    const token = await body<{ access_token: string }>(
      await worker.handler(
        new Request(`${baseURL}/api/auth/oauth2/token`, {
          method: 'POST',
          headers: { 'content-type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'authorization_code',
            code,
            redirect_uri: REDIRECT,
            client_id: clientId,
            code_verifier: verifier,
            resource: RESOURCE,
          }),
        }),
      ),
    );
    expect(decodeJwt(token.access_token).sub).toBe(ada.user.id);
  });

  it('denies, sending the client an access_denied', async () => {
    const { worker, ada, cookie } = await twoAccounts(withOAuth());
    const { search } = await startAuthorization(worker, cookie);
    const answered = await post(
      worker,
      '/consent/answer',
      { query: search.slice(1), userId: ada.user.id, accept: false },
      fromPages(cookie),
    );
    const { url } = await body<{ url: string }>(answered);
    expect(new URL(url).searchParams.get('error')).toBe('access_denied');
  });

  it('refuses an Account this browser does not hold', async () => {
    const { worker, cookie } = await twoAccounts(withOAuth());
    const eve = await signIn(worker, 'eve@example.com');
    const { search } = await startAuthorization(worker, cookie);
    const answered = await post(
      worker,
      '/consent/answer',
      { query: search.slice(1), userId: eve.user.id, accept: true },
      fromPages(cookie),
    );
    expect(answered.status).toBe(403);
  });
});

describe('Grants', () => {
  it('lists the Active Account’s Grants in words and revokes one', async () => {
    const { worker, ada, mary, cookie } = await twoAccounts(withOAuth());
    const { search } = await startAuthorization(worker, cookie);
    await post(
      worker,
      '/consent/answer',
      { query: search.slice(1), userId: ada.user.id, accept: true },
      fromPages(cookie),
    );
    const adaCookie = cookies(ada.active, ada.account);
    const { grants } = await body<{
      grants: Array<{
        id: string;
        client: { name: string };
        scopes: unknown[];
      }>;
    }>(await get(worker, '/grants', { cookie: adaCookie }));
    expect(grants).toEqual([
      expect.objectContaining({
        client: expect.objectContaining({ name: 'Notes' }),
        scopes: [
          { name: 'openid', description: 'Know who you are' },
          { name: 'notes:read', description: 'Read your notes' },
        ],
      }),
    ]);
    // Mary, active in the other cookie, has none and cannot remove Ada's.
    expect(await body(await get(worker, '/grants', { cookie }))).toEqual({
      grants: [],
    });
    const foreign = await post(
      worker,
      '/grants/revoke',
      { id: grants[0]!.id, userId: mary.user.id },
      fromPages(cookie),
    );
    expect(foreign.status).toBe(404);

    const revoked = await post(
      worker,
      '/grants/revoke',
      { id: grants[0]!.id, userId: ada.user.id },
      fromPages(adaCookie),
    );
    expect(await revoked.json()).toEqual({ ok: true });
    expect(
      await body(await get(worker, '/grants', { cookie: adaCookie })),
    ).toEqual({ grants: [] });
  });

  it('is empty without the Authorization Server Role', async () => {
    const { worker, cookie } = await twoAccounts();
    expect(await body(await get(worker, '/grants', { cookie }))).toEqual({
      grants: [],
    });
  });
});

describe('no token reaches a page', () => {
  it('strips Sign-in tokens from every browser-callable response', async () => {
    const worker = withOAuth();
    const ada = await signIn(worker, 'ada@example.com');
    const mary = await signIn(worker, 'mary@example.com');
    const cli = await signIn(worker, 'mary@example.com', 'acme-cli/1 (box)');
    const cookie = cookies(mary.active, ada.account, mary.account);
    const tokens = [ada.token, mary.token, cli.token];

    const responses = [
      await get(worker, '/get-session', { cookie }),
      await get(worker, '/get-session?disableCookieCache=true', { cookie }),
      await get(worker, '/list-sessions', { cookie }),
      await get(worker, '/multi-session/list-device-sessions', { cookie }),
      await post(
        worker,
        '/multi-session/set-active',
        { sessionToken: mary.token },
        { cookie },
      ),
      await get(worker, '/accounts', { cookie }),
      await get(worker, '/sign-ins', { cookie }),
      await get(worker, '/grants', { cookie }),
      await post(
        worker,
        '/accounts/switch',
        { userId: ada.user.id },
        { cookie },
      ),
    ];
    for (const response of responses) {
      expect(response.status).toBeLessThan(400);
      expect(response.headers.has('set-auth-token')).toBe(false);
      expect(
        response.headers.get('access-control-expose-headers') ?? '',
      ).not.toContain('set-auth-token');
      const text = await response.text();
      for (const token of tokens) expect(text).not.toContain(token);
    }
  });

  it('still hands a Device its token after Device Login', async () => {
    const { worker, ada, cookie } = await twoAccounts();
    const code = await deviceCode(worker);
    await post(
      worker,
      '/device/answer',
      { userCode: code.user_code, userId: ada.user.id, approve: true },
      fromPages(cookie),
    );
    const issued = await body<{ access_token?: string }>(
      await postAsProgram(worker, '/device/token', {
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        device_code: code.device_code,
        client_id: 'acme-cli',
      }),
    );
    expect(issued.access_token).toBeTruthy();
  });
});

describe('who may call', () => {
  const tokenRequest = (deviceCode: string) => ({
    grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    device_code: deviceCode,
    client_id: 'acme-cli',
  });

  it('refuses a sibling page answering a Device Login, so it cannot mint a token', async () => {
    const { worker, ada, cookie } = await twoAccounts();
    const code = await deviceCode(worker);
    const answered = await post(
      worker,
      '/device/answer',
      { userCode: code.user_code, userId: ada.user.id, approve: true },
      { cookie, origin },
    );
    expect(answered.status).toBe(403);
    expect(await deviceRecord(worker, code.user_code)).toMatchObject({
      status: 'pending',
      userId: null,
    });
  });

  it('refuses a sibling page approving through better-auth’s own endpoints', async () => {
    const { worker, cookie } = await twoAccounts();
    const code = await deviceCode(worker);
    await get(worker, `/device?user_code=${code.user_code}`, { cookie });
    for (const path of ['/device/approve', '/device/deny']) {
      const response = await post(
        worker,
        path,
        { userCode: code.user_code },
        { cookie, origin },
      );
      expect(response.status).toBe(403);
    }
    expect((await deviceRecord(worker, code.user_code))?.status).toBe(
      'pending',
    );
  });

  it('refuses a sibling page granting consent', async () => {
    const { worker, ada, cookie } = await twoAccounts(withOAuth());
    const { search } = await startAuthorization(worker, cookie);
    const viaPages = await post(
      worker,
      '/consent/answer',
      { query: search.slice(1), userId: ada.user.id, accept: true },
      { cookie, origin },
    );
    expect(viaPages.status).toBe(403);
    const direct = await post(
      worker,
      '/oauth2/consent',
      { accept: true, oauth_query: search.slice(1) },
      { cookie, origin },
    );
    expect(direct.status).toBe(403);
  });

  it('refuses a sibling page managing Sign-ins and Grants', async () => {
    const { worker, mary, cookie } = await twoAccounts();
    for (const [path, payload] of [
      ['/sign-ins/revoke', { id: mary.session.id, userId: mary.user.id }],
      ['/sign-ins/revoke-others', { userId: mary.user.id }],
      ['/grants/revoke', { id: 'any', userId: mary.user.id }],
    ] as const) {
      const response = await post(worker, path, payload, { cookie, origin });
      expect(response.status).toBe(403);
    }
    expect(await whoIs(worker, cookie)).toBe('mary@example.com');
  });

  it('keeps the Accounts endpoints open to a sibling app', async () => {
    const { worker, ada, cookie } = await twoAccounts();
    const switched = await post(
      worker,
      '/accounts/switch',
      { userId: ada.user.id },
      { cookie, origin },
    );
    expect(switched.status).toBe(200);
  });

  it('refuses Device Login to a browser, from any origin', async () => {
    const { worker, ada, cookie } = await twoAccounts();
    for (const headers of [
      { origin },
      { origin: baseURL },
      { 'sec-fetch-site': 'same-site' },
    ]) {
      const started = await post(
        worker,
        '/device/code',
        { client_id: 'acme-cli' },
        headers,
      );
      expect(started.status).toBe(403);
    }

    const code = await deviceCode(worker);
    await post(
      worker,
      '/device/answer',
      { userCode: code.user_code, userId: ada.user.id, approve: true },
      fromPages(cookie),
    );
    for (const headers of [
      { origin },
      { origin: baseURL },
      { 'sec-fetch-site': 'same-origin' },
    ]) {
      const polled = await worker.handler(
        new Request(`${baseURL}/api/auth/device/token`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...headers },
          body: JSON.stringify(tokenRequest(code.device_code)),
        }),
      );
      expect(polled.status).toBe(403);
      expect(await polled.text()).not.toContain('access_token');
    }
    // The program still gets its token.
    const issued = await body<{ access_token?: string }>(
      await postAsProgram(
        worker,
        '/device/token',
        tokenRequest(code.device_code),
      ),
    );
    expect(issued.access_token).toBeTruthy();
  });
});
