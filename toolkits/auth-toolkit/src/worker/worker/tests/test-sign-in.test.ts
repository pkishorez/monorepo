import { describe, expect, it, vi } from 'vitest';
import { memory } from '../../database/sqlite/memory/index.js';
import {
  applyCookies,
  baseURL,
  get,
  makeWith,
  post,
  postAsProgram,
  whoIs,
} from './fixture.js';

const make = makeWith(memory);
type Worker = ReturnType<typeof make>;

const testSignIn = (worker: Worker, body: object, cookie = '') =>
  post(worker, '/test/sign-in', body, cookie ? { cookie } : {});

const listed = async (worker: Worker, cookie: string) =>
  (await (
    await get(worker, '/multi-session/list-device-sessions', { cookie })
  ).json()) as Array<{ user: { email: string }; session: { id: string } }>;

describe('Test Sign-In', () => {
  it('does not exist unless configured', async () => {
    const response = await testSignIn(make(), { email: 'ada@example.test' });
    expect(response.status).toBe(404);
  });

  it('refuses an email that is not a .test email', async () => {
    const worker = make({ testUsers: {} });
    for (const email of [
      'ada@example.com',
      'example.test',
      '',
      'a@b.testing',
    ]) {
      const response = await testSignIn(worker, { email });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ code: 'NOT_A_TEST_EMAIL' });
    }
    expect(await testSignIn(worker, {}).then((r) => r.status)).toBe(400);
  });

  it('needs exactly the key when one is configured', async () => {
    const worker = make({ testUsers: { key: 'sesame' } });
    for (const body of [
      { email: 'ada@example.test' },
      { email: 'ada@example.test', key: 'wrong' },
      { email: 'ada@example.test', key: '' },
    ]) {
      const response = await testSignIn(worker, body);
      expect(response.status).toBe(401);
      expect(await response.json()).toMatchObject({ code: 'WRONG_KEY' });
    }
    const right = await testSignIn(worker, {
      email: 'ada@example.test',
      key: 'sesame',
    });
    expect(right.status).toBe(200);
  });

  it('needs no key when none is configured', async () => {
    const response = await testSignIn(make({ testUsers: {} }), {
      email: 'ada@example.test',
    });
    expect(response.status).toBe(200);
  });

  it('asks `allow`, with the email lowercased', async () => {
    const allow = vi.fn((email: string) => email.startsWith('ada@'));
    const worker = make({ testUsers: { allow } });
    const refused = await testSignIn(worker, { email: 'eve@example.test' });
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: 'NOT_ALLOWED' });
    const allowed = await testSignIn(worker, { email: ' ADA@Example.TEST ' });
    expect(allowed.status).toBe(200);
    expect(allow).toHaveBeenLastCalledWith('ada@example.test');
  });

  it('signs the browser in, answering with the User and no token', async () => {
    const worker = make({ testUsers: {} });
    const response = await testSignIn(worker, { email: 'Ada@Example.test' });
    expect(response.status).toBe(200);
    const text = await response.text();
    expect(text).not.toContain('token');
    const { user } = JSON.parse(text) as {
      user: { email: string; name: string; emailVerified: boolean };
    };
    expect(user).toMatchObject({
      email: 'ada@example.test',
      name: 'ada',
      emailVerified: true,
    });
    expect(response.headers.get('set-auth-token')).toBeNull();
    const set = response.headers.getSetCookie();
    expect(set.some((value) => /HttpOnly/i.test(value))).toBe(true);
    expect(set.some((value) => value.includes('_multi-'))).toBe(true);
    expect(await whoIs(worker, applyCookies('', response))).toBe(
      'ada@example.test',
    );
  });

  it('adds a second Test User as a second Account, to switch between', async () => {
    const worker = make({ testUsers: {} });
    let cookie = applyCookies(
      '',
      await testSignIn(worker, { email: 'ada@example.test' }),
    );
    cookie = applyCookies(
      cookie,
      await testSignIn(worker, { email: 'mary@example.test' }, cookie),
    );
    expect(await whoIs(worker, cookie)).toBe('mary@example.test');
    const entries = await listed(worker, cookie);
    expect(entries.map((entry) => entry.user.email).sort()).toEqual([
      'ada@example.test',
      'mary@example.test',
    ]);

    const ada = entries.find((entry) => entry.user.email.startsWith('ada'))!;
    const context = await worker.auth.$context;
    const sessions = await context.internalAdapter.listSessions(
      (await context.internalAdapter.findUserByEmail('ada@example.test'))!.user
        .id,
    );
    const token = sessions.find((each) => each.id === ada.session.id)!.token;
    const switched = await post(
      worker,
      '/multi-session/set-active',
      { sessionToken: token },
      { cookie },
    );
    expect(switched.status).toBe(200);
    expect(await whoIs(worker, applyCookies(cookie, switched))).toBe(
      'ada@example.test',
    );
  });

  it('refuses a new Account past `maxAccounts`, keeping the ones held', async () => {
    const worker = make({ testUsers: {}, maxAccounts: 1 });
    const cookie = applyCookies(
      '',
      await testSignIn(worker, { email: 'ada@example.test' }),
    );
    const refused = await testSignIn(
      worker,
      { email: 'mary@example.test' },
      cookie,
    );
    expect(refused.status).toBe(403);
    expect(await refused.json()).toMatchObject({ code: 'TOO_MANY_ACCOUNTS' });
    expect(refused.headers.getSetCookie()).toEqual([]);
    expect(await whoIs(worker, cookie)).toBe('ada@example.test');

    const again = await testSignIn(
      worker,
      { email: 'ada@example.test' },
      cookie,
    );
    expect(again.status).toBe(200);
  });

  it('creates a new Test User once when two sign in at the same time', async () => {
    const worker = make({ testUsers: {} });
    const answers = await Promise.all(
      [1, 2, 3].map(() => testSignIn(worker, { email: 'ada@example.test' })),
    );
    expect(answers.map((answer) => answer.status)).toEqual([200, 200, 200]);
    const ids = await Promise.all(
      answers.map(
        async (answer) =>
          ((await answer.json()) as { user: { id: string } }).user.id,
      ),
    );
    expect(new Set(ids).size).toBe(1);
  });

  it('signs the same email in as the same User', async () => {
    const worker = make({ testUsers: {} });
    const id = async (email: string) =>
      (
        (await (await testSignIn(worker, { email })).json()) as {
          user: { id: string };
        }
      ).user.id;
    expect(await id('ada@example.test')).toBe(await id('ADA@example.test'));
  });

  it('does not ask `admit`', async () => {
    const admit = vi.fn(() => false);
    const worker = make({ testUsers: {}, admit });
    const response = await testSignIn(worker, { email: 'ada@example.test' });
    expect(response.status).toBe(200);
    expect(admit).not.toHaveBeenCalled();
  });

  it('works for a program, with no Origin', async () => {
    const response = await postAsProgram(
      make({ testUsers: {} }),
      '/test/sign-in',
      { email: 'ada@example.test' },
    );
    expect(response.status).toBe(200);
  });

  it('continues an authorization, as a finished Google sign-in does', async () => {
    const REDIRECT = 'https://notes.example.org/callback';
    const worker = make({
      testUsers: {},
      oauth: {
        resources: {
          'https://api.example.com': { 'notes:read': 'Read your notes' },
        },
      },
    });
    const client = (await (
      await post(worker, '/oauth2/register', {
        client_name: 'Notes',
        redirect_uris: [REDIRECT],
        token_endpoint_auth_method: 'none',
        grant_types: ['authorization_code'],
        response_types: ['code'],
      })
    ).json()) as { client_id: string };
    const query = new URLSearchParams({
      response_type: 'code',
      client_id: client.client_id,
      redirect_uri: REDIRECT,
      scope: 'openid notes:read',
      state: 'state-1',
      code_challenge: 'c'.repeat(43),
      code_challenge_method: 'S256',
      resource: 'https://api.example.com',
    });
    const authorize = await get(worker, `/oauth2/authorize?${query}`);
    const login = new URL(authorize.headers.get('location')!, baseURL);
    expect(login.pathname).toBe('/login');

    const response = await testSignIn(worker, {
      email: 'ada@example.test',
      oauth_query: login.search.slice(1),
    });
    expect(response.status).toBe(200);
    const { url } = (await response.json()) as { url: string };
    expect(new URL(url, baseURL).pathname).toBe('/consent');
  });
});
