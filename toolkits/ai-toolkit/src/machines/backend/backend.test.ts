import { Effect } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Principal } from '@kestack/auth-toolkit';
import { testAuth } from '@kestack/auth-toolkit/server/rpc';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kestack/std-toolkit/db/sqlite/node';
import { MachinesClient } from '../client/index.js';
import type { MachineReport } from '../contract/index.js';
import { machinesTable, serveOver } from './index.js';

/*
 * The Machines Backend over an in-memory SQLite database, called through
 * `MachinesClient`, with `testAuth` saying who signed each request. Each
 * test signs in Users of its own, so they share one database.
 */

const SITE = 'https://code.test';
const BACKEND = 'https://api-code.test';
const AUTH_INFO = { url: 'https://auth.test' };

const driver = makeNodeSQLite({ path: ':memory:' });

beforeAll(() =>
  Effect.runPromise(SQLite.setup(machinesTable, { database: driver })),
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
    } as unknown as Principal,
  };
};

/** The same User on another Sign-in, as a second Machine would be. */
const anotherSignIn = (user: ReturnType<typeof signIn>, n: number) => ({
  ...user,
  principal: {
    ...user.principal,
    session: { id: `s-${user.id}-${n}` },
  } as unknown as Principal,
});

const answerAs = (principal: Principal | null) =>
  serveOver({
    guard: testAuth(principal),
    authInfo: AUTH_INFO,
    site: SITE,
    driver,
  });

/** Runs `program` with the Backend's client, signed as `user` (nobody for null). */
const as = <A, E>(
  user: { readonly principal: Principal } | null,
  program: (machines: MachinesClient['Service']) => Effect.Effect<A, E>,
) => {
  const answer = answerAs(user?.principal ?? null);
  const fetch = (input: RequestInfo | URL, init?: RequestInit) =>
    answer(new Request(input, init));
  return Effect.runPromise(
    Effect.gen(function* () {
      return yield* program(yield* MachinesClient);
    }).pipe(
      Effect.provide(MachinesClient.layer(BACKEND)),
      Effect.provideService(
        FetchHttpClient.Fetch,
        fetch as typeof globalThis.fetch,
      ),
    ),
  );
};

const reportOf = (id: string, name = 'laptop'): MachineReport => ({
  id,
  name,
  url: `https://${id}.tunnel.test`,
  key: `key-${id}`,
  version: '0.0.2',
  tunnel: { ok: true, at: 1, problem: null },
});

describe('the Machines Backend', () => {
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

  it("lists only the caller's Machines", async () => {
    const ada = signIn('ada');
    const bob = signIn('bob');
    await as(ada, (m) => m.Report(reportOf('ada-1')));
    await as(bob, (m) => m.Report(reportOf('bob-1')));
    expect((await as(bob, (m) => m.List({}))).map(({ id }) => id)).toEqual([
      'bob-1',
    ]);
  });

  it("refuses another User's Machine id MachineTaken", async () => {
    const ada = signIn('ada');
    const bob = signIn('bob');
    await as(ada, (m) => m.Report(reportOf('taken')));
    expect(
      await as(bob, (m) => Effect.flip(m.Report(reportOf('taken')))),
    ).toMatchObject({ _tag: 'MachineTaken', id: 'taken' });
  });

  it('forgets a Machine for good: its id, and its Sign-in under a new id', async () => {
    const ada = signIn('ada');
    await as(ada, (m) => m.Report(reportOf('gone')));
    await as(ada, (m) => m.Forget({ id: 'gone' }));
    // Forgetting again does nothing more.
    await as(ada, (m) => m.Forget({ id: 'gone' }));
    expect(await as(ada, (m) => m.List({}))).toEqual([]);
    expect(
      await as(ada, (m) => Effect.flip(m.Report(reportOf('gone')))),
    ).toMatchObject({ _tag: 'MachineForgotten', id: 'gone' });
    expect(
      await as(ada, (m) => Effect.flip(m.Report(reportOf('fresh')))),
    ).toMatchObject({ _tag: 'MachineForgotten', id: 'fresh' });
    // The same User on another Sign-in is a Machine of their own.
    const elsewhere = anotherSignIn(ada, 2);
    expect(
      await as(elsewhere, (m) => m.Report(reportOf('fresh'))),
    ).toMatchObject({ id: 'fresh' });
    // The forgotten id stays forgotten whatever the Sign-in.
    expect(
      await as(elsewhere, (m) => Effect.flip(m.Report(reportOf('gone')))),
    ).toMatchObject({ _tag: 'MachineForgotten' });
  });

  it("leaves another User's Machine alone when asked to forget it", async () => {
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

  it('answers /auth with how a Machine signs in, to anyone', async () => {
    const response = await answerAs(null)(new Request(`${BACKEND}/auth`));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(AUTH_INFO);
  });

  it("answers the site's preflight, and lets no other origin read it", async () => {
    const answer = answerAs(null);
    const preflight = await answer(
      new Request(`${BACKEND}/rpc`, {
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
    const elsewhere = await answer(
      new Request(`${BACKEND}/rpc`, {
        method: 'OPTIONS',
        headers: { origin: 'https://elsewhere.test' },
      }),
    );
    expect(elsewhere.headers.get('access-control-allow-origin')).toBeNull();
  });
});
