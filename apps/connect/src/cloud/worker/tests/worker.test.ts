import { Effect, Layer, Schema } from 'effect';
import type { RpcClient, RpcClientError } from 'effect/rpc';
import { FetchHttpClient } from 'effect/http';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Principal } from '@kestack/auth-toolkit';
import { fakeGuard } from '@kestack/auth-toolkit/fake';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kestack/std-toolkit/db/sqlite/node';
import { client } from '@kestack/rpc-toolkit/rpc/http';
import {
  versionedClient,
  type VersionGap,
} from '@kestack/rpc-toolkit/rpc/version-gap';
import { CloudClient } from '../../client/index.js';
import {
  ConnectionReport,
  HEARTBEAT_PATH,
  HeartbeatApi,
  VERSION_HEADER,
} from '../../../heartbeat/index.js';
import { isOutdated } from '../../app-api/index.js';
import { connectionsTable, serveOver } from '../index.js';
import { standingOf } from '../store/index.js';

/*
 * Connect Cloud over an in-memory SQLite database, called as `ke-connect`
 * calls it, the Heartbeat at `/heartbeat`, and as an App does, through
 * `CloudClient` at `/rpc`, both as one client here, with
 * `fakeGuard.rpc({ as })` saying who signed each request. Each test signs in
 * Users of its own, so they share one database.
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

/** The version of each Plugin this Connect Cloud wants run. */
const WANTED = {
  code: { hash: 'a'.repeat(64), url: 'https://files.test/code' },
};

/** The Minimum Connect this Connect Cloud was deployed with. */
const MIN_CONNECT = '0.0.9';

/** The code Plugin's file, as R2 keeps it. */
const PLUGIN_KEY = `releases/code/${'b'.repeat(64)}.mjs`;
const PLUGIN_FILE = 'export {};\n';

/** A key R2 fails to look up. */
const FAILING_KEY = `releases/code/${'f'.repeat(64)}.mjs`;

/** Every key R2 was asked whether it holds. */
const headed: Array<string> = [];

/** R2 as Connect Cloud reads it: one Plugin file, and one key it fails on. */
const files = {
  get: async (key: string) =>
    key === PLUGIN_KEY ? { body: new Response(PLUGIN_FILE).body } : null,
  head: async (key: string) => {
    headed.push(key);
    if (key === FAILING_KEY) throw new Error('R2 is down');
    return key === PLUGIN_KEY ? { key } : null;
  },
};

const answerAs = (principal: Principal | null) =>
  serveOver({
    guard: fakeGuard.rpc({ as: principal }),
    authInfo: AUTH_INFO,
    origins: ORIGINS,
    driver,
    wanted: WANTED,
    minConnect: MIN_CONNECT,
    files,
  });

/** Both of Connect Cloud's RPCs: the Heartbeat, as `ke-connect` calls it, and an App's. */
type Both = CloudClient['Service'] &
  RpcClient.FromGroup<
    typeof HeartbeatApi,
    RpcClientError.RpcClientError | VersionGap
  >;

/**
 * Runs `program` with the clients of the Connect Cloud `answer`; from a page
 * at `origin` when given, else as `serve` calls, with no Origin; its
 * Heartbeat calls as `ke-connect` at `version`, the Minimum Connect unless
 * given.
 */
const callOn = <A, E>(
  answer: (request: Request) => Promise<Response>,
  program: (connections: Both) => Effect.Effect<A, E>,
  options: { readonly origin?: string; readonly version?: string } = {},
) => {
  const { origin, version = MIN_CONNECT } = options;
  const fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (origin !== undefined) request.headers.set('origin', origin);
    return answer(request);
  };
  return Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const app = yield* CloudClient;
        const protocol = yield* Layer.build(
          client(HeartbeatApi, {
            url: `${CLOUD}${HEARTBEAT_PATH}`,
            headers: { [VERSION_HEADER]: version },
          }),
        );
        const heartbeat = yield* Effect.provideContext(
          versionedClient(HeartbeatApi),
          protocol,
        );
        return yield* program({ ...app, ...heartbeat });
      }),
    ).pipe(
      Effect.provide(CloudClient.layer(CLOUD)),
      Effect.provideService(
        FetchHttpClient.Fetch,
        fetch as typeof globalThis.fetch,
      ),
    ),
  );
};

/**
 * Runs `program` with Connect Cloud's clients, signed as `user` (nobody for
 * null); from a page at `origin` when given, else as `serve` calls, with no
 * Origin.
 */
const as = <A, E>(
  user: { readonly principal: Principal } | null,
  program: (connections: Both) => Effect.Effect<A, E>,
  origin?: string,
) =>
  callOn(
    answerAs(user?.principal ?? null),
    program,
    origin === undefined ? {} : { origin },
  );

const reportOf = (id: string, name = 'laptop'): ConnectionReport => ({
  id,
  name,
  key: `key-${id}`,
  version: MIN_CONNECT,
  status: {
    _tag: 'Ready',
    url: `https://${id}.tunnel.test`,
    check: { _tag: 'Reachable', at: 1 },
  },
});

describe('Connect Cloud', () => {
  it('records a Report, lists it with its Last Seen, and updates it on the next', async () => {
    const ada = signIn('ada');
    const before = Date.now();
    await as(ada, (m) => m.Report(reportOf('m1')));
    const [first] = await as(ada, (m) => m.List({}));
    expect(first).toMatchObject({ ...reportOf('m1'), displayName: null });
    expect(first!.lastSeen).toBeGreaterThanOrEqual(before);
    await as(ada, (m) => m.Report(reportOf('m1', 'renamed')));
    const [second] = await as(ada, (m) => m.List({}));
    expect(second!.name).toBe('renamed');
    expect(second!.lastSeen).toBeGreaterThanOrEqual(first!.lastSeen);
  });

  it('renames a Connection: listed by its Display Name, which a Report keeps, and a blank one goes back to none', async () => {
    const ada = signIn('ada');
    await as(ada, (m) => m.Report(reportOf('named', 'Ada-MacBook')));
    const listed = () =>
      as(ada, (m) => m.List({})).then((all) =>
        all.map(({ name, displayName }) => ({ name, displayName })),
      );
    await as(ada, (m) => m.Rename({ id: 'named', displayName: '  Work  ' }));
    expect(await listed()).toEqual([
      { name: 'Ada-MacBook', displayName: 'Work' },
    ]);
    // The Connection's own name moves on; the Display Name stays.
    await as(ada, (m) => m.Report(reportOf('named', 'Ada-Mac')));
    expect(await listed()).toEqual([{ name: 'Ada-Mac', displayName: 'Work' }]);
    await as(ada, (m) => m.Rename({ id: 'named', displayName: '   ' }));
    expect(await listed()).toEqual([{ name: 'Ada-Mac', displayName: null }]);
  });

  it("leaves another User's Connection, or a forgotten one, alone when asked to rename it", async () => {
    const ada = signIn('ada');
    const bob = signIn('bob');
    await as(ada, (m) => m.Report(reportOf('mine')));
    await as(bob, (m) => m.Rename({ id: 'mine', displayName: 'Bob’s' }));
    await as(ada, (m) => m.Rename({ id: 'nowhere', displayName: 'Ghost' }));
    expect(
      (await as(ada, (m) => m.List({}))).map(({ displayName }) => displayName),
    ).toEqual([null]);
    await as(ada, (m) => m.Forget({ id: 'mine' }));
    await as(ada, (m) => m.Rename({ id: 'mine', displayName: 'Back' }));
    expect(await as(ada, (m) => m.List({}))).toEqual([]);
  });

  it('answers a Report with the Releases wanted, and lists them on each Connection', async () => {
    const ada = signIn('ada');
    const reported = await as(ada, (m) => m.Report(reportOf('p1')));
    expect(reported.wanted).toEqual(WANTED);
    expect(await as(ada, (m) => m.List({}))).toMatchObject([
      { id: 'p1', wanted: WANTED },
    ]);
  });

  it('lists each Connection beside the Minimum Connect it was deployed with, or null, so an App tells one Outdated', async () => {
    const ada = signIn('ada');
    const untold = serveOver({
      guard: fakeGuard.rpc({ as: ada.principal }),
      authInfo: AUTH_INFO,
      origins: ORIGINS,
      driver,
    });
    // It reported before the Minimum Connect rose above it.
    const older = { ...reportOf('v1'), version: '0.0.2' };
    expect(
      await callOn(untold, (m) => m.Report(older), { version: '0.0.2' }),
    ).toEqual({ wanted: {} });
    const listed = await as(ada, (m) => m.List({}));
    expect(listed).toMatchObject([
      { id: 'v1', version: '0.0.2', minConnect: MIN_CONNECT },
    ]);
    expect(listed.map(isOutdated)).toEqual([true]);
    const listedUntold = await callOn(untold, (m) => m.List({}));
    expect(listedUntold).toMatchObject([{ id: 'v1', minConnect: null }]);
    expect(listedUntold.map(isOutdated)).toEqual([false]);
  });

  it('says where a Release stands: the one it names Latest, another it keeps Older, any other Unknown', async () => {
    const ada = signIn('ada');
    const standing = (plugin: string, hash: string) =>
      as(ada, (m) => m.Standing({ plugin, hash })).then(({ _tag }) => _tag);
    expect(await standing('code', 'a'.repeat(64))).toBe('Latest');
    expect(await standing('code', 'b'.repeat(64))).toBe('Older');
    expect(headed).toEqual([PLUGIN_KEY]);
    expect(await standing('code', 'e'.repeat(64))).toBe('Unknown');
    expect(await standing('other', 'b'.repeat(64))).toBe('Unknown');
    expect(await standing('constructor', 'a'.repeat(64))).toBe('Unknown');
    // R2 failing to answer keeps nothing.
    expect(await standing('code', 'f'.repeat(64))).toBe('Unknown');
    // A name or hash no file could have is never looked for.
    headed.length = 0;
    expect(await standing('code', 'B'.repeat(64))).toBe('Unknown');
    expect(await standing('code', '../x')).toBe('Unknown');
    expect(await standing('Code', 'b'.repeat(64))).toBe('Unknown');
    expect(headed).toEqual([]);
    // Only a signed-in caller is answered.
    expect(
      await as(null, (m) =>
        Effect.flip(m.Standing({ plugin: 'code', hash: 'a'.repeat(64) })),
      ),
    ).toMatchObject({ _tag: 'Unauthenticated' });
  });

  it('with no Release Files, knows only the Release it names', async () => {
    const standing = (hash: string) =>
      Effect.runPromise(standingOf(WANTED, undefined, 'code', hash));
    expect(await standing('a'.repeat(64))).toEqual({ _tag: 'Latest' });
    expect(await standing('b'.repeat(64))).toEqual({ _tag: 'Unknown' });
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
      `releases/code/${'c'.repeat(64)}.mjs`,
      'releases/code/latest.mjs',
      `releases/../${'b'.repeat(64)}.mjs`,
      'releases/',
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
    ).toMatchObject({ wanted: WANTED });
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
    await as(ada, (m) => m.Report(reportOf('from-site')));
    await as(
      ada,
      (m) => m.Rename({ id: 'from-site', displayName: 'Site' }),
      SITE,
    );
    const answer = answerAs(ada.principal);
    // A simple POST, as a page of the same site could send with the cookie.
    const forged = await answer(
      new Request(`${CLOUD}/rpc`, {
        method: 'POST',
        headers: {
          origin: 'https://pr1-code.elsewhere.app',
          'content-type': 'text/plain',
        },
        body: JSON.stringify({ _tag: 'Request', tag: 'Forget' }),
      }),
    );
    expect(forged.status).toBe(403);
    expect(
      await as(
        ada,
        (m) => Effect.flip(m.Forget({ id: 'from-site' })),
        'https://test.evil.app',
      ),
    ).toBeDefined();
    expect(await as(ada, (m) => m.List({}), SITE)).toMatchObject([
      { id: 'from-site', displayName: 'Site' },
    ]);
  });

  it('answers the Heartbeat only to a caller that names no Origin, as no browser is', async () => {
    const ada = signIn('ada');
    for (const origin of [SITE, 'https://test.evil.app'])
      expect(
        await as(ada, (m) => Effect.flip(m.Report(reportOf('paged'))), origin),
      ).toBeDefined();
    const answer = answerAs(ada.principal);
    const forged = await answer(
      new Request(`${CLOUD}/heartbeat`, {
        method: 'POST',
        headers: { origin: SITE, 'content-type': 'text/plain' },
        body: JSON.stringify({ _tag: 'Request', tag: 'Report' }),
      }),
    );
    expect(forged.status).toBe(403);
    expect(forged.headers.get('access-control-allow-origin')).toBeNull();
    const preflight = await answer(
      new Request(`${CLOUD}/heartbeat`, {
        method: 'OPTIONS',
        headers: { origin: SITE, 'access-control-request-method': 'POST' },
      }),
    );
    expect(preflight.headers.get('access-control-allow-origin')).toBeNull();
    expect(await as(ada, (m) => m.List({}))).toEqual([]);
  });

  it('answers the Heartbeat at /heartbeat and an App at /rpc, and neither call at the other', async () => {
    const ada = signIn('ada');
    const answer = answerAs(ada.principal);
    const call = (path: string, tag: string) =>
      answer(
        new Request(`${CLOUD}${path}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/ndjson',
            [VERSION_HEADER]: MIN_CONNECT,
          },
          body: `${JSON.stringify({ _tag: 'Request', id: '1', tag, payload: {}, headers: [] })}\n`,
        }),
      ).then((response) => response.text());
    expect(await call('/rpc', 'Report')).toMatch(/Unknown request tag: Report/);
    expect(await call('/heartbeat', 'List')).toMatch(
      /Unknown request tag: List/,
    );
  });

  it('takes a Report only with an https:// address, or none, and every field bounded', async () => {
    // Client and Connect Cloud both check the payload against the Heartbeat.
    const valid = Schema.is(ConnectionReport.schema);
    const base = reportOf('bounded');
    expect(valid(base)).toBe(true);
    const at = (url: string) => ({
      ...base,
      status: { _tag: 'Ready', url, check: { _tag: 'Unchecked' } },
    });
    expect(
      valid({
        ...base,
        status: { _tag: 'SettingUp', step: { _tag: 'Opening' } },
      }),
    ).toBe(true);
    expect(valid(at('http://bounded.tunnel.test'))).toBe(false);
    expect(valid(at('wss://bounded.tunnel.test'))).toBe(false);
    expect(valid(at('https://'))).toBe(false);
    expect(valid(at(`https://${'a'.repeat(250)}.test`))).toBe(false);
    expect(valid({ ...base, name: 'n'.repeat(65) })).toBe(false);
    expect(valid({ ...base, version: 'v'.repeat(33) })).toBe(false);
    expect(valid({ ...base, key: 'k'.repeat(129) })).toBe(false);
    const ada = signIn('ada');
    const downloading = {
      _tag: 'SettingUp',
      step: { _tag: 'Downloading', elapsed: 40_000, received: 12_400_000 },
    } as const;
    expect(
      await as(ada, (m) => m.Report({ ...base, status: downloading })),
    ).toMatchObject({ wanted: WANTED });
    expect(await as(ada, (m) => m.List({}))).toMatchObject([
      { id: 'bounded', status: downloading },
    ]);
  });

  it('keeps every step and check a Report can say', async () => {
    const ada = signIn('ada');
    const url = 'https://steps.tunnel.test';
    for (const status of [
      { _tag: 'SettingUp', step: { _tag: 'Opening' } },
      { _tag: 'SettingUp', step: { _tag: 'Failed', at: 2, problem: 'no' } },
      { _tag: 'Ready', url, check: { _tag: 'Unchecked' } },
      { _tag: 'Ready', url, check: { _tag: 'Reachable', at: 3 } },
      {
        _tag: 'Ready',
        url,
        check: { _tag: 'Unreachable', at: 4, problem: 'no' },
      },
    ] as const) {
      await as(ada, (m) => m.Report({ ...reportOf('steps'), status }));
      expect((await as(ada, (m) => m.List({})))[0]?.status).toEqual(status);
    }
  });

  it('lists the key a Connection last reported, so a rotated key is read', async () => {
    const ada = signIn('ada');
    await as(ada, (m) => m.Report({ ...reportOf('rotates'), key: 'first' }));
    expect((await as(ada, (m) => m.List({})))[0]?.key).toBe('first');
    await as(ada, (m) => m.Report({ ...reportOf('rotates'), key: 'second' }));
    expect((await as(ada, (m) => m.List({})))[0]?.key).toBe('second');
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

describe('a ke-connect below the Minimum Connect', () => {
  /** A Forget sent raw to `path` with `headers`, as no client would frame it. */
  const raw = (
    answer: (request: Request) => Promise<Response>,
    headers: Record<string, string>,
    path = HEARTBEAT_PATH,
  ) =>
    answer(
      new Request(`${CLOUD}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/ndjson', ...headers },
        body: `${JSON.stringify({ _tag: 'Request', id: '1', tag: 'Forget', payload: { _v: 'v1', id: 'x' }, headers: [] })}\n`,
      }),
    );

  const line = (named: string) =>
    `${named} is older than Connect Cloud accepts (${MIN_CONNECT}): run \`npm i -g @kestack/connect@latest\`, then start it again.`;

  it('is answered 426 and one line of plain text, before its call is read or its Sign-in checked', async () => {
    const answer = answerAs(null);
    for (const [headers, named] of [
      [{}, 'This ke-connect'],
      [{ [VERSION_HEADER]: '0.0.8' }, 'ke-connect 0.0.8'],
      [{ [VERSION_HEADER]: '0.0.9-next.1' }, 'ke-connect 0.0.9-next.1'],
    ] as const) {
      const response = await raw(answer, headers);
      expect(response.status).toBe(426);
      expect(response.headers.get('content-type')).toBe(
        'text/plain; charset=utf-8',
      );
      expect(await response.text()).toBe(line(named));
    }
  });

  it('keeps nothing of a Report it refused', async () => {
    const ada = signIn('ada');
    const refused = await callOn(
      answerAs(ada.principal),
      (m) => Effect.flip(m.Report(reportOf('too-old'))),
      { version: '0.0.8' },
    );
    expect(refused).toMatchObject({ _tag: 'RpcClientError' });
    expect(await as(ada, (m) => m.List({}))).toEqual([]);
  });

  it('lets a ke-connect at the Minimum Connect or above through', async () => {
    const ada = signIn('ada');
    for (const version of [MIN_CONNECT, '0.1.0'])
      expect(
        await callOn(
          answerAs(ada.principal),
          (m) => m.Report(reportOf(`at-${version}`)),
          { version },
        ),
      ).toEqual({ wanted: WANTED });
  });

  it('checks no version when Connect Cloud has no Minimum Connect', async () => {
    const ada = signIn('ada');
    const untold = serveOver({
      guard: fakeGuard.rpc({ as: ada.principal }),
      authInfo: AUTH_INFO,
      origins: ORIGINS,
      driver,
    });
    expect((await raw(untold, {})).status).toBe(200);
    expect(
      await callOn(untold, (m) => m.Report(reportOf('any')), {
        version: '0.0.1',
      }),
    ).toEqual({ wanted: {} });
  });

  it('leaves an App’s calls at /rpc alone', async () => {
    const response = await raw(answerAs(null), {}, '/rpc');
    expect(response.status).toBe(200);
    expect(await response.text()).not.toMatch(/older than Connect Cloud/);
  });
});
