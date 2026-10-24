import { Effect, Schema } from 'effect';
import { FetchHttpClient } from 'effect/http';
import { beforeAll, describe, expect, it } from 'vitest';
import type { Principal } from '@kestack/auth-toolkit';
import { fakeGuard } from '@kestack/auth-toolkit/fake';
import { SQLite } from '@kestack/std-toolkit/db/sqlite';
import { makeNodeSQLite } from '@kestack/std-toolkit/db/sqlite/node';
import { MachinesClient } from '../client/index.js';
import { type AuthInfo, MachineReport } from '../contract/index.js';
import { machinesTable, serve, serveOver } from './index.js';

/*
 * The Machines Backend over an in-memory SQLite database, called through
 * `MachinesClient`, with `fakeGuard.rpc({ as })` saying who signed each request. Each
 * test signs in Users of its own, so they share one database.
 */

const SITE = 'https://code.test';
const BACKEND = 'https://api-code.test';
const AUTH_INFO = { url: 'https://auth.test' };

const driver = makeNodeSQLite({ path: ':memory:' });

beforeAll(() =>
  Effect.runPromise(
    SQLite.setup(machinesTable, { database: driver, mode: 'persistent' }),
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

/** The same User on another Sign-in, as a second Machine would be. */
const anotherSignIn = (user: ReturnType<typeof signIn>, n: number) => ({
  ...user,
  principal: {
    ...user.principal,
    session: { id: `s-${user.id}-${n}` },
  } as unknown as Principal,
});

const answerAs = (
  principal: Principal | null,
  authInfo: AuthInfo = AUTH_INFO,
) =>
  serveOver({
    guard: fakeGuard.rpc({ as: principal }),
    authInfo,
    site: SITE,
    driver,
  });

/**
 * Runs `program` with the Backend's client, signed as `user` (nobody for
 * null), on a Backend signing in as `authInfo` says; from a page at
 * `origin` when given, else as `serve` calls, with no Origin.
 */
const as = <A, E>(
  user: { readonly principal: Principal } | null,
  program: (machines: MachinesClient['Service']) => Effect.Effect<A, E>,
  authInfo: AuthInfo = AUTH_INFO,
  origin?: string,
) => {
  const answer = answerAs(user?.principal ?? null, authInfo);
  const fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    if (origin !== undefined) request.headers.set('origin', origin);
    return answer(request);
  };
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
  key: `key-${id}`,
  version: '0.0.2',
  status: { _tag: 'Reachable', url: `https://${id}.tunnel.test`, at: 1 },
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

  it("in Local mode, where a User's Machines share one Sign-in, forgets only the Machine's id", async () => {
    const ada = signIn('ada');
    const local = { local: true } as const;
    await as(ada, (m) => m.Report(reportOf('local-gone')), local);
    await as(ada, (m) => m.Report(reportOf('local-kept')), local);
    await as(ada, (m) => m.Forget({ id: 'local-gone' }), local);
    expect(
      await as(
        ada,
        (m) => Effect.flip(m.Report(reportOf('local-gone'))),
        local,
      ),
    ).toMatchObject({ _tag: 'MachineForgotten', id: 'local-gone' });
    expect(
      await as(ada, (m) => m.Report(reportOf('local-kept')), local),
    ).toMatchObject({ id: 'local-kept' });
    expect(
      await as(ada, (m) => m.Report(reportOf('local-fresh')), local),
    ).toMatchObject({ id: 'local-fresh' });
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

  it("takes the site's calls, and refuses another origin's 403 before reading them", async () => {
    const ada = signIn('ada');
    await as(ada, (m) => m.Report(reportOf('from-site')), AUTH_INFO, SITE);
    const answer = answerAs(ada.principal);
    // A simple POST, as a page of the same site could send with the cookie.
    const forged = await answer(
      new Request(`${BACKEND}/rpc`, {
        method: 'POST',
        headers: {
          origin: 'https://pr1-code.test',
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
        AUTH_INFO,
        'https://elsewhere.test',
      ),
    ).toBeDefined();
    expect((await as(ada, (m) => m.List({}))).map(({ id }) => id)).toEqual([
      'from-site',
    ]);
  });

  it('takes a Report only with an https:// address, or none, and every field bounded', async () => {
    // Client and Backend both check the payload against the contract.
    const valid = Schema.is(MachineReport);
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

describe('serve', () => {
  const database = {} as never;
  const site = 'https://code.example.com';

  it('is Local mode only for exactly `{ local: true }`', async () => {
    const answer = serve({ auth: { local: true }, site, database });
    const info = await (await answer(new Request(`${site}/auth`))).json();
    expect(info).toEqual({ local: true });
  });

  it('never falls into Local mode from a mistyped config', () => {
    for (const auth of [
      { url: 'https://auth.example.com', local: true },
      { url: 'https://auth.example.com', local: false },
    ]) {
      expect(() => serve({ auth: auth as never, site, database })).toThrow(
        /local/,
      );
    }
  });
});
