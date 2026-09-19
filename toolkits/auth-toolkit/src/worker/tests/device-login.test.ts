import { afterEach, describe, expect, it, vi } from 'vitest';
import { memoryPrimaryDatabase } from '../../infra/primary/sqlite/memory/index.js';
import { createAuthWorker } from '../worker.js';

const baseURL = 'https://auth.example.com';
const DEVICE_CODE_GRANT = 'urn:ietf:params:oauth:grant-type:device_code';

const make = () =>
  createAuthWorker({
    baseURL,
    secret: 'test-secret-test-secret-test-secret',
    google: { clientId: 'test', clientSecret: 'test' },
    trustedOrigins: ['https://app.example.com'],
    branding: { appName: 'Example' },
    database: memoryPrimaryDatabase(),
  });

type Handler = ReturnType<typeof make>['handler'];

const post = (
  handler: Handler,
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
) =>
  handler(
    new Request(`${baseURL}/api/auth${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }),
  );

const get = (
  handler: Handler,
  path: string,
  headers: Record<string, string> = {},
) => handler(new Request(`${baseURL}/api/auth${path}`, { headers }));

const signedInUser = async (auth: ReturnType<typeof make>['auth']) => {
  const { internalAdapter } = await auth.$context;
  const user = await internalAdapter.createUser(
    { name: 'Ada', email: 'ada@example.com', emailVerified: true },
    { method: 'email-password' },
  );
  const session = await internalAdapter.createSession(user.id);
  return { user, bearer: { authorization: `Bearer ${session.token}` } };
};

describe('Device Login', () => {
  afterEach(() => vi.useRealTimers());

  it('is part of the Identity Role: no Authorization Server Role needed', async () => {
    const { handler } = make();
    const code = await post(handler, '/device/code', { client_id: 'demo' });
    expect(code.status).toBe(200);
    const body = (await code.json()) as {
      device_code: string;
      user_code: string;
      verification_uri: string;
      verification_uri_complete: string;
      interval: number;
      expires_in: number;
    };
    expect(body.verification_uri).toBe(`${baseURL}/device`);
    expect(body.verification_uri_complete).toBe(
      `${baseURL}/device?user_code=${body.user_code}`,
    );
    expect(body.interval).toBeGreaterThan(0);
  });

  it('issues a Session token once a signed-in User approves the code', async () => {
    const { auth, handler } = make();
    const { user, bearer } = await signedInUser(auth);
    const code = (await (
      await post(handler, '/device/code', { client_id: 'demo' })
    ).json()) as { device_code: string; user_code: string };

    const poll = () =>
      post(
        handler,
        '/device/token',
        {
          grant_type: DEVICE_CODE_GRANT,
          device_code: code.device_code,
          client_id: 'demo',
        },
        { 'user-agent': 'demo/1.2.0' },
      );
    expect(await (await poll()).json()).toMatchObject({
      error: 'authorization_pending',
    });
    expect(await (await poll()).json()).toMatchObject({ error: 'slow_down' });
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.now() + 10_000);

    // Approving requires the signed-in User to have looked the code up first.
    const pending = await get(
      handler,
      `/device?user_code=${code.user_code}`,
      bearer,
    );
    expect(await pending.json()).toMatchObject({
      status: 'pending',
      client_id: 'demo',
    });
    const anonymous = await post(handler, '/device/approve', {
      userCode: code.user_code,
    });
    expect(anonymous.status).toBe(401);
    const approved = await post(
      handler,
      '/device/approve',
      { userCode: code.user_code },
      bearer,
    );
    expect(approved.status).toBe(200);
    const lookUp = async () =>
      (
        (await (
          await get(handler, `/device?user_code=${code.user_code}`, bearer)
        ).json()) as { status?: string }
      ).status;
    expect(await lookUp()).toBe('approved');

    const issued = (await (await poll()).json()) as {
      access_token: string;
      token_type: string;
    };
    expect(issued.token_type).toBe('Bearer');
    expect(await lookUp()).not.toBe('approved');

    const me = await get(handler, '/get-session', {
      authorization: `Bearer ${issued.access_token}`,
    });
    expect(await me.json()).toMatchObject({ user: { id: user.id } });
    const sessions = await get(handler, '/list-sessions', {
      authorization: `Bearer ${issued.access_token}`,
    });
    expect(await sessions.json()).toContainEqual(
      expect.objectContaining({ userAgent: 'demo/1.2.0' }),
    );
    const out = await post(
      handler,
      '/sign-out',
      {},
      { authorization: `Bearer ${issued.access_token}` },
    );
    expect(out.status).toBe(200);
    const after = await get(handler, '/get-session', {
      authorization: `Bearer ${issued.access_token}`,
    });
    expect(await after.json()).toBeNull();
  });

  it('reports a denied code to the program', async () => {
    const { auth, handler } = make();
    const { bearer } = await signedInUser(auth);
    const code = (await (
      await post(handler, '/device/code', { client_id: 'demo' })
    ).json()) as { device_code: string; user_code: string };
    await get(handler, `/device?user_code=${code.user_code}`, bearer);
    await post(handler, '/device/deny', { userCode: code.user_code }, bearer);
    const denied = await post(handler, '/device/token', {
      grant_type: DEVICE_CODE_GRANT,
      device_code: code.device_code,
      client_id: 'demo',
    });
    expect(await denied.json()).toMatchObject({ error: 'access_denied' });
  });
});
