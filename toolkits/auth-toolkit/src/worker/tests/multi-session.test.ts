import { makeSignature } from 'better-auth/crypto';
import { describe, expect, it } from 'vitest';
import { memoryPrimaryDatabase } from '../../infra/primary/sqlite/memory/index.js';
import { createAuthWorker } from '../worker.js';

const baseURL = 'https://auth.example.com';
const secret = 'test-secret-test-secret-test-secret';
const origin = 'https://app.example.com';

const make = (multiSession?: { enabled?: boolean; maximumAccounts?: number }) =>
  createAuthWorker({
    baseURL,
    secret,
    google: { clientId: 'test', clientSecret: 'test' },
    trustedOrigins: [origin],
    branding: { appName: 'Example' },
    database: memoryPrimaryDatabase(),
    multiSession,
  });

type Worker = ReturnType<typeof make>;

/** Signs a User in the way the browser ends up after a sign-in with the
 * plugin on: a Session in the Primary Database, its signed token as the
 * session cookie, and the same token under the account's own cookie name. */
const signIn = async (worker: Worker, email: string) => {
  const context = await worker.auth.$context;
  const user = await context.internalAdapter.createUser(
    { name: email.split('@')[0]!, email, emailVerified: true },
    { method: 'email-password' },
  );
  const session = await context.internalAdapter.createSession(user.id);
  const value = encodeURIComponent(
    `${session.token}.${await makeSignature(session.token, secret)}`,
  );
  const name = context.authCookies.sessionToken.name;
  return {
    user,
    token: session.token,
    active: `${name}=${value}`,
    account: `${name}_multi-${session.token.toLowerCase()}=${value}`,
  };
};

const cookieHeader = (...parts: string[]) => parts.join('; ');

const get = (worker: Worker, path: string, cookie: string) =>
  worker.handler(
    new Request(`${baseURL}/api/auth${path}`, { headers: { cookie } }),
  );

const post = (worker: Worker, path: string, cookie: string, body = {}) =>
  worker.handler(
    new Request(`${baseURL}/api/auth${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie, origin },
      body: JSON.stringify(body),
    }),
  );

const whoIs = async (worker: Worker, cookie: string) =>
  (
    (await (await get(worker, '/get-session', cookie)).json()) as {
      user: { email: string };
    } | null
  )?.user.email;

const setCookies = (response: Response) => response.headers.getSetCookie();

describe('Signed-in Accounts', () => {
  it('is off unless enabled: the account endpoints do not exist', async () => {
    for (const worker of [make(), make({}), make({ enabled: false })]) {
      const ada = await signIn(worker, 'ada@example.com');
      const response = await get(
        worker,
        '/multi-session/list-device-sessions',
        ada.active,
      );
      expect(response.status).toBe(404);
    }
  });

  it('lists every Signed-in Account and keeps the first when a second signs in', async () => {
    const worker = make({ enabled: true });
    const ada = await signIn(worker, 'ada@example.com');
    const mary = await signIn(worker, 'mary@example.com');
    const cookie = cookieHeader(mary.active, ada.account, mary.account);

    expect(await whoIs(worker, cookie)).toBe('mary@example.com');
    const listed = (await (
      await get(worker, '/multi-session/list-device-sessions', cookie)
    ).json()) as Array<{ user: { email: string } }>;
    expect(listed.map((entry) => entry.user.email).sort()).toEqual([
      'ada@example.com',
      'mary@example.com',
    ]);
  });

  it('switching changes what Server-Side Verification sees', async () => {
    const worker = make({ enabled: true });
    const ada = await signIn(worker, 'ada@example.com');
    const mary = await signIn(worker, 'mary@example.com');
    const cookie = cookieHeader(mary.active, ada.account, mary.account);

    const switched = await post(worker, '/multi-session/set-active', cookie, {
      sessionToken: ada.token,
    });
    expect(switched.status).toBe(200);
    const refreshed = setCookies(switched).find((value) =>
      value.startsWith(`${ada.active.split('=')[0]}=`),
    );
    expect(refreshed).toBeDefined();
    // A Consumer Backend forwards the browser's cookies verbatim.
    const afterSwitch = cookieHeader(
      refreshed!.split(';')[0]!,
      ada.account,
      mary.account,
    );
    expect(await whoIs(worker, afterSwitch)).toBe('ada@example.com');
  });

  it('signing out one account leaves the other and makes it active', async () => {
    const worker = make({ enabled: true });
    const ada = await signIn(worker, 'ada@example.com');
    const mary = await signIn(worker, 'mary@example.com');
    const cookie = cookieHeader(mary.active, ada.account, mary.account);
    const context = await worker.auth.$context;

    const revoked = await post(worker, '/multi-session/revoke', cookie, {
      sessionToken: mary.token,
    });
    expect(revoked.status).toBe(200);
    expect(await context.internalAdapter.findSession(mary.token)).toBeNull();
    expect(await context.internalAdapter.findSession(ada.token)).not.toBeNull();
    const nextActive = setCookies(revoked).find(
      (value) =>
        value.startsWith(`${ada.active.split('=')[0]}=`) &&
        !value.includes('Max-Age=0'),
    );
    expect(nextActive).toBeDefined();
    expect(
      await whoIs(
        worker,
        cookieHeader(nextActive!.split(';')[0]!, ada.account),
      ),
    ).toBe('ada@example.com');
  });

  it('signing out of all accounts leaves nothing', async () => {
    const worker = make({ enabled: true });
    const ada = await signIn(worker, 'ada@example.com');
    const mary = await signIn(worker, 'mary@example.com');
    const cookie = cookieHeader(mary.active, ada.account, mary.account);
    const context = await worker.auth.$context;

    const out = await post(worker, '/sign-out', cookie);
    expect(out.status).toBe(200);
    expect(await context.internalAdapter.findSession(ada.token)).toBeNull();
    expect(await context.internalAdapter.findSession(mary.token)).toBeNull();
    const expired = setCookies(out).filter((value) =>
      value.includes('Max-Age=0'),
    );
    expect(expired.some((value) => value.includes('_multi-'))).toBe(true);
    expect(await whoIs(worker, cookie)).toBeUndefined();
  });

  it('leaves a Device Login Session alone', async () => {
    const worker = make({ enabled: true });
    const context = await worker.auth.$context;
    const user = await context.internalAdapter.createUser(
      { name: 'Ada', email: 'ada@example.com', emailVerified: true },
      { method: 'email-password' },
    );
    const session = await context.internalAdapter.createSession(user.id);
    const bearer = { authorization: `Bearer ${session.token}` };
    const code = (await (
      await worker.handler(
        new Request(`${baseURL}/api/auth/device/code`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ client_id: 'demo' }),
        }),
      )
    ).json()) as { device_code: string; user_code: string };
    await worker.handler(
      new Request(`${baseURL}/api/auth/device?user_code=${code.user_code}`, {
        headers: bearer,
      }),
    );
    await worker.handler(
      new Request(`${baseURL}/api/auth/device/approve`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...bearer },
        body: JSON.stringify({ userCode: code.user_code }),
      }),
    );
    const issued = await worker.handler(
      new Request(`${baseURL}/api/auth/device/token`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
          device_code: code.device_code,
          client_id: 'demo',
        }),
      }),
    );
    expect(issued.status).toBe(200);
    expect(setCookies(issued).some((value) => value.includes('_multi-'))).toBe(
      false,
    );
    const { access_token } = (await issued.json()) as { access_token: string };
    const me = await worker.handler(
      new Request(`${baseURL}/api/auth/get-session`, {
        headers: { authorization: `Bearer ${access_token}` },
      }),
    );
    expect(await me.json()).toMatchObject({ user: { id: user.id } });
  });
});
