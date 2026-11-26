import { Effect, Layer } from 'effect';
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
  HEARTBEAT_PATH,
  HeartbeatApi,
  type Report,
  VERSION_HEADER,
} from '../rpc/heartbeat/contract/index.js';
import { connectionsTable, serveOver } from '../index.js';

const SITE = 'https://code.test';
const ORIGINS = ['https://*.test'];
const CLOUD = 'https://connect.test';
const AUTH_INFO = { url: 'https://auth.test' };
const MIN_CONNECT = '0.0.9';

const CODE = { hash: 'a'.repeat(64), url: 'https://files.test/code' };
const NOTES = { hash: 'b'.repeat(64), url: 'https://files.test/notes' };
const CATALOG = {
  code: { ...CODE, enabledByDefault: true },
  notes: { ...NOTES, enabledByDefault: false },
};

const FILE_KEY = `releases/code/${'c'.repeat(64)}.mjs`;
const FILE = 'export {};\n';
const files = {
  get: async (key: string) =>
    key === FILE_KEY ? { body: new Response(FILE).body } : null,
};

const driver = makeNodeSQLite({ path: ':memory:' });

beforeAll(() =>
  Effect.runPromise(
    SQLite.setup(connectionsTable, { database: driver, mode: 'persistent' }),
  ),
);

let users = 0;
const signIn = (name: string) => {
  const id = `${name}-${++users}`;
  return {
    id,
    principal: {
      kind: 'session',
      user: { id, name, email: `${id}@demo.test` },
      session: { id: `s-${id}` },
    } as unknown as Principal,
  };
};

const anotherSignIn = (user: ReturnType<typeof signIn>, n: number) => ({
  ...user,
  principal: {
    ...user.principal,
    session: { id: `s-${user.id}-${n}` },
  } as unknown as Principal,
});

const answerAs = (
  principal: Principal | null,
  options: { readonly minConnect?: string } = { minConnect: MIN_CONNECT },
) =>
  serveOver({
    guard: fakeGuard.rpc({ as: principal }),
    authInfo: AUTH_INFO,
    origins: ORIGINS,
    driver,
    catalog: CATALOG,
    files,
    ...options,
  });

type Both = CloudClient['Service'] &
  RpcClient.FromGroup<
    typeof HeartbeatApi,
    RpcClientError.RpcClientError | VersionGap
  >;

const callOn = <A, E>(
  answer: (request: Request) => Promise<Response>,
  program: (cloud: Both) => Effect.Effect<A, E>,
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

const as = <A, E>(
  user: { readonly principal: Principal } | null,
  program: (cloud: Both) => Effect.Effect<A, E>,
  origin?: string,
) =>
  callOn(
    answerAs(user?.principal ?? null),
    program,
    origin === undefined ? {} : { origin },
  );

const reportOf = (id: string, name = 'laptop'): Report => ({
  id,
  name,
  key: `key-${id}`,
  version: MIN_CONNECT,
  url: `https://${id}.tunnel.test`,
});

const pluginsListed = (user: { readonly principal: Principal }) =>
  as(user, (m) => m.List()).then((all) => all.map(({ plugins }) => plugins));

describe('a Report', () => {
  it('records a first Report, answers the default Plugins, and lists it', async () => {
    const ada = signIn('ada');
    const before = Date.now();
    expect(await as(ada, (m) => m.Report(reportOf('m1')))).toEqual({
      plugins: { code: CODE },
    });
    const [first] = await as(ada, (m) => m.List());
    expect(first).toMatchObject({
      ...reportOf('m1'),
      displayName: null,
      outdated: false,
      plugins: { code: CODE.hash },
    });
    expect(first!.lastSeen).toBeGreaterThanOrEqual(before);
    await as(ada, (m) => m.Report(reportOf('m1', 'renamed')));
    const [second] = await as(ada, (m) => m.List());
    expect(second!.name).toBe('renamed');
    expect(second!.lastSeen).toBeGreaterThanOrEqual(first!.lastSeen);
  });

  it("refuses another User's Connection id ConnectionTaken", async () => {
    const ada = signIn('ada');
    const bob = signIn('bob');
    await as(ada, (m) => m.Report(reportOf('taken')));
    expect(
      await as(bob, (m) => Effect.flip(m.Report(reportOf('taken')))),
    ).toMatchObject({ _tag: 'ConnectionTaken', id: 'taken' });
  });

  it('removes a Connection for good: its id, and its Sign-in under a new id', async () => {
    const ada = signIn('ada');
    await as(ada, (m) => m.Report(reportOf('gone')));
    await as(ada, (m) => m.Remove({ id: 'gone' }));
    await as(ada, (m) => m.Remove({ id: 'gone' }));
    expect(await as(ada, (m) => m.List())).toEqual([]);
    expect(
      await as(ada, (m) => Effect.flip(m.Report(reportOf('gone')))),
    ).toMatchObject({ _tag: 'ConnectionRemoved', id: 'gone' });
    expect(
      await as(ada, (m) => Effect.flip(m.Report(reportOf('fresh')))),
    ).toMatchObject({ _tag: 'ConnectionRemoved', id: 'fresh' });
    const elsewhere = anotherSignIn(ada, 2);
    expect(await as(elsewhere, (m) => m.Report(reportOf('fresh')))).toEqual({
      plugins: { code: CODE },
    });
    expect(
      await as(elsewhere, (m) => Effect.flip(m.Report(reportOf('gone')))),
    ).toMatchObject({ _tag: 'ConnectionRemoved' });
  });

  it('removes a Connection through the Heartbeat too', async () => {
    const ada = signIn('ada');
    await as(ada, (m) => m.Report(reportOf('self')));
    await callOn(answerAs(ada.principal), (m) => m.Remove({ id: 'self' }));
    expect(await as(ada, (m) => m.List())).toEqual([]);
  });

  it('refuses a call with no Sign-in Unauthenticated', async () => {
    expect(
      await as(null, (m) => Effect.flip(m.Report(reportOf('nobody')))),
    ).toMatchObject({ _tag: 'Unauthenticated' });
    expect(await as(null, (m) => Effect.flip(m.List()))).toMatchObject({
      _tag: 'Unauthenticated',
    });
  });
});

describe('Plugins', () => {
  it('changes the next Report and the list when one is enabled or disabled', async () => {
    const ada = signIn('ada');
    await as(ada, (m) => m.Report(reportOf('p1')));
    await as(ada, (m) => m.EnablePlugin({ id: 'p1', plugin: 'notes' }));
    expect(await as(ada, (m) => m.Report(reportOf('p1')))).toEqual({
      plugins: { code: CODE, notes: NOTES },
    });
    expect(await pluginsListed(ada)).toEqual([
      { code: CODE.hash, notes: NOTES.hash },
    ]);
    await as(ada, (m) => m.DisablePlugin({ id: 'p1', plugin: 'notes' }));
    expect(await as(ada, (m) => m.Report(reportOf('p1')))).toEqual({
      plugins: { code: CODE },
    });
  });

  it('runs no default Plugin its User disabled', async () => {
    const ada = signIn('ada');
    await as(ada, (m) => m.Report(reportOf('quiet')));
    await as(ada, (m) => m.DisablePlugin({ id: 'quiet', plugin: 'code' }));
    expect(await as(ada, (m) => m.Report(reportOf('quiet')))).toEqual({
      plugins: {},
    });
    expect(await pluginsListed(ada)).toEqual([{}]);
    expect(await as(ada, (m) => m.Plugins({ id: 'quiet' }))).toEqual([
      { name: 'code', enabledByDefault: true, enabled: false },
      { name: 'notes', enabledByDefault: false, enabled: false },
    ]);
  });

  it('ignores a choice for a Plugin the Catalog no longer has', async () => {
    const ada = signIn('ada');
    await as(ada, (m) => m.Report(reportOf('older')));
    await as(ada, (m) => m.EnablePlugin({ id: 'older', plugin: 'notes' }));
    const narrower = serveOver({
      guard: fakeGuard.rpc({ as: ada.principal }),
      authInfo: AUTH_INFO,
      origins: ORIGINS,
      driver,
      catalog: { code: CATALOG.code },
    });
    expect(await callOn(narrower, (m) => m.Report(reportOf('older')))).toEqual({
      plugins: { code: CODE },
    });
    expect(await callOn(narrower, (m) => m.Plugins({ id: 'older' }))).toEqual([
      { name: 'code', enabledByDefault: true, enabled: true },
    ]);
  });

  it('refuses a Plugin not in the Catalog, and a Connection not the caller’s', async () => {
    const ada = signIn('ada');
    const bob = signIn('bob');
    await as(ada, (m) => m.Report(reportOf('mine-p')));
    expect(
      await as(ada, (m) =>
        Effect.flip(m.EnablePlugin({ id: 'mine-p', plugin: 'nowhere' })),
      ),
    ).toMatchObject({ _tag: 'PluginNotFound', name: 'nowhere' });
    expect(
      await as(ada, (m) =>
        Effect.flip(m.DisablePlugin({ id: 'mine-p', plugin: 'nowhere' })),
      ),
    ).toMatchObject({ _tag: 'PluginNotFound' });
    for (const call of [
      (m: Both) => m.EnablePlugin({ id: 'mine-p', plugin: 'notes' }),
      (m: Both) => m.DisablePlugin({ id: 'mine-p', plugin: 'code' }),
      (m: Both) => m.Plugins({ id: 'mine-p' }),
    ])
      expect(await as(bob, (m) => Effect.flip(call(m)))).toMatchObject({
        _tag: 'ConnectionNotFound',
        id: 'mine-p',
      });
    expect(
      await as(ada, (m) => Effect.flip(m.Plugins({ id: 'unknown' }))),
    ).toMatchObject({ _tag: 'ConnectionNotFound' });
    await as(ada, (m) => m.Remove({ id: 'mine-p' }));
    expect(
      await as(ada, (m) =>
        Effect.flip(m.EnablePlugin({ id: 'mine-p', plugin: 'notes' })),
      ),
    ).toMatchObject({ _tag: 'ConnectionNotFound' });
  });
});

describe('the App API', () => {
  it('renames a Connection: trimmed, kept across Reports, and blank goes back to none', async () => {
    const ada = signIn('ada');
    await as(ada, (m) => m.Report(reportOf('named', 'Ada-MacBook')));
    const listed = () =>
      as(ada, (m) => m.List()).then((all) =>
        all.map(({ name, displayName }) => ({ name, displayName })),
      );
    await as(ada, (m) => m.Rename({ id: 'named', displayName: '  Work  ' }));
    expect(await listed()).toEqual([
      { name: 'Ada-MacBook', displayName: 'Work' },
    ]);
    await as(ada, (m) => m.Report(reportOf('named', 'Ada-Mac')));
    expect(await listed()).toEqual([{ name: 'Ada-Mac', displayName: 'Work' }]);
    await as(ada, (m) => m.Rename({ id: 'named', displayName: '   ' }));
    expect(await listed()).toEqual([{ name: 'Ada-Mac', displayName: null }]);
    await as(ada, (m) => m.Rename({ id: 'named', displayName: 'Again' }));
    await as(ada, (m) => m.Rename({ id: 'named', displayName: null }));
    expect(await listed()).toEqual([{ name: 'Ada-Mac', displayName: null }]);
  });

  it("refuses to rename another User's Connection, an unknown one, or a removed one", async () => {
    const ada = signIn('ada');
    const bob = signIn('bob');
    await as(ada, (m) => m.Report(reportOf('kept-name')));
    for (const [user, id] of [
      [bob, 'kept-name'],
      [ada, 'nowhere'],
    ] as const)
      expect(
        await as(user, (m) =>
          Effect.flip(m.Rename({ id, displayName: 'Other' })),
        ),
      ).toMatchObject({ _tag: 'ConnectionNotFound', id });
    expect(
      (await as(ada, (m) => m.List())).map(({ displayName }) => displayName),
    ).toEqual([null]);
    await as(ada, (m) => m.Remove({ id: 'kept-name' }));
    expect(
      await as(ada, (m) =>
        Effect.flip(m.Rename({ id: 'kept-name', displayName: 'Back' })),
      ),
    ).toMatchObject({ _tag: 'ConnectionNotFound' });
  });

  it("lists only the caller's Connections, never a removed one", async () => {
    const ada = signIn('ada');
    const bob = signIn('bob');
    await as(ada, (m) => m.Report(reportOf('ada-1')));
    await as(ada, (m) => m.Report(reportOf('ada-2')));
    await as(bob, (m) => m.Report(reportOf('bob-1')));
    await as(ada, (m) => m.Remove({ id: 'ada-2' }));
    expect((await as(ada, (m) => m.List())).map(({ id }) => id)).toEqual([
      'ada-1',
    ]);
    expect((await as(bob, (m) => m.List())).map(({ id }) => id)).toEqual([
      'bob-1',
    ]);
  });

  it("leaves another User's Connection alone when asked to remove it", async () => {
    const ada = signIn('ada');
    const bob = signIn('bob');
    await as(ada, (m) => m.Report(reportOf('kept')));
    await as(bob, (m) => m.Remove({ id: 'kept' }));
    await as(bob, (m) => m.Remove({ id: 'nowhere' }));
    expect((await as(ada, (m) => m.List())).map(({ id }) => id)).toEqual([
      'kept',
    ]);
  });

  it('lists a Connection below the Minimum Connect as outdated', async () => {
    const ada = signIn('ada');
    const untold = answerAs(ada.principal, {});
    await callOn(
      untold,
      (m) => m.Report({ ...reportOf('v1'), version: '0.0.2' }),
      {
        version: '0.0.2',
      },
    );
    expect(await as(ada, (m) => m.List())).toMatchObject([
      { id: 'v1', outdated: true },
    ]);
    expect(await callOn(untold, (m) => m.List())).toMatchObject([
      { id: 'v1', outdated: false },
    ]);
  });
});

describe('the routes', () => {
  it('answers /auth with how a Connection signs in, to anyone', async () => {
    const response = await answerAs(null)(new Request(`${CLOUD}/auth`));
    expect(response.status).toBe(200);
    expect(response.headers.get('access-control-allow-origin')).toBe('*');
    expect(await response.json()).toEqual({ ...AUTH_INFO, _v: 'v1' });
  });

  it('serves a Release File by its hash, cached for good, and nothing else', async () => {
    const answer = answerAs(null);
    const found = await answer(new Request(`${CLOUD}/${FILE_KEY}`));
    expect(found.status).toBe(200);
    expect(await found.text()).toBe(FILE);
    expect(found.headers.get('cache-control')).toBe(
      'public, max-age=31536000, immutable',
    );
    expect(found.headers.get('content-type')).toMatch(/^text\/javascript/);
    for (const path of [
      `releases/code/${'d'.repeat(64)}.mjs`,
      'releases/code/latest.mjs',
      `releases/Code/${'c'.repeat(64)}.mjs`,
      `releases/code/${'C'.repeat(64)}.mjs`,
      'releases/',
    ])
      expect((await answer(new Request(`${CLOUD}/${path}`))).status).toBe(404);
    const unbound = serveOver({
      guard: fakeGuard.rpc({ as: null }),
      authInfo: AUTH_INFO,
      origins: ORIGINS,
      driver,
    });
    expect((await unbound(new Request(`${CLOUD}/${FILE_KEY}`))).status).toBe(
      404,
    );
  });

  it('answers 404 anywhere else', async () => {
    expect(
      (await answerAs(null)(new Request(`${CLOUD}/elsewhere`))).status,
    ).toBe(404);
  });

  it('refuses a Heartbeat that names an Origin 403, before reading it', async () => {
    const ada = signIn('ada');
    expect(
      await as(ada, (m) => Effect.flip(m.Report(reportOf('paged'))), SITE),
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
    expect(await as(ada, (m) => m.List())).toEqual([]);
  });

  it("answers an allowed origin's preflight on /rpc, and refuses another origin 403", async () => {
    const answer = answerAs(null);
    const preflight = await answer(
      new Request(`${CLOUD}/rpc`, {
        method: 'OPTIONS',
        headers: {
          origin: SITE,
          'access-control-request-method': 'POST',
          'access-control-request-headers': 'content-type',
        },
      }),
    );
    expect(preflight.status).toBe(204);
    expect(preflight.headers.get('access-control-allow-origin')).toBe(SITE);
    expect(preflight.headers.get('access-control-allow-credentials')).toBe(
      'true',
    );
    expect(preflight.headers.get('access-control-allow-headers')).toBe(
      'content-type',
    );
    const elsewhere = await answer(
      new Request(`${CLOUD}/rpc`, {
        method: 'OPTIONS',
        headers: { origin: 'https://elsewhere.app' },
      }),
    );
    expect(elsewhere.status).toBe(403);
    expect(elsewhere.headers.get('access-control-allow-origin')).toBeNull();
  });

  it("takes an allowed origin's App calls with CORS, and refuses another's before reading them", async () => {
    const ada = signIn('ada');
    await as(ada, (m) => m.Report(reportOf('from-site')));
    await as(
      ada,
      (m) => m.Rename({ id: 'from-site', displayName: 'Site' }),
      SITE,
    );
    const forged = await answerAs(ada.principal)(
      new Request(`${CLOUD}/rpc`, {
        method: 'POST',
        headers: {
          origin: 'https://pr1-code.elsewhere.app',
          'content-type': 'text/plain',
        },
        body: JSON.stringify({ _tag: 'Request', tag: 'Remove' }),
      }),
    );
    expect(forged.status).toBe(403);
    expect(await as(ada, (m) => m.List(), SITE)).toMatchObject([
      { id: 'from-site', displayName: 'Site' },
    ]);
  });
});

describe('a ke-connect below the Minimum Connect', () => {
  const raw = (
    answer: (request: Request) => Promise<Response>,
    headers: Record<string, string>,
    path = HEARTBEAT_PATH,
  ) =>
    answer(
      new Request(`${CLOUD}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/ndjson', ...headers },
        body: `${JSON.stringify({ _tag: 'Request', id: '1', tag: 'Remove', payload: { _v: 'v1', id: 'x' }, headers: [] })}\n`,
      }),
    );

  const line = (named: string) =>
    `${named} is older than Connect Cloud accepts (${MIN_CONNECT}): run \`npm i -g @kestack/connect@latest\`, then start it again.`;

  it('is answered 426 and one line of plain text, with no version header or an older one', async () => {
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
    expect(await as(ada, (m) => m.List())).toEqual([]);
  });

  it('lets one at the Minimum Connect or above through', async () => {
    const ada = signIn('ada');
    for (const version of [MIN_CONNECT, '0.1.0'])
      expect(
        await callOn(
          answerAs(ada.principal),
          (m) => m.Report(reportOf(`at-${version}`)),
          { version },
        ),
      ).toEqual({ plugins: { code: CODE } });
  });

  it('checks no version when there is no Minimum Connect', async () => {
    const ada = signIn('ada');
    const untold = answerAs(ada.principal, {});
    expect((await raw(untold, {})).status).toBe(200);
  });

  it('leaves the App calls at /rpc alone', async () => {
    const response = await raw(answerAs(null), {}, '/rpc');
    expect(response.status).toBe(200);
    expect(await response.text()).not.toMatch(/older than Connect Cloud/);
  });
});
