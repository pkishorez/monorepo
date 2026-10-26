import { Effect, Schema } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Principal } from '@kestack/auth-toolkit';
import { fakeGuard } from '@kestack/auth-toolkit/fake';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kestack/std-toolkit/db/sqlite/node';
import { CloudClient } from '../../client/index.js';
import { ConnectionReport } from '../../contract/index.js';
import { connectionsTable, serveOver } from '../index.js';

/*
 * Cloud Connect over an in-memory SQLite database, called through
 * `CloudClient`, with `fakeGuard.rpc({ as })` saying who signed each request. Each
 * test signs in Users of its own, so they share one database.
 */

const SITE = 'https://code.test';
const ORIGINS = ['https://*.test'];
const CLOUD = 'https://connect.test';
const AUTH_INFO = { url: 'https://auth.test' };

const driver = makeNodeSQLite({ path: ':memory:' });

beforeAll(() =>
  Effect.runPromise(
    SQLite.setup(connectionsTable, { database: driver, mode: 'persistent' }),
  ),
);

let users = 0;
/** A User new to this database, signed in with a Sign-in of their own. */
const signIn = (name: string) => {
  const id = `${name}-${++users}`;
  return {
    id,
    principal: {
      kind: 'session',
      user: { id, name, email: `${id}@demo.test` },
      session: { id: `s-${id}` },
      test: true,
    } as unknown as Principal,
  };
};

/** The same User on another Sign-in, as a second Connection would be. */
const anotherSignIn = (user: ReturnType<typeof signIn>, n: number) => ({
  ...user,
  principal: {
    ...user.principal,
    session: { id: `s-${user.id}-${n}` },
  } as unknown as Principal,
});

/** The version of each Plugin this Cloud Connect wants run. */
const WANTED = {
  code: { hash: 'a'.repeat(64), url: 'https://files.test/code' },
};

/** The version of Connect this Cloud Connect was deployed with. */
const CONNECT_VERSION = '0.0.9';

/** The code Plugin's file, as R2 keeps it. */
const PLUGIN_KEY = `plugins/code/${'b'.repeat(64)}.mjs`;
const PLUGIN_FILE = 'export {};\n';

/** R2 as Cloud Connect reads it: one Plugin file. */
const files = {
  get: async (key: string) =>
    key === PLUGIN_KEY ? { body: new Response(PLUGIN_FILE).body } : null,
};

const answerAs = (principal: Principal | null) =>
  serveOver({
    guard: fakeGuard.rpc({ as: principal }),
    authInfo: AUTH_INFO,
    origins: ORIGINS,
    driver,
    plugins: WANTED,
    connectVersion: CONNECT_VERSION,
    files,
  });

/**
 * Runs `program` with Cloud Connect's client, signed as `user` (nobody for
 * null); from a page at `origin` when given, else as `serve` calls, with no
 * Origin.
 */
const as = <A, E>(
  user: { readonly principal: Principal } | null,
  program: (connections: CloudClient['Service']) => Effect.Effect<A, E>,
  origin?: string,
) => {
  const answer = answerAs(user?.principal ?? null);
  const fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (origin !== undefined) request.headers.set('origin', origin);
    return answer(request);
  };
  return Effect.runPromise(
    Effect.gen(function* () {
      return yield* program(yield* CloudClient);
    }).pipe(
      Effect.provide(CloudClient.layer(CLOUD)),
      Effect.provideService(
        FetchHttpClient.Fetch,
        fetch as typeof globalThis.fetch,
      ),
    ),
  );
};

const reportOf = (id: string, name = 'laptop'): ConnectionReport => ({
  id,
  name,
  key: `key-${id}`,
  version: '0.0.2',
  status: { _tag: 'Reachable', url: `https://${id}.tunnel.test`, at: 1 },
  plugins: {},
});

describe('Cloud Connect', () => {
  it('records a Report, lists it with its Last Seen, and updates it on the next', async () => {
    const ada = signIn('ada');
    const before = Date.now();
    const first = await as(ada, (m) => m.Report(reportOf('m1')));
    expect(first).toMatchObject(reportOf('m1'));
    expect(first.lastSeen).toBeGreaterThanOrEqual(before);
    const second = await as(ada, (m) => m.Report(reportOf('m1', 'renamed')));
    expect(second.name).toBe('renamed');
    expect(second.lastSeen).toBeGreaterThanOrEqual(first.lastSeen);
    expect(await as(ada, (m) => m.List({}))).toEqual([second]);
  });

  it('answers a Report with the Plugins wanted, and keeps where each stands', async () => {
    const ada = signIn('ada');
    const running = { _tag: 'Running' as const, hash: 'a'.repeat(64) };
    const reported = await as(ada, (m) =>
      m.Report({ ...reportOf('p1'), plugins: { code: running } }),
    );
    expect(reported.wanted).toEqual(WANTED);
    expect(reported.plugins).toEqual({ code: running });
    expect(await as(ada, (m) => m.List({}))).toMatchObject([
      { id: 'p1', plugins: { code: running }, wanted: WANTED },
    ]);
  });

  it('tells each Connection the version of Connect it was deployed with, or null', async () => {
    const ada = signIn('ada');
    const reported = await as(ada, (m) => m.Report(reportOf('v1')));
    expect(reported.latestVersion).toBe(CONNECT_VERSION);
    expect(await as(ada, (m) => m.List({}))).toMatchObject([
      { id: 'v1', latestVersion: CONNECT_VERSION },
    ]);
    const untold = serveOver({
      guard: fakeGuard.rpc({ as: ada.principal }),
      authInfo: AUTH_INFO,
      origins: ORIGINS,
      driver,
    });
    const listed = await Effect.runPromise(
      Effect.flatMap(CloudClient, (cloud) => cloud.List({})).pipe(
        Effect.provide(CloudClient.layer(CLOUD)),
        Effect.provideService(FetchHttpClient.Fetch, ((
          input: RequestInfo | URL,
          init?: RequestInit,
        ) => untold(new Request(input, init))) as typeof globalThis.fetch),
      ),
    );
    expect(listed).toMatchObject([{ id: 'v1', latestVersion: null }]);
  });

  it('serves a Plugin file by its hash, cached for good, and nothing else', async () => {
    const answer = answerAs(null);
    const found = await answer(new Request(`${CLOUD}/${PLUGIN_KEY}`));
    expect(found.status).toBe(200);
    expect(await found.text()).toBe(PLUGIN_FILE);
    expect(found.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable',
    );
    expect(found.headers.get('content-type')).toMatch(/^text\/javascript/);
    for (const path of [
      `plugins/code/${'c'.repeat(64)}.mjs`,
      'plugins/code/latest.mjs',
      `plugins/../${'b'.repeat(64)}.mjs`,
      'plugins/',
    ])
      expect((await answer(new Request(`${CLOUD}/${path}`))).status).toBe(404);
    const unbound = serveOver({
      guard: fakeGuard.rpc({ as: null }),
      authInfo: AUTH_INFO,
      origins: ORIGINS,
      driver,
    });
    expect((await unbound(new Request(`${CLOUD}/${PLUGIN_KEY}`))).status).toBe(
      404,
    );
  });

  it("lists only the caller's Connections", async () => {
    const ada = signIn('ada');
    const bob = signIn('bob');
    await as(ada, (m) => m.Report(reportOf('ada-1')));
    await as(bob, (m) => m.Report(reportOf('bob-1')));
    expect((await as(bob, (m) => m.List({}))).map(({ id }) => id)).toEqual([
      'bob-1',
    ]);
  });

  it("refuses another User's Connection id ConnectionTaken", async () => {
    const ada = signIn('ada');
    const bob = signIn('bob');
    await as(ada, (m) => m.Report(reportOf('taken')));
    expect(
      await as(bob, (m) => Effect.flip(m.Report(reportOf('taken')))),
    ).toMatchObject({ _tag: 'ConnectionTaken', id: 'taken' });
  });

  it('forgets a Connection for good: its id, and its Sign-in under a new id', async () => {
    const ada = signIn('ada');
    await as(ada, (m) => m.Report(reportOf('gone')));
    await as(ada, (m) => m.Forget({ id: 'gone' }));
    // Forgetting again does nothing more.
    await as(ada, (m) => m.Forget({ id: 'gone' }));
    expect(await as(ada, (m) => m.List({}))).toEqual([]);
    expect(
      await as(ada, (m) => Effect.flip(m.Report(reportOf('gone')))),
    ).toMatchObject({ _tag: 'ConnectionForgotten', id: 'gone' });
    expect(
      await as(ada, (m) => Effect.flip(m.Report(reportOf('fresh')))),
    ).toMatchObject({ _tag: 'ConnectionForgotten', id: 'fresh' });
    // The same User on another Sign-in is a Connection of their own.
    const elsewhere = anotherSignIn(ada, 2);
    expect(
      await as(elsewhere, (m) => m.Report(reportOf('fresh'))),
    ).toMatchObject({ id: 'fresh' });
    // The forgotten id stays forgotten whatever the Sign-in.
    expect(
      await as(elsewhere, (m) => Effect.flip(m.Report(reportOf('gone')))),
    ).toMatchObject({ _tag: 'ConnectionForgotten' });
  });

  it("leaves another User's Connection alone when asked to forget it", async () => {
    const ada = signIn('ada');
    const bob = signIn('bob');
    await as(ada, (m) => m.Report(reportOf('kept')));
    await as(bob, (m) => m.Forget({ id: 'kept' }));
    expect((await as(ada, (m) => m.List({}))).map(({ id }) => id)).toEqual([
      'kept',
    ]);
  });

  it('refuses a call with no Sign-in Unauthenticated', async () => {
    expect(await as(null, (m) => Effect.flip(m.List({})))).toMatchObject({
      _tag: 'Unauthenticated',
    });
  });

  it("takes an allowed origin's calls, and refuses another origin's 403 before reading them", async () => {
    const ada = signIn('ada');
    await as(ada, (m) => m.Report(reportOf('from-site')), SITE);
    const answer = answerAs(ada.principal);
    // A simple POST, as a page of the same site could send with the cookie.
    const forged = await answer(
      new Request(`${CLOUD}/rpc`, {
        method: 'POST',
        headers: {
          origin: 'https://pr1-code.elsewhere.app',
          'content-type': 'text/plain',
        },
        body: JSON.stringify({ _tag: 'Request', tag: 'Report' }),
      }),
    );
    expect(forged.status).toBe(403);
    expect(
      await as(
        ada,
        (m) => Effect.flip(m.Report(reportOf('forged'))),
        'https://test.evil.app',
      ),
    ).toBeDefined();
    expect((await as(ada, (m) => m.List({}))).map(({ id }) => id)).toEqual([
      'from-site',
    ]);
  });

  it('takes a Report only with an https:// address, or none, and every field bounded', async () => {
    // Client and Cloud Connect both check the payload against the contract.
    const valid = Schema.is(ConnectionReport.schema);
    const base = reportOf('bounded');
    expect(valid(base)).toBe(true);
    const at = (url: string) => ({
      ...base,
      status: { _tag: 'Unchecked', url },
    });
    expect(valid({ ...base, status: { _tag: 'Opening' } })).toBe(true);
    expect(valid(at('http://bounded.tunnel.test'))).toBe(false);
    expect(valid(at('wss://bounded.tunnel.test'))).toBe(false);
    expect(valid(at('https://'))).toBe(false);
    expect(valid(at(`https://${'a'.repeat(250)}.test`))).toBe(false);
    expect(valid({ ...base, name: 'n'.repeat(65) })).toBe(false);
    expect(valid({ ...base, version: 'v'.repeat(33) })).toBe(false);
    expect(valid({ ...base, key: 'k'.repeat(129) })).toBe(false);
    const ada = signIn('ada');
    expect(
      await as(ada, (m) =>
        m.Report({ ...base, status: { _tag: 'Installing' } }),
      ),
    ).toMatchObject({ id: 'bounded', status: { _tag: 'Installing' } });
  });

  it('answers /auth with how a Connection signs in, to anyone', async () => {
    const response = await answerAs(null)(new Request(`${CLOUD}/auth`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ...AUTH_INFO, _v: 'v1' });
  });

  it("answers an allowed origin's preflight with that origin, and lets no other origin read it", async () => {
    const answer = answerAs(null);
    const preflight = await answer(
      new Request(`${CLOUD}/rpc`, {
        method: 'OPTIONS',
        headers: {
          origin: SITE,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type, expect-user',
        },
      }),
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(SITE);
    expect(preflight.headers.get('access-control-allow-credentials')).toBe(
      'true',
    );
    const other = await answer(
      new Request(`${CLOUD}/rpc`, {
        method: 'OPTIONS',
        headers: { origin: 'https://pr12-code.test' },
      }),
    );
    expect(other.headers.get('access-control-allow-origin')).toBe(
      'https://pr12-code.test',
    );
    expect(other.headers.get('vary')).toBe('Origin');
    const elsewhere = await answer(
      new Request(`${CLOUD}/rpc`, {
        method: 'OPTIONS',
        headers: { origin: 'https://elsewhere.app' },
      }),
    );
    expect(elsewhere.headers.get('access-control-allow-origin')).toBeNull();
  });
});
