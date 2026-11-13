import 'fake-indexeddb/auto';
import {
  Context,
  Deferred,
  Effect,
  Layer,
  Scope,
  Stream,
  SubscriptionRef,
} from 'effect';
import { TestClock } from 'effect/testing';
import {
  type Account as Signed,
  Accounts,
  AccountsState,
  AuthWorkerRejected,
} from '@kestack/auth-toolkit/client';
import { CodeClient, CodeClients } from '@kestack/connect/code';
import {
  CloudClient,
  type Connection as ConnectionSchema,
  PLUGIN_MISMATCH,
} from '@kestack/connect/cloud';
import { OnOutdated } from '@kestack/std-toolkit/replica';
import { Actor, Runtime } from '@kestack/kabuki';
import type { Instance } from '@kestack/kabuki/types';
import { Navigation } from '@kestack/kabuki/routing';
import {
  connection as RpcConnection,
  type SocketWatch,
} from '@kestack/rpc-toolkit/rpc/websocket';
import { describe, expect, it, vi } from 'vitest';
import { home } from '../../app.ts';
import { Preferences } from '../../storage/index.ts';
import {
  type Gone,
  type Parts,
  Storage,
  storageMemory,
} from '../../storage/index.ts';
import {
  Connections,
  connectionsMemory,
  type Known,
  nobody,
  type SetupParts,
} from '../account.ts';
import {
  accountWith,
  CHECK_FOR,
  knownOf,
  RECHECK,
  standOf,
  type Who,
  whoOf,
} from '../actor.ts';
import { PLUGIN_CODE } from '../connection/link/index.ts';
import {
  borrowing,
  byConnection,
  Sockets,
} from '../connection/link/reach/index.ts';
import { ListShelf } from '../commands.ts';
import { SetupShelf } from '../connection/commands.ts';

/*
 * The Account's page with Cloud Connect, who is signed in and the databases
 * stood in for. Active, the list kept in the Account's database shows first
 * and Cloud Connect's answer replaces it and is kept; only the first answer
 * prunes, and only the Account's own Connections not on it, by database,
 * never the Account; a list that failed prunes nothing. Forget asks Cloud
 * Connect, takes the Connection out of the list, then stops its records and
 * deletes its database alone, its Saved Drafts with it; and while a
 * Connection's link is not up Cloud Connect is asked again, every few
 * seconds, until every link is. A kept list's Last Seen is believed only
 * once Cloud Connect answers, or `CHECK_FOR` passes without. Not the
 * Account active, it is Away: it asks nothing, shares nobody's
 * Connections, opens no socket, and says why: signed out, switched
 * elsewhere, another active, or not signed in here. It never moves by
 * itself: only a switch asked in this tab, from the header or the sign-in
 * screen, goes to the new Account's home. Its sockets are its
 * Connections' own, closed as it leaves Active.
 */

type Connection = typeof ConnectionSchema.Type;

const connection = (
  id: string,
  lastSeen: number,
  url: string | null = `https://${id}.trycloudflare.com`,
): Connection => ({
  id,
  name: id,
  key: `key-${id}`,
  version: '0.0.1',
  status:
    url === null
      ? { _tag: 'Opening' }
      : { _tag: 'Reachable', url, at: lastSeen },
  lastSeen,
  plugins: {},
  wanted: {},
  minConnect: null,
  displayName: null,
});

/** An Account signed in on this browser. */
const person = (id: string): Signed => ({
  id,
  email: `${id}@example.com`,
  name: id,
  image: null,
  test: false,
});

/** Signed in as `active`, beside `others`. */
const signedIn = (active: string, ...others: ReadonlyArray<string>) =>
  AccountsState.SignedIn({
    active: person(active),
    accounts: [active, ...others].map(person),
  });

/** The page of `a1`, at `page` under it, as the root page holds it. */
const OwnerOf = (
  clients: Layer.Layer<CodeClients, never, never>,
  page: unknown,
) =>
  Actor.define('Owner', {}).build({
    children: {
      account: Actor.child(
        accountWith(
          Layer.mergeAll(
            byConnection,
            borrowing,
            Sockets.from(clients),
          ) as never,
        ),
        {
          props: () => ({
            params: { accountId: 'a1' },
            query: {},
            route: {
              name: 'Account',
              params: { accountId: 'a1' },
              ...(page === undefined ? {} : { page: page as never }),
              notFound: null,
            },
          }),
        },
      ),
    },
  });

/** A session of `m1`'s project `p1`, as an Account's page names it. */
const AT_SESSION = {
  _tag: 'Project',
  connectionId: 'm1',
  projectId: 'p1',
  page: { _tag: 'Session', sessionId: 's1' },
};

/** The one Background Job `m1` says its session `s1` runs. */
const JOB = { id: 'j1', kind: 'shell' as const, title: 'pnpm dev' };

type Api = CodeClient['Service'];

/** A test's stand-ins, and what they were asked; every link is up unless `down` says otherwise; the page at `page`, else home. */
const world = (
  listed: Effect.Effect<ReadonlyArray<Connection>, Error>,
  down: SubscriptionRef.SubscriptionRef<ReadonlySet<string>> | null = null,
  signed: Stream.Stream<AccountsState> = Stream.concat(
    Stream.make(signedIn('a1')),
    Stream.never,
  ),
  page?: unknown,
) => {
  const forgotten: Array<string> = [];
  /** Each prune of the Account's Connections, by database. */
  const kept: Array<{
    accountId: string;
    connectionIds: ReadonlyArray<string>;
  }> = [];
  /** The Connections whose records were stopped and deleted. */
  const dropped: Array<string> = [];
  /** The Connections whose databases were deleted. */
  const deleted: Array<string> = [];
  /** The Gones told to the Saved Drafts. */
  const drafts: Array<string> = [];
  /** Where the app moved, in place of the page. */
  const moved: Array<unknown> = [];
  /** The Accounts switched to. */
  const switched: Array<string> = [];
  /** Each sign-in asked, with its options. */
  const signIns: Array<unknown> = [];
  let lists = 0;
  /** How many reads of a job's output were opened, and how many ended. */
  const output = { opened: 0, ended: 0 };
  /** What each Connection's sockets tell the app as they answer and close. */
  const watches = new Map<string, SocketWatch>();
  /** How many sockets are open now, to any Connection. */
  const sockets = { open: 0 };
  const socket = (connectionId: string) =>
    down === null
      ? Stream.concat(Stream.make('connected' as const), Stream.never)
      : SubscriptionRef.changes(down).pipe(
          Stream.map((ids) =>
            ids.has(connectionId)
              ? ('reconnecting' as const)
              : ('connected' as const),
          ),
        );
  const clients = CodeClients.make((connectionId, watch) =>
    Layer.mergeAll(
      Layer.effectDiscard(
        Effect.sync(() => void watches.set(connectionId, watch)),
      ),
      Layer.effectDiscard(
        Effect.acquireRelease(
          Effect.sync(() => void sockets.open++),
          () => Effect.sync(() => void sockets.open--),
        ),
      ),
      // An RPC client's procedures are generic over how they are called;
      // a stand-in answers the one way the app calls them.
      Layer.mock(CodeClient)({
        watchSpeechToText: (() =>
          Stream.make({
            _tag: 'Off' as const,
          })) as unknown as Api['watchSpeechToText'],
        harnessAccounts: (() =>
          Effect.succeed([])) as unknown as Api['harnessAccounts'],
        harnesses: (() => Effect.succeed([])) as unknown as Api['harnesses'],
        projects: (() => Stream.never) as unknown as Api['projects'],
        sessions: (() => Stream.never) as unknown as Api['sessions'],
        messages: (() => Stream.never) as unknown as Api['messages'],
        backgroundJobs: (() =>
          Stream.concat(
            Stream.make([{ sessionId: 's1', projectId: 'p1', jobs: [JOB] }]),
            Stream.never,
          )) as unknown as Api['backgroundJobs'],
        backgroundJobOutput: (() =>
          Stream.suspend(() => {
            output.opened++;
            return Stream.never;
          }).pipe(
            Stream.ensuring(Effect.sync(() => void output.ended++)),
          )) as unknown as Api['backgroundJobOutput'],
      }),
      Layer.mock(RpcConnection)({
        connectionStatus: socket(connectionId),
        keepSubscribed: (subscribe) => subscribe(),
        hooks: { onConnect: Effect.void, onDisconnect: Effect.void },
      }),
    ),
  );
  const layer = Layer.mergeAll(
    Layer.succeed(OnOutdated, Effect.void),
    Layer.mock(Accounts)({
      state: signed,
      // A switch only says it was asked: the test says who is active.
      switchTo: (id) =>
        id === 'refused'
          ? Effect.fail(
              new AuthWorkerRejected({
                url: 'https://auth.example.com',
                status: 403,
                reason: 'No such Account',
              }),
            )
          : Effect.sync(() => void switched.push(id)),
      signIn: (options) => Effect.sync(() => void signIns.push(options)),
    }),
    Layer.mock(Navigation)({
      replace: (to) => Effect.sync(() => void moved.push(to)),
      push: (to) => Effect.sync(() => void moved.push(to)),
    }),
    // The frame waits for its keyboard: never read here.
    Layer.mock(Preferences)({ read: Effect.never, changes: Stream.never }),
    Layer.mock(CloudClient)({
      // A Connection forgotten is no longer listed.
      List: () =>
        Effect.andThen(
          Effect.sync(() => void lists++),
          Effect.map(listed, (each) =>
            each.filter(({ id }) => !forgotten.includes(id)),
          ),
        ),
      Forget: ({ id }: { readonly id: string }) =>
        Effect.sync(() => void forgotten.push(id)),
    } as never),
  );
  // What is kept, in memory; what is pruned and dropped, said.
  const over = (parts: Parts): Partial<Parts> => ({
    sync: {
      ...parts.sync,
      drop: (gone: Gone) =>
        Effect.sync(() => {
          if (gone._tag === 'Connection') dropped.push(gone.connectionId);
        }),
    },
    databases: {
      ...parts.databases,
      pruneConnections: (accountId, connectionIds) =>
        Effect.sync(() => void kept.push({ accountId, connectionIds })),
      dropConnection: (_, connectionId) =>
        Effect.sync(() => void deleted.push(connectionId)),
    },
    drafts: {
      ...parts.drafts,
      drop: (gone) => Effect.sync(() => void drafts.push(gone._tag)),
    },
  });
  return {
    layer,
    over,
    OwnerLive: OwnerOf(clients, page),
    forgotten,
    kept,
    dropped,
    deleted,
    drafts,
    moved,
    switched,
    signIns,
    watches,
    sockets,
    output,
    lists: () => lists,
  };
};

const wait = (ms = 20) =>
  Effect.promise(() => new Promise((done) => setTimeout(done, ms)));

/** The cache alone, as `Storage` holds it, for a test to read and write. */
class Cache extends Context.Service<Cache, Storage['Service']['cache']>()(
  'test/Cache',
) {}

/** The cache in memory. */
const cacheMemory = () =>
  Layer.effect(
    Cache,
    Effect.map(Storage, ({ cache }) => cache),
  ).pipe(Layer.provide(storageMemory()));

/** Runs a test with what is kept in memory, `Kept` handed to its app too. */
const run = <A>(effect: Effect.Effect<A, unknown, Scope.Scope | Cache>) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(
      Effect.provide(cacheMemory()),
    ) as Effect.Effect<A>,
  );

/** Starts the app over the stand-ins and the test's `Kept`. */
const start = (
  the: Pick<ReturnType<typeof world>, 'OwnerLive' | 'layer' | 'over'>,
  over?: Layer.Layer<typeof OnOutdated.Identifier>,
) =>
  Effect.flatMap(Cache, (kept) =>
    Runtime.scoped(the.OwnerLive as never, {
      window: 0,
      layer: Layer.mergeAll(
        over === undefined ? the.layer : Layer.merge(the.layer, over),
        storageMemory((parts) => ({
          ...the.over(parts),
          cache: { ...parts.cache, ...kept },
        })),
      ) as never,
    }),
  ) as Effect.Effect<Runtime, never, Scope.Scope | Cache>;

const a1 = { accountId: 'a1', connectionId: null, projectId: null };
const setupOf = (connectionId: string) => ({
  accountId: 'a1',
  connectionId,
  projectId: null,
});
const speechOff: SetupParts = {
  accounts: null,
  speech: { _tag: 'Off' },
  harnesses: null,
  models: [],
};

const walk = (at: Instance): ReadonlyArray<Instance> => [
  at,
  ...Object.values(at.children).flatMap((child) =>
    ((Array.isArray(child) ? child : [child]) as Array<Instance>).flatMap(walk),
  ),
];

/** The Account's page. */
const list = (app: Runtime) =>
  walk(app.snapshot.root).find((each) => each.actor === 'Page')!;

/** Whether the list's Last Seen is believed yet. */
const checkedOf = (app: Runtime) =>
  (list(app).model as { readonly checked: boolean }).checked;

const listModel = (app: Runtime) => {
  const { list: held, fetchedAt } = list(app).model as {
    readonly list: { readonly value: ReadonlyArray<Connection> | null };
    readonly fetchedAt: number | null;
  };
  return { connections: held.value, fetchedAt };
};

describe('the Account, active', () => {
  it('shows the saved list first, then Cloud Connect’s, and keeps it', async () => {
    const answer = await Effect.runPromise(
      Deferred.make<ReadonlyArray<Connection>>(),
    );
    const { OwnerLive, layer, over, kept, drafts, deleted } = world(
      Deferred.await(answer),
    );
    await run(
      Effect.gen(function* () {
        const saved = yield* Cache;
        yield* saved.write(ListShelf, a1, [connection('m1', 1)]);
        yield* saved.write(SetupShelf, setupOf('m1'), speechOff);
        yield* saved.write(SetupShelf, setupOf('m2'), speechOff);
        const app = yield* start({ OwnerLive, layer, over });
        yield* wait();
        expect(listModel(app).connections?.map(({ id }) => id)).toEqual(['m1']);
        expect(listModel(app).fetchedAt).toBeNull();
        // The saved list may be stale: nothing is deleted for it.
        expect(kept).toEqual([]);
        yield* Deferred.succeed(answer, [
          connection('m2', 2),
          connection('m3', 3),
        ]);
        yield* wait();
        expect(listModel(app).connections?.map(({ id }) => id)).toEqual([
          'm2',
          'm3',
        ]);
        expect(yield* saved.read(ListShelf, a1)).toHaveLength(2);
        // A Connection gone from the first list goes with its database, of the
        // Account's own Connections alone, and none is told one by one.
        expect(kept).toEqual([
          { accountId: 'a1', connectionIds: ['m2', 'm3'] },
        ]);
        expect(drafts).toEqual([]);
        expect(deleted).toEqual([]);
        expect((yield* saved.read(SetupShelf, setupOf('m2')))?.speech).toEqual({
          _tag: 'Off',
        });
      }),
    );
  });

  it('deletes nothing for a later list, which another tab may have outrun', async () => {
    let listed: ReadonlyArray<Connection> = [
      connection('m1', 1),
      connection('m2', 2),
    ];
    const { OwnerLive, layer, over, kept } = world(Effect.sync(() => listed));
    await run(
      Effect.gen(function* () {
        const app = yield* start({ OwnerLive, layer, over });
        yield* wait();
        expect(kept).toEqual([
          { accountId: 'a1', connectionIds: ['m1', 'm2'] },
        ]);
        listed = [connection('m1', 1)];
        app.send(list(app).address, { _tag: 'ReloadAsked' });
        yield* wait();
        expect(listModel(app).connections?.map(({ id }) => id)).toEqual(['m1']);
        expect(kept).toHaveLength(1);
      }),
    );
  });

  it('keeps nothing less when Cloud Connect cannot be asked', async () => {
    const { OwnerLive, layer, over, kept } = world(
      Effect.fail(new Error('offline')),
    );
    await run(
      Effect.gen(function* () {
        const saved = yield* Cache;
        yield* saved.write(ListShelf, a1, [connection('m1', 1)]);
        const app = yield* start({ OwnerLive, layer, over });
        yield* wait();
        expect(listModel(app).connections?.map(({ id }) => id)).toEqual(['m1']);
        expect(kept).toEqual([]);
      }),
    );
  });

  it('forgets a Connection at Cloud Connect, takes it out of the list, then deletes its database here, and no other', async () => {
    const {
      OwnerLive,
      layer,
      over,
      forgotten,
      kept,
      dropped,
      deleted,
      drafts,
    } = world(Effect.succeed([connection('m1', 5), connection('m2', 1)]));
    await run(
      Effect.gen(function* () {
        const saved = yield* Cache;
        yield* saved.write(SetupShelf, setupOf('m1'), speechOff);
        yield* saved.write(SetupShelf, setupOf('m2'), speechOff);
        const app = yield* start({ OwnerLive, layer, over });
        yield* wait();
        app.send(list(app).address, { _tag: 'ForgetAsked', id: 'm1' });
        yield* wait();
        expect(forgotten).toEqual(['m1']);
        // Its own alone: another tab may list a Connection not heard of here.
        expect(dropped).toEqual(['m1']);
        expect(drafts).toEqual(['Connection']);
        expect(deleted).toEqual(['m1']);
        expect(yield* saved.read(SetupShelf, setupOf('m2'))).not.toBeNull();
        expect(kept).toHaveLength(1);
        expect(listModel(app).connections?.map(({ id }) => id)).toEqual(['m2']);
      }),
    );
  });

  it('takes a rename into the list at once, keeps it, and drops an answer asked before it', async () => {
    const stale = await Effect.runPromise(
      Deferred.make<ReadonlyArray<Connection>>(),
    );
    const before = [connection('m1', 1), connection('m2', 2)];
    // The first ask, then one that answers late, then Cloud Connect renamed.
    const answers = [
      Effect.succeed(before),
      Deferred.await(stale),
      Effect.succeed([
        { ...connection('m1', 1), displayName: 'Work' },
        connection('m2', 2),
      ]),
    ];
    let asked = 0;
    const { OwnerLive, layer, over } = world(
      Effect.suspend(() => answers[Math.min(asked++, answers.length - 1)]!),
    );
    await run(
      Effect.gen(function* () {
        const saved = yield* Cache;
        const app = yield* start({ OwnerLive, layer, over });
        yield* wait();
        // Asked before the rename, answered after it, with the old name.
        app.send(list(app).address, { _tag: 'ReloadAsked' });
        yield* wait();
        app.send(list(app).address, {
          _tag: 'Renamed',
          id: 'm1',
          displayName: 'Work',
        });
        yield* wait();
        const names = (connections: ReadonlyArray<Connection> | null) =>
          connections?.map(({ id, displayName }) => [id, displayName]);
        expect(names(listModel(app).connections)).toEqual([
          ['m1', 'Work'],
          ['m2', null],
        ]);
        expect(names(yield* saved.read(ListShelf, a1))).toEqual([
          ['m1', 'Work'],
          ['m2', null],
        ]);
        yield* Deferred.succeed(stale, before);
        yield* wait();
        expect(asked).toBe(3);
        expect(names(listModel(app).connections)).toEqual([
          ['m1', 'Work'],
          ['m2', null],
        ]);
      }),
    );
  });

  it('shares what it holds as `Connections`, which waits for an address', async () => {
    let reached: string | null = null;
    await Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const known = yield* SubscriptionRef.make<Known>({
            ...nobody,
            accountId: 'a1',
            connections: [connection('m1', 1, null)],
          });
          yield* Effect.gen(function* () {
            const connections = yield* Effect.service(Connections);
            yield* Effect.forkScoped(
              Effect.flatMap(connections.reachable('m1'), ({ tunnel }) =>
                Effect.sync(() => {
                  reached = tunnel;
                }),
              ),
            );
            yield* wait();
            expect(reached).toBeNull();
            yield* SubscriptionRef.set(known, {
              ...nobody,
              accountId: 'a1',
              connections: [connection('m1', 2)],
            });
            yield* wait();
          }).pipe(Effect.provide(connectionsMemory(known)));
        }),
      ),
    );
    expect(reached).toBe('wss://m1.trycloudflare.com');
  });
});

describe('the Account, by who is active', () => {
  /** Who is signed in, as the test says. */
  const signedAs = (first: AccountsState) =>
    Effect.map(SubscriptionRef.make(first), (ref) => ({
      ref,
      stream: SubscriptionRef.changes(ref),
    }));

  const stateOf = (app: Runtime) => list(app).state;

  /** `active` signed in beside `others`, a switch to `to` under way. */
  const switching = (
    to: string,
    active: string,
    ...others: ReadonlyArray<string>
  ) =>
    AccountsState.SignedIn({
      active: person(active),
      accounts: [active, ...others].map(person),
      switchingTo: person(to),
    });

  const away = (why: unknown) => ({ _tag: 'Away', why });

  it('is Active as the Account active, and asks for its list', async () => {
    await run(
      Effect.gen(function* () {
        const the = world(Effect.succeed([connection('m1', 1)]));
        const app = yield* start(the);
        yield* wait();
        expect(stateOf(app)).toEqual({
          _tag: 'Active',
          email: 'a1@example.com',
        });
        expect(the.lists()).toBe(1);
      }),
    );
  });

  it('is Away while another Account signed in here is active, and asks for nothing, opening no socket', async () => {
    await run(
      Effect.gen(function* () {
        const { stream } = yield* signedAs(signedIn('a2', 'a1'));
        const the = world(Effect.succeed([connection('m1', 1)]), null, stream);
        const app = yield* start(the);
        yield* wait();
        expect(stateOf(app)).toEqual(
          away({
            _tag: 'Other',
            email: 'a1@example.com',
            active: 'a2@example.com',
          }),
        );
        expect(the.lists()).toBe(0);
        expect(the.watches.size).toBe(0);
        expect(the.sockets.open).toBe(0);
      }),
    );
  });

  it('is Away for an Account not signed in on this browser', async () => {
    await run(
      Effect.gen(function* () {
        const { stream } = yield* signedAs(signedIn('a2'));
        const the = world(Effect.succeed([]), null, stream);
        const app = yield* start(the);
        yield* wait();
        expect(stateOf(app)).toEqual(away({ _tag: 'NotHere' }));
        expect(the.lists()).toBe(0);
      }),
    );
  });

  it('says another tab switched while it was Active, and stays where it is', async () => {
    await run(
      Effect.gen(function* () {
        const { ref, stream } = yield* signedAs(signedIn('a1', 'a2'));
        const the = world(Effect.succeed([connection('m1', 1)]), null, stream);
        const app = yield* start(the);
        yield* wait();
        yield* SubscriptionRef.set(ref, signedIn('a2', 'a1'));
        yield* wait();
        expect(stateOf(app)).toEqual(
          away({
            _tag: 'Switched',
            email: 'a1@example.com',
            active: 'a2@example.com',
          }),
        );
        expect(the.moved).toEqual([]);
        // Its Connections stop with it.
        expect(
          walk(app.snapshot.root).some((each) => each.actor === 'Connection'),
        ).toBe(false);
        // Added in another tab, it is the same.
        yield* SubscriptionRef.set(ref, signedIn('a3', 'a2', 'a1'));
        yield* wait();
        expect(stateOf(app)).toEqual(
          away({
            _tag: 'Switched',
            email: 'a1@example.com',
            active: 'a3@example.com',
          }),
        );
        expect(the.moved).toEqual([]);
      }),
    );
  });

  it('says its Account is signed out, here or elsewhere, and stays where it is', async () => {
    await run(
      Effect.gen(function* () {
        const { ref, stream } = yield* signedAs(signedIn('a1', 'a2'));
        const the = world(Effect.succeed([]), null, stream);
        const app = yield* start(the);
        yield* wait();
        expect(stateOf(app)._tag).toBe('Active');
        yield* SubscriptionRef.set(ref, signedIn('a2'));
        yield* wait();
        expect(stateOf(app)).toEqual(
          away({ _tag: 'SignedOut', email: 'a1@example.com' }),
        );
        expect(the.moved).toEqual([]);
      }),
    );
  });

  it('goes to the new Account’s home after a switch made from the header', async () => {
    await run(
      Effect.gen(function* () {
        const { ref, stream } = yield* signedAs(signedIn('a1', 'a2'));
        const the = world(Effect.succeed([]), null, stream);
        const app = yield* start(the);
        yield* wait();
        yield* SubscriptionRef.set(ref, switching('a2', 'a1', 'a2'));
        yield* wait();
        expect(stateOf(app)._tag).toBe('Active');
        yield* SubscriptionRef.set(ref, signedIn('a2', 'a1'));
        yield* wait();
        expect(the.moved).toEqual([home('a2')]);
      }),
    );
  });

  it('stays, saying why, when it was Active only as this device kept it and the Auth Worker answers another', async () => {
    await run(
      Effect.gen(function* () {
        const { ref, stream } = yield* signedAs(
          AccountsState.Checking({ last: person('a1') }),
        );
        const the = world(Effect.succeed([]), null, stream);
        const app = yield* start(the);
        yield* wait();
        expect(stateOf(app)._tag).toBe('Active');
        yield* SubscriptionRef.set(ref, signedIn('a2', 'a1'));
        yield* wait();
        expect(the.moved).toEqual([]);
        expect(stateOf(app)).toEqual(
          away({
            _tag: 'Switched',
            email: 'a1@example.com',
            active: 'a2@example.com',
          }),
        );
      }),
    );
  });

  it('switches to its own Account, chosen, only once the Auth Worker has answered, and stays where it is', async () => {
    await run(
      Effect.gen(function* () {
        const { ref, stream } = yield* signedAs(
          AccountsState.Checking({ last: person('a2') }),
        );
        const the = world(Effect.succeed([]), null, stream);
        const app = yield* start(the);
        yield* wait();
        app.send(list(app).address, { _tag: 'ChooseAsked', id: 'a1' });
        yield* wait();
        expect(the.switched).toEqual([]);
        yield* SubscriptionRef.set(ref, signedIn('a2', 'a1'));
        yield* wait();
        app.send(list(app).address, { _tag: 'ChooseAsked', id: 'a1' });
        yield* wait();
        expect(the.switched).toEqual(['a1']);
        yield* SubscriptionRef.set(ref, switching('a1', 'a2', 'a1'));
        yield* wait();
        yield* SubscriptionRef.set(ref, signedIn('a1', 'a2'));
        yield* wait();
        expect(stateOf(app)._tag).toBe('Active');
        expect(the.moved).toEqual([]);
      }),
    );
  });

  it('switches to another Account chosen, and goes to its home; to the one active, at once', async () => {
    await run(
      Effect.gen(function* () {
        const { ref, stream } = yield* signedAs(signedIn('a2', 'a3'));
        const the = world(Effect.succeed([]), null, stream);
        const app = yield* start(the);
        yield* wait();
        app.send(list(app).address, { _tag: 'ChooseAsked', id: 'a3' });
        yield* wait();
        expect(the.switched).toEqual(['a3']);
        expect(the.moved).toEqual([]);
        yield* SubscriptionRef.set(ref, signedIn('a3', 'a2'));
        yield* wait();
        expect(the.moved).toEqual([home('a3')]);
        expect(stateOf(app)).toEqual(away({ _tag: 'NotHere' }));
      }),
    );
    await run(
      Effect.gen(function* () {
        const { stream } = yield* signedAs(signedIn('a2', 'a3'));
        const the = world(Effect.succeed([]), null, stream);
        const app = yield* start(the);
        yield* wait();
        app.send(list(app).address, { _tag: 'ChooseAsked', id: 'a2' });
        yield* wait();
        expect(the.switched).toEqual([]);
        expect(the.moved).toEqual([home('a2')]);
      }),
    );
  });

  it('says why a switch asked here failed, and stays', async () => {
    await run(
      Effect.gen(function* () {
        const { stream } = yield* signedAs(signedIn('a2', 'a3'));
        const the = world(Effect.succeed([]), null, stream);
        const app = yield* start(the);
        yield* wait();
        app.send(list(app).address, { _tag: 'ChooseAsked', id: 'refused' });
        yield* wait();
        const model = list(app).model as {
          readonly leaving: string | null;
          readonly problem: string | null;
        };
        expect(model.leaving).toBeNull();
        expect(model.problem).toBe('No such Account');
        expect(the.moved).toEqual([]);
      }),
    );
  });

  it('signs in with Google at once, coming back to the page', async () => {
    vi.stubGlobal('window', {
      location: { href: 'https://code.example.com/a/a1' },
    });
    try {
      await run(
        Effect.gen(function* () {
          const { stream } = yield* signedAs(signedIn('a2'));
          const the = world(Effect.succeed([]), null, stream);
          const app = yield* start(the);
          yield* wait();
          app.send(list(app).address, { _tag: 'SignInAsked' });
          yield* wait();
          expect(the.signIns).toEqual([
            { provider: 'google', returnTo: 'https://code.example.com/a/a1' },
          ]);
        }),
      );
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('decides from what this device kept while the Auth Worker is still asked', () => {
    const checking = AccountsState.Checking({ last: person('a2') });
    const kept = [person('a1'), person('a2')];
    const who: Who = whoOf(checking, kept);
    const first = away({ _tag: 'NotHere' }) as never;
    expect(who.answered).toBe(false);
    expect(standOf('a1', who, first)).toEqual(
      away({
        _tag: 'Other',
        email: 'a1@example.com',
        active: 'a2@example.com',
      }),
    );
    expect(standOf('a3', whoOf(checking, kept), first)).toEqual(
      away({ _tag: 'NotHere' }),
    );
    expect(standOf('a2', whoOf(checking, []), first)).toEqual({
      _tag: 'Active',
      email: 'a2@example.com',
    });
  });

  it('says why from where it stood before', () => {
    const active = { _tag: 'Active' as const, email: 'a1@example.com' };
    const switched = standOf('a1', whoOf(signedIn('a2', 'a1'), []), active);
    expect(switched).toEqual(
      away({
        _tag: 'Switched',
        email: 'a1@example.com',
        active: 'a2@example.com',
      }),
    );
    // Still switched elsewhere as another is made active.
    expect(
      standOf('a1', whoOf(signedIn('a3', 'a1'), []), switched as never),
    ).toEqual(
      away({
        _tag: 'Switched',
        email: 'a1@example.com',
        active: 'a3@example.com',
      }),
    );
    // Signed out once it was known here.
    expect(standOf('a1', whoOf(signedIn('a2'), []), switched as never)).toEqual(
      away({ _tag: 'SignedOut', email: 'a1@example.com' }),
    );
  });

  it('shares nobody’s Connections until it is Active', () => {
    const model = {
      list: { value: [connection('m1', 1)], keptRead: true, problem: null },
    } as never;
    const props = { params: { accountId: 'a1' } };
    expect(
      knownOf({ model, state: away({ _tag: 'NotHere' }) as never, props }),
    ).toBe(nobody);
  });
});

describe('the Account, Active again', () => {
  const signedAs = (first: AccountsState) =>
    Effect.map(SubscriptionRef.make(first), (ref) => ({
      ref,
      stream: SubscriptionRef.changes(ref),
    }));

  /** How each of the page's own Queries stands: its row, the session's row and its messages. */
  const queriesOf = (app: Runtime) =>
    walk(app.snapshot.root)
      .filter(({ actor }) =>
        ['ProjectRow', 'SessionRow', 'Messages'].includes(actor),
      )
      .map(
        ({ actor, model }) =>
          `${actor} ${(model as { readonly status: string }).status}`,
      )
      .sort();

  const sessionOf = (app: Runtime) =>
    walk(app.snapshot.root).find(({ actor }) => actor === 'Session')!;

  /** Waits, a little at a time, until `holds`, for a few seconds at most. */
  const until = (holds: () => boolean) =>
    Effect.gen(function* () {
      for (let tries = 0; tries < 150 && !holds(); tries++) yield* wait();
    });

  it('closes every socket as it leaves Active, the page open, and reads its page’s records anew over a new one once it is Active again', async () => {
    await run(
      Effect.gen(function* () {
        const { ref, stream } = yield* signedAs(signedIn('a1', 'a2'));
        const the = world(
          Effect.succeed([connection('m1', 1)]),
          null,
          stream,
          AT_SESSION,
        );
        const app = yield* start(the);
        const read = ['Messages ready', 'ProjectRow ready', 'SessionRow ready'];
        const readAll = () =>
          JSON.stringify(queriesOf(app)) === JSON.stringify(read);
        yield* until(readAll);
        expect(queriesOf(app)).toEqual(read);
        // One socket, its Connection's own.
        expect(the.sockets.open).toBe(1);
        // The command open over the page, its output read.
        yield* until(
          () =>
            (sessionOf(app).model as { readonly jobs: ReadonlyArray<unknown> })
              .jobs.length > 0,
        );
        app.send(sessionOf(app).address, {
          _tag: 'CommandOpened',
          jobId: 'j1',
        });
        yield* until(() => the.output.opened === 1);
        expect(the.output).toEqual({ opened: 1, ended: 0 });
        // Another tab switched: its Connection stops, and nothing asks it.
        yield* SubscriptionRef.set(ref, signedIn('a2', 'a1'));
        yield* until(() => the.output.ended === 1 && the.sockets.open === 0);
        expect(the.output).toEqual({ opened: 1, ended: 1 });
        // No socket is open, the page open as it is.
        expect(the.sockets.open).toBe(0);
        yield* wait(100);
        expect(the.sockets.open).toBe(0);
        // Back to it: a socket opens again, and the page reads its
        // Connection's records over it.
        yield* SubscriptionRef.set(ref, signedIn('a1', 'a2'));
        yield* until(() => readAll() && the.output.opened === 2);
        expect(queriesOf(app)).toEqual(read);
        expect(the.output).toEqual({ opened: 2, ended: 1 });
        expect(the.sockets.open).toBe(1);
      }),
    );
  });
});

describe('the Account rechecks', () => {
  /** Lets the app settle under the test's clock. */
  const settle = Effect.gen(function* () {
    for (let at = 0; at < 20; at++) yield* Effect.yieldNow;
    yield* wait(5);
    for (let at = 0; at < 20; at++) yield* Effect.yieldNow;
  });

  const timed = <A>(effect: Effect.Effect<A, unknown, Scope.Scope | Cache>) =>
    Effect.runPromise(
      Effect.scoped(effect).pipe(
        Effect.provide(cacheMemory()),
        Effect.provide(TestClock.layer()),
      ) as Effect.Effect<A>,
    );

  it('asks Cloud Connect again while a link is not up, and stops once every link is', () =>
    timed(
      Effect.gen(function* () {
        const down = yield* SubscriptionRef.make<ReadonlySet<string>>(
          new Set(['m1']),
        );
        const { OwnerLive, layer, over, lists } = world(
          Effect.succeed([connection('m1', 1), connection('m2', 1)]),
          down,
        );
        yield* start({ OwnerLive, layer, over });
        yield* settle;
        expect(lists()).toBe(1);
        yield* TestClock.adjust(RECHECK.fast);
        yield* settle;
        expect(lists()).toBe(2);
        // Every link up: nothing more is asked.
        yield* SubscriptionRef.set(down, new Set());
        yield* settle;
        yield* TestClock.adjust(RECHECK.slow * 2);
        yield* settle;
        expect(lists()).toBe(2);
        // A link drops: asked again.
        yield* SubscriptionRef.set(down, new Set(['m2']));
        yield* settle;
        yield* TestClock.adjust(RECHECK.fast);
        yield* settle;
        expect(lists()).toBe(3);
      }),
    ));

  it('asks less often after the first minute, and at once on Reload', () =>
    timed(
      Effect.gen(function* () {
        const down = yield* SubscriptionRef.make<ReadonlySet<string>>(
          new Set(['m1']),
        );
        const { OwnerLive, layer, over, lists } = world(
          Effect.succeed([connection('m1', 1)]),
          down,
        );
        const app = yield* start({ OwnerLive, layer, over });
        yield* settle;
        for (let at = 0; at < RECHECK.fastFor; at++) {
          yield* TestClock.adjust(RECHECK.fast);
          yield* settle;
        }
        expect(lists()).toBe(1 + RECHECK.fastFor);
        yield* TestClock.adjust(RECHECK.fast);
        yield* settle;
        expect(lists()).toBe(1 + RECHECK.fastFor);
        yield* TestClock.adjust(RECHECK.slow - RECHECK.fast);
        yield* settle;
        expect(lists()).toBe(2 + RECHECK.fastFor);
        app.send(list(app).address, { _tag: 'ReloadAsked' });
        yield* settle;
        expect(lists()).toBe(3 + RECHECK.fastFor);
      }),
    ));
});

describe('the Account checks', () => {
  const settle = Effect.gen(function* () {
    for (let at = 0; at < 20; at++) yield* Effect.yieldNow;
    yield* wait(5);
    for (let at = 0; at < 20; at++) yield* Effect.yieldNow;
  });

  it('believes the kept list’s Last Seen only once Cloud Connect answers', async () => {
    const answer = await Effect.runPromise(
      Deferred.make<ReadonlyArray<Connection>>(),
    );
    const { OwnerLive, layer, over } = world(Deferred.await(answer));
    await run(
      Effect.gen(function* () {
        yield* (yield* Cache).write(ListShelf, a1, [connection('m1', 1)]);
        const app = yield* start({ OwnerLive, layer, over });
        yield* wait();
        expect(listModel(app).connections?.map(({ id }) => id)).toEqual(['m1']);
        expect(checkedOf(app)).toBe(false);
        yield* Deferred.succeed(answer, [connection('m1', 2)]);
        yield* wait();
        expect(checkedOf(app)).toBe(true);
      }),
    );
  });

  it('checks the list again, asking at once, when the page comes back after a while hidden', async () => {
    const answers = await Effect.runPromise(
      Effect.all([
        Deferred.make<ReadonlyArray<Connection>>(),
        Deferred.make<ReadonlyArray<Connection>>(),
      ]),
    );
    let answer = answers[0];
    const { OwnerLive, layer, over } = world(
      Effect.suspend(() => Deferred.await(answer)),
    );
    await run(
      Effect.gen(function* () {
        yield* (yield* Cache).write(ListShelf, a1, [connection('m1', 1)]);
        const app = yield* start({ OwnerLive, layer, over });
        yield* Deferred.succeed(answers[0], [connection('m1', 2)]);
        yield* wait();
        expect(checkedOf(app)).toBe(true);
        // Back: not believed again until Cloud Connect answers anew.
        answer = answers[1];
        app.send(list(app).address, { _tag: 'Back' });
        yield* wait();
        expect(checkedOf(app)).toBe(false);
        yield* Deferred.succeed(answers[1], [connection('m1', 3)]);
        yield* wait();
        expect(checkedOf(app)).toBe(true);
      }),
    );
  });

  it('believes it anyway once Cloud Connect has been waited on for long enough', () =>
    Effect.runPromise(
      Effect.scoped(
        Effect.gen(function* () {
          const { OwnerLive, layer, over } = world(
            Effect.fail(new Error('offline')),
          );
          yield* (yield* Cache).write(ListShelf, a1, [connection('m1', 1)]);
          const app = yield* start({ OwnerLive, layer, over });
          yield* settle;
          expect(checkedOf(app)).toBe(false);
          yield* TestClock.adjust(CHECK_FOR - 1);
          yield* settle;
          expect(checkedOf(app)).toBe(false);
          yield* TestClock.adjust(1);
          yield* settle;
          expect(checkedOf(app)).toBe(true);
        }),
      ).pipe(
        Effect.provide(cacheMemory()),
        Effect.provide(TestClock.layer()),
      ) as Effect.Effect<void>,
    ));
});

describe('the Account mismatched', () => {
  /** A Connection Cloud Connect wants to run the code Plugin at `wanted`. */
  const wanting = (wanted: string): Connection => ({
    ...connection('m1', Date.now()),
    wanted: { code: { hash: wanted, url: `file:///${wanted}.mjs` } },
  });

  /** The close reason of a Connection running `running`, as its router says it. */
  const mismatchReason = (running: string | null) =>
    JSON.stringify({ running });

  const OLDER = 'b'.repeat(64);
  const NEWER = 'c'.repeat(64);

  /** The Connections' Links and mismatches, as it holds them. */
  const linksOf = (app: Runtime) =>
    list(app).model as {
      readonly links: Readonly<Record<string, string>>;
      readonly mismatched: Readonly<Record<string, unknown>>;
    };

  /** The app, counting each move to Code's newest build. */
  const started = (wanted: string) => {
    let moves = 0;
    const the = world(Effect.succeed([wanting(wanted)]));
    const { watches, lists } = the;
    const told = Layer.succeed(
      OnOutdated,
      Effect.sync(() => void moves++),
    );
    return {
      app: start(the, told),
      watches,
      lists,
      moves: () => moves,
    };
  };

  it('is Updating while Cloud Connect wants this Code’s Release: it keeps relinking, until a socket is answered', async () => {
    const { app: starting, watches, lists, moves } = started(PLUGIN_CODE);
    await run(
      Effect.gen(function* () {
        const app = yield* starting;
        yield* wait();
        expect(linksOf(app).links).toEqual({ m1: 'linked' });
        // The Connection still runs an older Release, and says so.
        watches.get('m1')!.closed!({
          code: PLUGIN_MISMATCH,
          reason: mismatchReason(OLDER),
        });
        yield* wait();
        expect(linksOf(app).links).toEqual({ m1: 'relinking' });
        expect(linksOf(app).mismatched).toEqual({ m1: { running: OLDER } });
        expect(moves()).toBe(0);
        // Relinking: Cloud Connect is asked again, as for any Link down.
        const asked = lists();
        yield* wait(RECHECK.fast + 200);
        expect(lists()).toBeGreaterThan(asked);
        // Updated: a socket to it is answered, and it is linked.
        watches.get('m1')!.answered!();
        yield* wait();
        expect(linksOf(app).links).toEqual({ m1: 'linked' });
        expect(linksOf(app).mismatched).toEqual({});
        expect(moves()).toBe(0);
      }),
    );
  });

  it('is Updating too while Cloud Connect wants no Release of the code Plugin', async () => {
    const { OwnerLive, layer, over, watches } = world(
      Effect.succeed([connection('m1', Date.now())]),
    );
    let moves = 0;
    await run(
      Effect.gen(function* () {
        const app = yield* start(
          { OwnerLive, layer, over },
          Layer.succeed(
            OnOutdated,
            Effect.sync(() => void moves++),
          ),
        );
        yield* wait();
        watches.get('m1')!.closed!({
          code: PLUGIN_MISMATCH,
          reason: mismatchReason(null),
        });
        yield* wait();
        expect(linksOf(app).links).toEqual({ m1: 'relinking' });
        expect(moves).toBe(0);
      }),
    );
  });

  it('moves this Code to its newest build when Cloud Connect wants another Release', async () => {
    const { app: starting, watches, moves } = started(NEWER);
    await run(
      Effect.gen(function* () {
        const app = yield* starting;
        yield* wait();
        watches.get('m1')!.closed!({
          code: PLUGIN_MISMATCH,
          reason: mismatchReason(NEWER),
        });
        yield* wait();
        expect(linksOf(app).mismatched).toEqual({ m1: { running: NEWER } });
        expect(moves()).toBe(1);
        // Told again, it moves once: it is moving already.
        watches.get('m1')!.closed!({
          code: PLUGIN_MISMATCH,
          reason: mismatchReason(NEWER),
        });
        yield* wait();
        expect(moves()).toBe(1);
      }),
    );
  });

  it('is not mismatched by a socket that closes another way', async () => {
    const { app: starting, watches, moves } = started(NEWER);
    await run(
      Effect.gen(function* () {
        const app = yield* starting;
        yield* wait();
        watches.get('m1')!.closed!({ code: 1006, reason: '' });
        yield* wait();
        expect(linksOf(app).links).toEqual({ m1: 'linked' });
        expect(linksOf(app).mismatched).toEqual({});
        expect(moves()).toBe(0);
      }),
    );
  });
});
