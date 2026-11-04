import 'fake-indexeddb/auto';
import {
  Context,
  Deferred,
  Effect,
  Layer,
  Option,
  Queue,
  Scope,
  Stream,
  SubscriptionRef,
} from 'effect';
import {
  CodeClient,
  CodeClients,
  type HarnessAccountInfo,
  type HarnessInfo,
  ModelsUnavailable,
  type SessionQuestions,
  type SpeechToTextState,
} from '@kestack/connect/code';
import { Actor, Runtime } from '@kestack/kabuki';
import { connection as RpcConnection } from '@kestack/rpc-toolkit/rpc/websocket';
import { describe, expect, it } from 'vitest';
import { Storage, storageMemory } from '../../../storage/index.ts';
import {
  type Link,
  Connections,
  connectionsMemory,
  type Known,
  nobody,
  type SetupParts,
} from '../../account.ts';
import { SetupShelf } from '../commands.ts';
import { Connection } from '../index.ts';
import { borrowing, Sockets } from '../link/reach/index.ts';

/*
 * A Connection with its Connection stood in for: what was kept of its setup
 * shows at once, and the Connection is asked behind once its Link is up,
 * each time it links again, on Reload and when Settings asks; each
 * answer shows and is kept. A change from Settings shows at once, and an
 * answer asked before it is dropped. Speech to Text is kept as it changes,
 * but not each step of a download; a model list refused keeps what showed.
 * Its Unseen marks are its own, said through `Connections` and read again on
 * each write; its records are in its own sync Store, its Replicas served
 * through `Connections` while it runs. How its Agent Questions are being
 * answered is kept while each is asked, and goes once it is not.
 */

type Api = CodeClient['Service'];

const account = (id: string, name: string): HarnessAccountInfo => ({
  id,
  harness: 'claude',
  name,
  binaryPath: null,
  configFolder: null,
  resolvedConfigFolder: { path: '/Users/me/.claude', from: 'default' },
  isDefault: id === 'claude',
  resolved: { path: 'claude', version: '1.0.0', error: null, isDefault: true },
});

const CLAUDE = account('claude', 'Claude');
const QA = account('qa', 'QA setup');

const HARNESS: HarnessInfo = {
  account: 'claude',
  harness: 'claude',
  name: 'Claude',
  settings: [],
  defaultModel: 'opus',
  available: true,
  unavailableReason: null,
};

const OPUS = { id: 'opus', name: 'Opus', releaseDate: null };

const m1 = { accountId: 'a1', connectionId: 'm1', projectId: null };

const OwnerLive = Actor.define('Owner', {}).build({
  children: {
    connection: Actor.child(Connection.actor, {
      input: () => ({ accountId: 'a1', connectionId: 'm1' }),
    }),
  },
});

/** The socket's own word for each Link. */
const socketOf = {
  linking: 'connecting',
  linked: 'connected',
  relinking: 'reconnecting',
} as const;

/** The Connection as the test says it: its Link, its accounts, its models and its Speech to Text. */
const world = Effect.gen(function* () {
  const link = yield* SubscriptionRef.make<Link>('linking');
  const speech = yield* Queue.unbounded<SpeechToTextState>();
  const asked = yield* SubscriptionRef.make<ReadonlyArray<SessionQuestions>>(
    [],
  );
  const state = {
    asks: 0,
    accounts: Effect.succeed([CLAUDE]) as Effect.Effect<
      ReadonlyArray<HarnessAccountInfo>
    >,
    models: Effect.succeed([OPUS]) as Effect.Effect<
      ReadonlyArray<typeof OPUS>,
      ModelsUnavailable
    >,
  };
  const clients = CodeClients.make(() =>
    Layer.merge(
      // An RPC client's procedures are generic over how they are called;
      // a stand-in answers the one way the app calls them.
      Layer.mock(CodeClient)({
        harnessAccounts: (() =>
          Effect.suspend(() => {
            state.asks++;
            return state.accounts;
          })) as unknown as Api['harnessAccounts'],
        harnesses: (() =>
          Effect.succeed([HARNESS])) as unknown as Api['harnesses'],
        models: (() =>
          Effect.suspend(() => state.models)) as unknown as Api['models'],
        agentQuestions: (() =>
          SubscriptionRef.changes(asked)) as unknown as Api['agentQuestions'],
        watchSpeechToText: (() =>
          Stream.fromQueue(speech)) as unknown as Api['watchSpeechToText'],
      }),
      Layer.mock(RpcConnection)({
        connectionStatus: SubscriptionRef.changes(link).pipe(
          Stream.map((now) => socketOf[now]),
        ),
        keepSubscribed: (subscribe) => subscribe(),
        hooks: { onConnect: Effect.void, onDisconnect: Effect.void },
      }),
    ),
  );
  return { link, speech, asked, state, clients };
});

/** What is kept of what was said, as `Storage` holds it. */
type Cache = Storage['Service']['cache'];

/** The sync Stores, as `Storage` gives them. */
type Sync = Pick<Storage['Service'], 'store'>;

const wait = (ms = 20) =>
  Effect.promise(() => new Promise((done) => setTimeout(done, ms)));

/** Starts the setup over the Connection stood in for, with `Connections` and what is kept. */
const run = (
  test: (
    the: Effect.Success<typeof world> & {
      readonly connections: Connections['Service'];
      readonly kept: Cache;
      readonly seen: Storage['Service']['seen'];
      /** Starts it with `sync` in place of the Stores. */
      readonly startWith: (
        sync: Sync,
      ) => Effect.Effect<unknown, never, Scope.Scope>;
      readonly sync: Sync;
      readonly start: Effect.Effect<unknown, never, Scope.Scope>;
      /** Starts it with `kept` in place of what is kept. */
      readonly startOver: (
        kept: Cache,
      ) => Effect.Effect<unknown, never, Scope.Scope>;
      readonly setup: Effect.Effect<
        SetupParts & { readonly savedRead: boolean }
      >;
    },
  ) => Effect.Effect<void, unknown, Scope.Scope>,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const the = yield* world;
        const known = yield* SubscriptionRef.make<Known>({
          ...nobody,
          accountId: 'a1',
        });
        const context = yield* Layer.build(
          Layer.mergeAll(connectionsMemory(known), storageMemory()),
        );
        const shared = Context.get(context, Connections);
        const storage = Context.get(context, Storage);
        const startIn = (over: Partial<Storage['Service']>) =>
          Runtime.start(
            OwnerLive as never,
            Layer.merge(
              Layer.succeedContext(
                Context.add(context, Storage, { ...storage, ...over }),
              ),
              // Its socket its own, opened by the test's stand-in; what
              // asks of it from above borrows it.
              Layer.merge(Sockets.from(the.clients), borrowing).pipe(
                Layer.provide(Layer.succeedContext(context)),
              ),
            ) as never,
          );
        const startOver = (kept: Cache) => startIn({ cache: kept });
        const startWith = (sync: Sync) => startIn(sync);
        yield* test({
          ...the,
          connections: shared,
          kept: storage.cache,
          seen: storage.seen,
          sync: { store: storage.store },
          startWith,
          start: startOver(storage.cache),
          startOver,
          setup: Effect.map(shared.current, ({ setups }) => setups['m1']!),
        });
      }),
    ) as Effect.Effect<void>,
  );

describe('Connection', () => {
  it('shows what was kept over Speech to Text heard before it was read, and keeps both', () =>
    run(({ kept, speech, startOver, setup }) =>
      Effect.gen(function* () {
        yield* kept.write(SetupShelf, m1, {
          accounts: [account('claude', 'Claude home')],
          speech: { _tag: 'Off' },
          harnesses: [HARNESS],
          models: [],
        });
        yield* Queue.offer(speech, { _tag: 'Ready' });
        const read = yield* Deferred.make<void>();
        yield* startOver({
          ...kept,
          read: (shelf, whose) =>
            Effect.andThen(Deferred.await(read), kept.read(shelf, whose)),
        });
        yield* wait();
        yield* Deferred.succeed(read, undefined);
        yield* wait();
        expect((yield* setup).accounts?.map(({ name }) => name)).toEqual([
          'Claude home',
        ]);
        expect((yield* setup).speech).toEqual({ _tag: 'Ready' });
        const after = yield* kept.read(SetupShelf, m1);
        expect(after?.accounts?.map(({ name }) => name)).toEqual([
          'Claude home',
        ]);
        expect(after?.speech).toEqual({ _tag: 'Ready' });
      }),
    ));

  it('shows what was kept at once, asks once its Link is up, and keeps the answer', () =>
    run(({ kept, link, state, start, setup }) =>
      Effect.gen(function* () {
        yield* kept.write(SetupShelf, m1, {
          accounts: [account('claude', 'Claude home')],
          speech: { _tag: 'Ready' },
          harnesses: [HARNESS],
          models: [{ account: 'claude', list: [OPUS], problem: null }],
        });
        yield* start;
        yield* wait();
        expect((yield* setup).savedRead).toBe(true);
        expect((yield* setup).accounts?.map(({ name }) => name)).toEqual([
          'Claude home',
        ]);
        expect((yield* setup).models[0]?.list).toEqual([OPUS]);
        expect(state.asks).toBe(0);
        yield* SubscriptionRef.set(link, 'linked');
        yield* wait();
        expect(state.asks).toBe(1);
        expect((yield* setup).accounts).toEqual([CLAUDE]);
        expect((yield* setup).speech).toEqual({ _tag: 'Ready' });
        expect((yield* kept.read(SetupShelf, m1))?.accounts).toEqual([CLAUDE]);
      }),
    ));

  it('asks again each time its Link is up, on Reload, and when Settings asks', () =>
    run(({ connections, link, state, start }) =>
      Effect.gen(function* () {
        yield* SubscriptionRef.set(link, 'linked');
        yield* start;
        yield* wait();
        expect(state.asks).toBe(1);
        yield* SubscriptionRef.set(link, 'relinking');
        yield* wait();
        expect(state.asks).toBe(1);
        yield* SubscriptionRef.set(link, 'linked');
        yield* wait();
        expect(state.asks).toBe(2);
        yield* connections.reload;
        yield* wait();
        expect(state.asks).toBe(3);
        yield* connections.refresh('m1');
        yield* wait();
        expect(state.asks).toBe(4);
        yield* connections.refresh('m2');
        yield* wait();
        expect(state.asks).toBe(4);
      }),
    ));

  it('shows a change from Settings at once, and drops an answer asked before it', () =>
    run(({ connections, kept, link, state, start, setup }) =>
      Effect.gen(function* () {
        const older = yield* Deferred.make<ReadonlyArray<HarnessAccountInfo>>();
        state.accounts = Deferred.await(older);
        yield* SubscriptionRef.set(link, 'linked');
        yield* kept.write(SetupShelf, m1, {
          accounts: [CLAUDE],
          speech: null,
          harnesses: null,
          models: [],
        });
        yield* start;
        yield* wait();
        expect(state.asks).toBe(1);
        const newer = yield* Deferred.make<ReadonlyArray<HarnessAccountInfo>>();
        state.accounts = Deferred.await(newer);
        yield* connections.changed('m1', { _tag: 'AccountSaved', account: QA });
        yield* wait();
        expect((yield* setup).accounts).toEqual([CLAUDE, QA]);
        expect(state.asks).toBe(2);
        yield* Deferred.succeed(older, [CLAUDE]);
        yield* wait();
        expect((yield* setup).accounts).toEqual([CLAUDE, QA]);
        yield* Deferred.succeed(newer, [CLAUDE, { ...QA, name: 'QA' }]);
        yield* wait();
        expect((yield* setup).accounts?.map(({ name }) => name)).toEqual([
          'Claude',
          'QA',
        ]);
        expect(
          (yield* kept.read(SetupShelf, m1))?.accounts?.map(({ name }) => name),
        ).toEqual(['Claude', 'QA']);
        // Removed on the Connection, as it says from then on.
        state.accounts = Effect.succeed([CLAUDE]);
        yield* connections.changed('m1', { _tag: 'AccountRemoved', id: 'qa' });
        yield* wait();
        expect((yield* setup).accounts).toEqual([CLAUDE]);
      }),
    ));

  it('keeps Speech to Text as it changes, but not each step of a download', () =>
    run(({ kept, speech, start, setup }) =>
      Effect.gen(function* () {
        yield* start;
        yield* wait();
        yield* Queue.offer(speech, { _tag: 'Downloading', done: 1, total: 10 });
        yield* wait();
        yield* Queue.offer(speech, { _tag: 'Downloading', done: 5, total: 10 });
        yield* wait();
        expect((yield* setup).speech).toEqual({
          _tag: 'Downloading',
          done: 5,
          total: 10,
        });
        expect((yield* kept.read(SetupShelf, m1))?.speech).toEqual({
          _tag: 'Downloading',
          done: 1,
          total: 10,
        });
        yield* Queue.offer(speech, { _tag: 'Ready' });
        yield* wait();
        expect((yield* kept.read(SetupShelf, m1))?.speech).toEqual({
          _tag: 'Ready',
        });
      }),
    ));

  it('keeps what showed of an agent whose models the Connection refuses', () =>
    run(({ kept, link, state, start, setup }) =>
      Effect.gen(function* () {
        state.models = Effect.fail(new ModelsUnavailable({ message: '' }));
        yield* kept.write(SetupShelf, m1, {
          accounts: null,
          speech: null,
          harnesses: [HARNESS],
          models: [{ account: 'claude', list: [OPUS], problem: null }],
        });
        yield* SubscriptionRef.set(link, 'linked');
        yield* start;
        yield* wait();
        expect(state.asks).toBe(1);
        expect((yield* setup).models).toEqual([
          { account: 'claude', list: [OPUS], problem: null },
        ]);
      }),
    ));

  it('says its own Unseen marks, and reads them again after each write', () =>
    run(({ seen, start, connections }) =>
      Effect.gen(function* () {
        yield* seen.mark('a1', 'm1', 'p1', 's1', 5);
        yield* seen.mark('a1', 'm2', 'p1', 's2', 7);
        yield* start;
        yield* wait();
        expect((yield* connections.current).seen).toEqual({ m1: { s1: 5 } });
        yield* seen.mark('a1', 'm1', 'p1', 's3', 9);
        yield* wait();
        expect((yield* connections.current).seen).toEqual({
          m1: { s1: 5, s3: 9 },
        });
      }),
    ));

  it('opens its own sync Store, and says its Replicas while it runs', () =>
    run(({ sync, startWith, connections }) =>
      Effect.gen(function* () {
        const opened: Array<string> = [];
        yield* startWith({
          ...sync,
          store: (accountId, connectionId) => {
            opened.push(`${accountId} ${connectionId}`);
            return sync.store(accountId, connectionId);
          },
        });
        yield* connections.replicas('m1').pipe(Effect.timeout('1 second'));
        expect(opened).toEqual(['a1 m1']);
        // Its own alone: no other Connection's Replicas are said.
        expect(
          Option.isNone(
            yield* connections
              .replicas('m2')
              .pipe(Effect.timeoutOption('50 millis')),
          ),
        ).toBe(true);
      }),
    ));

  it('keeps how its Agent Questions are being answered while each is asked', () =>
    run(({ start, connections, asked }) =>
      Effect.gen(function* () {
        const question = {
          id: 'q1',
          askedAt: 0,
          items: [
            {
              id: 'a',
              header: 'Go',
              question: 'Go on?',
              options: [{ label: 'Yes', description: '' }],
              multiSelect: false,
              other: false,
              secret: false,
            },
          ] as const,
        };
        const answering = {
          drafts: { q1: { a: { chosen: ['Yes'], typed: '', other: false } } },
          minimised: ['q1'],
          tried: [],
          sent: [],
        };
        yield* SubscriptionRef.set(asked, [
          { sessionId: 's1', projectId: 'p1', questions: [question] },
        ]);
        yield* start;
        yield* wait();
        yield* connections.keepAnswering('m1', 's1', answering);
        // One for a question it does not ask is not kept.
        yield* connections.keepAnswering('m1', 's2', {
          ...answering,
          sent: ['q9'],
        });
        yield* wait();
        expect(yield* connections.answering('m1', 's1')).toEqual(answering);
        expect(yield* connections.answering('m1', 's2')).toBeNull();
        // Answered, declined or its Turn ended: it goes with the question.
        yield* SubscriptionRef.set(asked, []);
        yield* wait();
        expect(yield* connections.answering('m1', 's1')).toBeNull();
        expect((yield* connections.current).answering).toEqual({ m1: {} });
      }),
    ));
});
