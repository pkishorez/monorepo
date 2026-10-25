import { memory } from '../../database/sqlite/memory/index.js';
import { describe, expect, it } from 'vitest';
import {
  applyCookies,
  baseURL,
  cookies,
  get,
  makeWith,
  post,
  postAsProgram,
  signIn,
  whoIs,
} from './fixture.js';

const make = makeWith(memory);

const listed = async (worker: ReturnType<typeof make>, cookie: string) =>
  (await (
    await get(worker, '/multi-session/list-device-sessions', { cookie })
  ).json()) as Array<{ user: { email: string }; session: { id: string } }>;

describe('multi-session, as better-auth serves it', () => {
  it('lists every Account in the browser, without their tokens', async () => {
    const worker = make();
    const ada = await signIn(worker, 'ada@example.com');
    const mary = await signIn(worker, 'mary@example.com');
    const cookie = cookies(mary.active, ada.account, mary.account);

    expect(await whoIs(worker, cookie)).toBe('mary@example.com');
    const entries = await listed(worker, cookie);
    expect(entries.map((entry) => entry.user.email).sort()).toEqual([
      'ada@example.com',
      'mary@example.com',
    ]);
    for (const entry of entries) {
      expect(entry.session.id).toBeTruthy();
      expect(entry.session).not.toHaveProperty('token');
    }
  });

  it('lists nobody for a browser with no Account', async () => {
    expect(await listed(make(), '')).toEqual([]);
  });

  it('signing out of all Accounts leaves nothing', async () => {
    const worker = make();
    const ada = await signIn(worker, 'ada@example.com');
    const mary = await signIn(worker, 'mary@example.com');
    const cookie = cookies(mary.active, ada.account, mary.account);
    const context = await worker.auth.$context;

    const out = await post(worker, '/sign-out', {}, { cookie });
    expect(out.status).toBe(200);
    expect(await context.internalAdapter.findSession(ada.token)).toBeNull();
    expect(await context.internalAdapter.findSession(mary.token)).toBeNull();
    const expired = out.headers
      .getSetCookie()
      .filter((value) => value.includes('Max-Age=0'));
    expect(expired.some((value) => value.includes('_multi-'))).toBe(true);
    expect(await whoIs(worker, applyCookies(cookie, out))).toBeUndefined();
  });

  it('leaves a Device Login Session out of the browser', async () => {
    const worker = make();
    const ada = await signIn(worker, 'ada@example.com');
    const bearer = { authorization: `Bearer ${ada.token}` };
    const code = (await (
      await postAsProgram(worker, '/device/code', { client_id: 'demo' })
    ).json()) as { device_code: string; user_code: string };
    await get(worker, `/device?user_code=${code.user_code}`, bearer);
    await postAsProgram(
      worker,
      '/device/approve',
      { userCode: code.user_code },
      bearer,
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
    expect(
      issued.headers.getSetCookie().some((value) => value.includes('_multi-')),
    ).toBe(false);
    const { access_token } = (await issued.json()) as { access_token: string };
    const me = await get(worker, '/get-session', {
      authorization: `Bearer ${access_token}`,
    });
    expect(await me.json()).toMatchObject({ user: { id: ada.user.id } });
  });
});
