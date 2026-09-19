import { NodeServices } from '@effect/platform-node';
import { Effect, Exit, Layer } from 'effect';
import { FetchHttpClient } from 'effect/unstable/http';
import { RpcClient } from 'effect/unstable/rpc';
import { mkdtemp, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CliAuth } from '../index.js';

const authWorkerUrl = 'https://auth.example.com';
const user = { id: 'u1', email: 'ada@example.com', name: 'Ada' };

const fakeAuthWorker = (answers: string[]) => {
  const live = new Set(['env-token']);
  const calls: string[] = [];
  const json = (body: unknown, status = 200) => Response.json(body, { status });
  const fetch: typeof globalThis.fetch = async (input, init) => {
    const request = new Request(input, init);
    const path = new URL(request.url).pathname.replace('/api/auth', '');
    const token = request.headers.get('authorization')?.slice(7);
    calls.push(path);
    switch (path) {
      case '/device/code':
        return json({
          device_code: 'dc',
          user_code: 'ABCD',
          verification_uri_complete: `${authWorkerUrl}/device?user_code=ABCD`,
          interval: 0,
        });
      case '/device/token': {
        const answer = answers.shift()!;
        if (answer !== 'issued') return json({ error: answer }, 400);
        live.add('issued-token');
        return json({ access_token: 'issued-token', token_type: 'Bearer' });
      }
      case '/get-session':
        return json(token && live.has(token) ? { user } : null);
      case '/sign-out':
        live.delete(token ?? '');
        return json({ success: true });
      default:
        return json({}, 404);
    }
  };
  return { fetch, calls, live };
};

const run = <A, E>(
  worker: ReturnType<typeof fakeAuthWorker>,
  use: (auth: CliAuth['Service']) => Effect.Effect<A, E, CliAuth>,
) =>
  Effect.runPromiseExit(
    Effect.flatMap(CliAuth, use).pipe(
      Effect.provide(
        CliAuth.layer({ authWorkerUrl, app: 'demo cli' }).pipe(
          Layer.provide(NodeServices.layer),
          Layer.provide(
            FetchHttpClient.layer.pipe(
              Layer.provide(Layer.succeed(FetchHttpClient.Fetch, worker.fetch)),
            ),
          ),
        ),
      ),
    ),
  );

let config: string;

describe('CliAuth', () => {
  beforeEach(async () => {
    config = await mkdtemp(join(tmpdir(), 'auth-toolkit-'));
    vi.stubEnv('XDG_STATE_HOME', config);
    vi.spyOn(process.stderr, 'write').mockReturnValue(true);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it('logs in once the code is approved and keeps the Session in a private file', async () => {
    const worker = fakeAuthWorker([
      'authorization_pending',
      'slow_down',
      'issued',
    ]);
    expect(await run(worker, (auth) => auth.login)).toEqual(Exit.succeed(user));
    expect(
      worker.calls.filter((path) => path === '/device/token'),
    ).toHaveLength(3);

    const file = join(config, 'demo cli', 'auth.json');
    expect(JSON.parse(await readFile(file, 'utf8'))).toEqual({
      [authWorkerUrl]: 'issued-token',
    });
    expect((await stat(file)).mode & 0o777).toBe(0o600);
    expect(await run(worker, (auth) => auth.whoami)).toEqual(
      Exit.succeed(user),
    );
  });

  it('fails login when the code is denied or expires', async () => {
    const denied = await run(
      fakeAuthWorker(['access_denied']),
      (auth) => auth.login,
    );
    expect(denied).toMatchObject(
      Exit.fail({ _tag: 'DeviceLoginFailed', reason: 'denied' }),
    );
    const expired = await run(
      fakeAuthWorker(['expired_token']),
      (auth) => auth.login,
    );
    expect(expired).toMatchObject(
      Exit.fail({ _tag: 'DeviceLoginFailed', reason: 'expired' }),
    );
  });

  it('keeps an issued Session when the post-approval check cannot reach the Auth Worker', async () => {
    const worker = fakeAuthWorker(['issued']);
    const fetch = worker.fetch;
    worker.fetch = async (input, init) => {
      const request = new Request(input, init);
      if (new URL(request.url).pathname.endsWith('/get-session')) {
        throw new TypeError('network unavailable');
      }
      return fetch(input, init);
    };

    const result = await run(worker, (auth) => auth.login);
    expect(Exit.isFailure(result)).toBe(true);
    expect(result).not.toMatchObject({ cause: { _tag: 'Die' } });
    expect(
      JSON.parse(await readFile(join(config, 'demo cli', 'auth.json'), 'utf8')),
    ).toEqual({ [authWorkerUrl]: 'issued-token' });
  });

  it('is signed out without a Session, and when the Session dies', async () => {
    const worker = fakeAuthWorker(['issued']);
    expect(await run(worker, (auth) => auth.token)).toMatchObject(
      Exit.fail({ _tag: 'SignedOut' }),
    );
    await run(worker, (auth) => auth.login);
    worker.live.clear();
    expect(await run(worker, (auth) => auth.whoami)).toMatchObject(
      Exit.fail({ _tag: 'SignedOut' }),
    );
  });

  it('logs out at the Auth Worker and removes the file', async () => {
    const worker = fakeAuthWorker(['issued']);
    await run(worker, (auth) => auth.login);
    await run(worker, (auth) => auth.logout);
    expect(worker.calls).toContain('/sign-out');
    expect(worker.live.has('issued-token')).toBe(false);
    await expect(
      readFile(join(config, 'demo cli', 'auth.json')),
    ).rejects.toThrow();
  });

  it('puts the Session in every RPC request', async () => {
    const worker = fakeAuthWorker(['issued']);
    await run(worker, (auth) => auth.login);
    const headers = await run(worker, () =>
      Effect.service(RpcClient.CurrentHeaders).pipe(
        Effect.provide(CliAuth.rpcSession),
      ),
    );
    expect(headers).toMatchObject(
      Exit.succeed({ authorization: 'Bearer issued-token' }),
    );
  });
});
