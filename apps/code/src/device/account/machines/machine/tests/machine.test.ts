import 'fake-indexeddb/auto';
import {
  Context,
  Deferred,
  Effect,
  Layer,
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
  type SpeechToTextState,
} from '@kestack/connect/code';
import { Actor, Runtime } from '@kestack/kabuki';
import { connection as RpcConnection } from '@kestack/rpc-toolkit/rpc/websocket';
import { describe, expect, it } from 'vitest';
import { Cache, Seen, Sync } from '../store/index.ts';
import { type Line, Link, Machines, type SetupParts } from '../../machines.ts';
import { cacheMemory, seenMemory, syncMemory } from '../store/index.ts';
import { machinesLayer as machines } from '../../machines.ts';
import { SetupShelf } from '../commands.ts';
import { Machine } from '../index.ts';

/*
 * A Machine with its Machine stood in for: what was kept of its setup
 * shows at once, and the Machine is asked behind once its Line connects,
 * each time it connects again, on Reload and when Settings asks; each
 * answer shows and is kept. A change from Settings shows at once, and an
 * answer asked before it is dropped. Speech to Text is kept as it changes,
 * but not each step of a download; a model list refused keeps what showed.
 * Its Unseen marks are its own, said through `Machines` and read again on
 * each write; its records are in its own sync Store, its Replicas said
 * through `Machines` while it runs.
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

const m1 = { accountId: 'a1', machineId: 'm1', projectId: null };

const OwnerLive = Actor.build(Actor.define('Owner', {}), {
  children: {
    machine: {
      actor: Machine.actor,
      input: () => ({ accountId: 'a1', machineId: 'm1' }),
    },
  },
});

/** The Machine as the test says it: its Line, its accounts, its models and its Speech to Text. */
const world = Effect.gen(function* () {
  const line = yield* SubscriptionRef.make<Line>('connecting');
  const speech = yield* Queue.unbounded<SpeechToTextState>();
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
        watchSpeechToText: (() =>
          Stream.fromQueue(speech)) as unknown as Api['watchSpeechToText'],
      }),
      Layer.mock(RpcConnection)({
        connectionStatus: SubscriptionRef.changes(line),
        keepSubscribed: (subscribe) => subscribe(),
        hooks: { onConnect: Effect.void, onDisconnect: Effect.void },
      }),
    ),
  );
  return { line, speech, state, clients };
});

const wait = (ms = 20) =>
  Effect.promise(() => new Promise((done) => setTimeout(done, ms)));

/** Starts the setup over the Machine stood in for, with `Machines` and what is kept. */
const run = (
  test: (
    the: Effect.Success<typeof world> & {
      readonly machines: Machines['Service'];
      readonly kept: Cache['Service'];
      readonly seen: Seen['Service'];
      readonly link: Link['Service'];
      /** Starts it with `sync` in place of the Stores. */
      readonly startWith: (
        sync: Sync['Service'],
      ) => Effect.Effect<unknown, never, Scope.Scope>;
      readonly sync: Sync['Service'];
      readonly start: Effect.Effect<unknown, never, Scope.Scope>;
      /** Starts it with `kept` in place of what is kept. */
      readonly startOver: (
        kept: Cache['Service'],
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
        const context = yield* Layer.build(
          Layer.mergeAll(machines, cacheMemory(), seenMemory(), syncMemory()),
        );
        const shared = Context.get(context, Machines);
        const startOver = (kept: Cache['Service']) =>
          Runtime.start(
            OwnerLive as never,
            Layer.merge(
              Layer.succeedContext(Context.add(context, Cache, kept)),
              the.clients,
            ) as never,
          );
        const startWith = (sync: Sync['Service']) =>
          Runtime.start(
            OwnerLive as never,
            Layer.merge(
              Layer.succeedContext(Context.add(context, Sync, sync)),
              the.clients,
            ) as never,
          );
        yield* test({
          ...the,
          machines: shared,
          kept: Context.get(context, Cache),
          seen: Context.get(context, Seen),
          link: Context.get(context, Link),
          sync: Context.get(context, Sync),
          startWith,
          start: startOver(Context.get(context, Cache)),
          startOver,
          setup: Effect.map(shared.current, ({ setups }) => setups['m1']!),
        });
      }),
    ) as Effect.Effect<void>,
  );

describe('Machine', () => {
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

  it('shows what was kept at once, asks once its Line connects, and keeps the answer', () =>
    run(({ kept, line, state, start, setup }) =>
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
        yield* SubscriptionRef.set(line, 'connected');
        yield* wait();
        expect(state.asks).toBe(1);
        expect((yield* setup).accounts).toEqual([CLAUDE]);
        expect((yield* setup).speech).toEqual({ _tag: 'Ready' });
        expect((yield* kept.read(SetupShelf, m1))?.accounts).toEqual([CLAUDE]);
      }),
    ));

  it('asks again each time its Line connects, on Reload, and when Settings asks', () =>
    run(({ machines, line, state, start }) =>
      Effect.gen(function* () {
        yield* SubscriptionRef.set(line, 'connected');
        yield* start;
        yield* wait();
        expect(state.asks).toBe(1);
        yield* SubscriptionRef.set(line, 'reconnecting');
        yield* wait();
        expect(state.asks).toBe(1);
        yield* SubscriptionRef.set(line, 'connected');
        yield* wait();
        expect(state.asks).toBe(2);
        yield* machines.reload;
        yield* wait();
        expect(state.asks).toBe(3);
        yield* machines.refresh('m1');
        yield* wait();
        expect(state.asks).toBe(4);
        yield* machines.refresh('m2');
        yield* wait();
        expect(state.asks).toBe(4);
      }),
    ));

  it('shows a change from Settings at once, and drops an answer asked before it', () =>
    run(({ machines, kept, line, state, start, setup }) =>
      Effect.gen(function* () {
        const older = yield* Deferred.make<ReadonlyArray<HarnessAccountInfo>>();
        state.accounts = Deferred.await(older);
        yield* SubscriptionRef.set(line, 'connected');
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
        yield* machines.changed('m1', { _tag: 'AccountSaved', account: QA });
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
        // Removed on the Machine, as it says from then on.
        state.accounts = Effect.succeed([CLAUDE]);
        yield* machines.changed('m1', { _tag: 'AccountRemoved', id: 'qa' });
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

  it('keeps what showed of an agent whose models the Machine refuses', () =>
    run(({ kept, line, state, start, setup }) =>
      Effect.gen(function* () {
        state.models = Effect.fail(new ModelsUnavailable({ message: '' }));
        yield* kept.write(SetupShelf, m1, {
          accounts: null,
          speech: null,
          harnesses: [HARNESS],
          models: [{ account: 'claude', list: [OPUS], problem: null }],
        });
        yield* SubscriptionRef.set(line, 'connected');
        yield* start;
        yield* wait();
        expect(state.asks).toBe(1);
        expect((yield* setup).models).toEqual([
          { account: 'claude', list: [OPUS], problem: null },
        ]);
      }),
    ));

  it('says its own Unseen marks, and reads them again after each write', () =>
    run(({ seen, start, machines }) =>
      Effect.gen(function* () {
        yield* seen.mark('a1', 'm1', 'p1', 's1', 5);
        yield* seen.mark('a1', 'm2', 'p1', 's2', 7);
        yield* start;
        yield* wait();
        expect((yield* machines.current).seen).toEqual({ m1: { s1: 5 } });
        yield* seen.mark('a1', 'm1', 'p1', 's3', 9);
        yield* wait();
        expect((yield* machines.current).seen).toEqual({
          m1: { s1: 5, s3: 9 },
        });
      }),
    ));

  it('opens its own sync Store, and says its Replicas while it runs', () =>
    run(({ sync, startWith, machines, link }) =>
      Effect.gen(function* () {
        const opened: Array<string> = [];
        yield* startWith({
          ...sync,
          store: (accountId, machineId) => {
            opened.push(`${accountId} ${machineId}`);
            return sync.store(accountId, machineId);
          },
        });
        yield* machines.replicas('m1').pipe(Effect.timeout('1 second'));
        expect(opened).toEqual(['a1 m1']);
        expect(Object.keys(yield* SubscriptionRef.get(link.replicas))).toEqual([
          'm1',
        ]);
      }),
    ));
});
