import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Effect, Layer } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fakeGuard } from '@kestack/auth-toolkit/fake';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kestack/std-toolkit/db/sqlite/node';
import { CloudClient } from '../../../../cloud/client/index.js';
import { connectionsTable, serveOver } from '../../../../cloud/worker/index.js';
import { signIn } from '../index.js';

/*
 * Signing in as a Device, against a Cloud Connect and two Auth Workers
 * faked at `fetch`: Cloud Connect's `/auth` names one, and later the
 * other, while the first stops answering. Cloud Connect refuses every
 * call it is asked.
 */

const CLOUD = 'https://cloud.test';
const ada = { id: 'ada', email: 'ada@example.com', name: 'Ada' };

/** Cloud Connect naming `auth.url` and refusing every call, and two Auth Workers, each approving Ada at once; those `stalled` never answer. */
const fakes = async () => {
  const auth = { url: 'https://auth-a.test' };
  const stalled = new Set<string>();
  const driver = makeNodeSQLite({ path: ':memory:' });
  await Effect.runPromise(
    SQLite.setup(connectionsTable, { database: driver, mode: 'persistent' }),
  );
  const cloud = serveOver({
    guard: fakeGuard.rpc({ as: null }),
    authInfo: auth,
    origins: [],
    driver,
  });
  const calls: Array<string> = [];
  const live = new Set<string>();
  let issued = 0;
  const json = (body: unknown, status = 200) => Response.json(body, { status });
  const fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    if (url.origin === CLOUD && url.pathname === '/auth') return json(auth);
    if (url.origin === CLOUD) return cloud(request);
    if (stalled.has(url.origin)) return new Promise<Response>(() => {});
    const path = url.pathname.replace('/api/auth', '');
    calls.push(`${url.origin}${path}`);
    const token = request.headers.get('authorization')?.slice(7);
    switch (path) {
      case '/device/code':
        return json({
          device_code: 'dc',
          user_code: 'ABCD-EFGH',
          verification_uri: `${url.origin}/device`,
          verification_uri_complete: `${url.origin}/device?user_code=ABCD-EFGH`,
          interval: 0,
        });
      case '/device/token': {
        const issuedToken = `${url.host}-${++issued}`;
        live.add(issuedToken);
        return json({ access_token: issuedToken, token_type: 'Bearer' });
      }
      case '/get-session':
        return json(
          token && live.has(token) ? { user: ada, session: { token } } : null,
        );
      case '/sign-out':
        live.delete(token ?? '');
        return json({ success: true });
      default:
        return json({}, 404);
    }
  }) as typeof globalThis.fetch;
  return { auth, stalled, calls, fetch };
};

const keptAuth = (db: string) =>
  JSON.parse(readFileSync(join(db, '..', 'auth.json'), 'utf8')) as unknown;

afterEach(() => vi.unstubAllGlobals());

describe('signIn', () => {
  it('signs in again through the Auth Worker Cloud Connect names now, not the one it named before', async () => {
    const fake = await fakes();
    vi.stubGlobal('fetch', fake.fetch);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const db = join(
      mkdtempSync(join(tmpdir(), 'connect-sign-in-')),
      'connect.db',
    );
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const session = yield* signIn({ cloud: CLOUD, db, version: '0.0.0' });
          expect(session.user).toMatchObject({ id: 'ada' });
          expect(keptAuth(db)).toEqual({
            cloud: CLOUD,
            url: 'https://auth-a.test',
          });

          // Cloud Connect moved to another Auth Worker, and the first
          // stopped answering, its sign-out too.
          fake.auth.url = 'https://auth-b.test';
          fake.stalled.add('https://auth-a.test');
          const again = yield* session.signInAgain;
          expect(again).toMatchObject({ id: 'ada' });
          expect(fake.calls).toContain('https://auth-b.test/device/token');
          expect(keptAuth(db)).toEqual({
            cloud: CLOUD,
            url: 'https://auth-b.test',
          });

          // A call Cloud Connect refuses stays refused, and is checked with
          // the Auth Worker it names now.
          const before = fake.calls.length;
          const refused = yield* Effect.flip(
            Effect.flatMap(CloudClient, (client) => client.List({})).pipe(
              Effect.provide(
                CloudClient.layer(CLOUD).pipe(Layer.provide(session.signing)),
              ),
              Effect.provideService(FetchHttpClient.Fetch, fake.fetch),
            ),
          );
          expect(refused).toMatchObject({ _tag: 'Unauthenticated' });
          // The check runs beside the refusal: wait for it.
          yield* Effect.promise(() =>
            vi.waitFor(() => expect(fake.calls.length).toBeGreaterThan(before)),
          );
          expect(fake.calls.slice(before)).toEqual([
            'https://auth-b.test/get-session',
          ]);
        }),
      ),
    );
  }, 30_000);
});
