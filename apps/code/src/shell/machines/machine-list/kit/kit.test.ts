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
import {
  Kept,
  type KitParts,
  type Line,
  Machines,
} from '../../../../layer/capabilities/index.ts';
import { keptMemory, machines } from '../../../../layer/services/index.ts';
import { KitShelf } from './commands.ts';
import { Kit } from './index.ts';

/*
 * A Machine Kit with its Machine stood in for: what was kept shows at
 * once, and the Machine is asked behind once its Line connects, each time
 * it connects again, on Reload and when Settings asks; each answer shows
 * and is kept. A change from Settings shows at once, and an answer asked
 * before it is dropped. Speech to Text is kept as it changes, but not each
 * step of a download; a model list refused keeps what showed.
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
const QA = account('qa', 'QA kit');

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
    kit: {
      actor: Kit.actor,
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

/** Starts the Kit over the Machine stood in for, with `Machines` and what is kept. */
const run = (
  test: (
    the: Effect.Success<typeof world> & {
      readonly machines: Machines['Service'];
      readonly kept: Kept['Service'];
      readonly start: Effect.Effect<unknown, never, Scope.Scope>;
      /** Starts it with `kept` in place of what is kept. */
      readonly startOver: (
        kept: Kept['Service'],
      ) => Effect.Effect<unknown, never, Scope.Scope>;
      readonly kit: Effect.Effect<KitParts & { readonly savedRead: boolean }>;
    },
  ) => Effect.Effect<void, unknown, Scope.Scope>,
) =>
  Effect.runPromise(
    Effect.scoped(
      Effect.gen(function* () {
        const the = yield* world;
        const context = yield* Layer.build(
          Layer.mergeAll(machines, keptMemory()),
        );
        const shared = Context.get(context, Machines);
        const startOver = (kept: Kept['Service']) =>
          Runtime.start(
            OwnerLive as never,
            Layer.merge(
              Layer.succeedContext(Context.add(context, Kept, kept)),
              the.clients,
            ) as never,
          );
        yield* test({
          ...the,
          machines: shared,
          kept: Context.get(context, Kept),
          start: startOver(Context.get(context, Kept)),
          startOver,
          kit: Effect.map(shared.current, ({ kits }) => kits['m1']!),
        });
      }),
    ) as Effect.Effect<void>,
  );

describe('Machine Kit', () => {
  it('shows what was kept over Speech to Text heard before it was read, and keeps both', () =>
    run(({ kept, speech, startOver, kit }) =>
      Effect.gen(function* () {
        yield* kept.write(KitShelf, m1, {
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
        expect((yield* kit).accounts?.map(({ name }) => name)).toEqual([
          'Claude home',
        ]);
        expect((yield* kit).speech).toEqual({ _tag: 'Ready' });
        const after = yield* kept.read(KitShelf, m1);
        expect(after?.accounts?.map(({ name }) => name)).toEqual([
          'Claude home',
        ]);
        expect(after?.speech).toEqual({ _tag: 'Ready' });
      }),
    ));

  it('shows what was kept at once, asks once its Line connects, and keeps the answer', () =>
    run(({ kept, line, state, start, kit }) =>
      Effect.gen(function* () {
        yield* kept.write(KitShelf, m1, {
          accounts: [account('claude', 'Claude home')],
          speech: { _tag: 'Ready' },
          harnesses: [HARNESS],
          models: [{ account: 'claude', list: [OPUS], problem: null }],
        });
        yield* start;
        yield* wait();
        expect((yield* kit).savedRead).toBe(true);
        expect((yield* kit).accounts?.map(({ name }) => name)).toEqual([
          'Claude home',
        ]);
        expect((yield* kit).models[0]?.list).toEqual([OPUS]);
        expect(state.asks).toBe(0);
        yield* SubscriptionRef.set(line, 'connected');
        yield* wait();
        expect(state.asks).toBe(1);
        expect((yield* kit).accounts).toEqual([CLAUDE]);
        expect((yield* kit).speech).toEqual({ _tag: 'Ready' });
        expect((yield* kept.read(KitShelf, m1))?.accounts).toEqual([CLAUDE]);
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
    run(({ machines, kept, line, state, start, kit }) =>
      Effect.gen(function* () {
        const older = yield* Deferred.make<ReadonlyArray<HarnessAccountInfo>>();
        state.accounts = Deferred.await(older);
        yield* SubscriptionRef.set(line, 'connected');
        yield* kept.write(KitShelf, m1, {
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
        expect((yield* kit).accounts).toEqual([CLAUDE, QA]);
        expect(state.asks).toBe(2);
        yield* Deferred.succeed(older, [CLAUDE]);
        yield* wait();
        expect((yield* kit).accounts).toEqual([CLAUDE, QA]);
        yield* Deferred.succeed(newer, [CLAUDE, { ...QA, name: 'QA' }]);
        yield* wait();
        expect((yield* kit).accounts?.map(({ name }) => name)).toEqual([
          'Claude',
          'QA',
        ]);
        expect(
          (yield* kept.read(KitShelf, m1))?.accounts?.map(({ name }) => name),
        ).toEqual(['Claude', 'QA']);
        // Removed on the Machine, as it says from then on.
        state.accounts = Effect.succeed([CLAUDE]);
        yield* machines.changed('m1', { _tag: 'AccountRemoved', id: 'qa' });
        yield* wait();
        expect((yield* kit).accounts).toEqual([CLAUDE]);
      }),
    ));

  it('keeps Speech to Text as it changes, but not each step of a download', () =>
    run(({ kept, speech, start, kit }) =>
      Effect.gen(function* () {
        yield* start;
        yield* wait();
        yield* Queue.offer(speech, { _tag: 'Downloading', done: 1, total: 10 });
        yield* wait();
        yield* Queue.offer(speech, { _tag: 'Downloading', done: 5, total: 10 });
        yield* wait();
        expect((yield* kit).speech).toEqual({
          _tag: 'Downloading',
          done: 5,
          total: 10,
        });
        expect((yield* kept.read(KitShelf, m1))?.speech).toEqual({
          _tag: 'Downloading',
          done: 1,
          total: 10,
        });
        yield* Queue.offer(speech, { _tag: 'Ready' });
        yield* wait();
        expect((yield* kept.read(KitShelf, m1))?.speech).toEqual({
          _tag: 'Ready',
        });
      }),
    ));

  it('keeps what showed of an agent whose models the Machine refuses', () =>
    run(({ kept, line, state, start, kit }) =>
      Effect.gen(function* () {
        state.models = Effect.fail(new ModelsUnavailable({ message: '' }));
        yield* kept.write(KitShelf, m1, {
          accounts: null,
          speech: null,
          harnesses: [HARNESS],
          models: [{ account: 'claude', list: [OPUS], problem: null }],
        });
        yield* SubscriptionRef.set(line, 'connected');
        yield* start;
        yield* wait();
        expect(state.asks).toBe(1);
        expect((yield* kit).models).toEqual([
          { account: 'claude', list: [OPUS], problem: null },
        ]);
      }),
    ));
});
