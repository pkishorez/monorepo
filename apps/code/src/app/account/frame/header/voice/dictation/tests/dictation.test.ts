import {
  Deferred,
  Effect,
  Layer,
  Queue,
  Schema,
  Stream,
  SubscriptionRef,
} from 'effect';
import type { Cause, Context, Scope } from 'effect';
import { TestClock } from 'effect/testing';
import {
  CodeClient,
  CodeClients,
  TranscriptionFailed,
} from '@kestack/connect/code';
import { Actor, Command, Runtime } from '@kestack/kabuki';
import type { Running } from '@kestack/kabuki/core/runtime';
import type { Instance } from '@kestack/kabuki/core/snapshot';
import { connection as RpcConnection } from '@kestack/rpc-toolkit/rpc/websocket';
import { describe, expect, it } from 'vitest';
import { Connections } from '../../../../../account.ts';
import { Ask, Voice } from '../../voice.ts';
import { Preferences, nothing } from '../../../../../../storage/index.ts';
import { MicrophoneUnavailable, Recorder } from '../../recorder/index.ts';
import { voice } from '../../voice.ts';
import { DictationLive, LIMIT, State } from '../actor.ts';
import { ANSWER, DOWNLOAD, REACH } from '../take/index.ts';

/** Hands an ask to the Dictation, as Voice does. */
const ask = Command.make('AskDictation', {
  args: Ask,
  run: (asked) =>
    Effect.flatMap(Voice, ({ asked: queue }) =>
      Effect.asVoid(Queue.offer(queue, asked)),
    ),
});

/*
 * The Dictation with the microphone and every Connection stood in for. It
 * starts for any field, whatever its Connection says; records the level
 * until it is asked to stop, from anywhere, or for five minutes; sends the
 * audio to its Owner's Connection as a Take while it records, showing the
 * model's download or the text so far; and its text is kept for the field
 * that started it, its Owner, until that field takes it. Refused, it
 * retries from the same clip, as a new Take. Its Connection restarted, it
 * sends the clip again; its Connection out of reach or silent for too long
 * once it stopped, it fails, to be retried. It records
 * from the microphone chosen, the default when that one is not linked,
 * saying so, and another chosen while it records is switched to in the
 * same recording.
 */

/** A field that dictates: its key, and its Connection. */
type Draft = { readonly key: string; readonly connectionId: string };

/** Voice's part: the asks it hands on. */
const Owner = Actor.define('Owner', {
  requires: [Voice, Preferences],
  message: Schema.TaggedUnion({
    Choose: { microphone: Schema.NullOr(Schema.String) },
    Ask: { ask: Ask },
  }),
});

/** The Draft of one Session, on one Connection. */
const session = (connectionId: string, sessionId: string): Draft => ({
  key: sessionId,
  connectionId,
});

/** Chooses a microphone, as the Microphone Picker does: in Preferences. */
const choose = Command.make('ChooseMicrophone', {
  args: Schema.Struct({ microphone: Schema.NullOr(Schema.String) }),
  run: ({ microphone }) =>
    Effect.flatMap(Preferences, (device) =>
      device.setMicrophone(microphone),
    ).pipe(Effect.ignore),
});

const OwnerLive = Owner.build({
  children: {
    dictation: Actor.child(DictationLive),
  },
  on: {
    Choose: ({ microphone }) => ({ command: choose({ microphone }) }),
    Ask: ({ ask: asked }) => ({ command: ask(asked) }),
  },
});

type Api = CodeClient['Service'];

/** A subscription's end, as the stand-in socket keeps it. */
const END: unique symbol = Symbol('end');

/** The stand-ins, and what they were asked. */
const world = (options: {
  readonly microphone?: 'denied' | 'missing';
  /** What each Take is heard as once it ends, in turn; the last one again after. */
  readonly said?: ReadonlyArray<string | TranscriptionFailed>;
  /** What a Take says first, while it records: the model downloading, or the text so far. */
  readonly first?: ReadonlyArray<
    | {
        readonly _tag: 'Downloading';
        readonly done: number;
        readonly total: number;
      }
    | { readonly _tag: 'Heard'; readonly text: string }
  >;
  /** The microphones connected, by `deviceId`, besides the default. */
  readonly connected?: ReadonlyArray<string>;
  /** The microphone chosen in Preferences at the start. */
  readonly chosen?: string | null;
  /** What a Take waits for, once ended, before it is heard. */
  readonly gate?: Effect.Effect<void>;
  /** What the microphone waits for before it opens, as a browser asking for permission does. */
  readonly opening?: Effect.Effect<void>;
  /** Every Connection's socket never opens, as one asleep does. */
  readonly unreachable?: boolean;
}) =>
  Effect.gen(function* () {
    const chosen = yield* SubscriptionRef.make(options.chosen ?? null);
    const device = Layer.succeed(Preferences, {
      read: Effect.map(SubscriptionRef.get(chosen), (microphone) => ({
        ...nothing,
        microphone,
      })),
      setBindings: () => Effect.void,
      setVim: () => Effect.void,
      setFloating: () => Effect.void,
      setTextSize: () => Effect.void,
      setMicrophone: (microphone) => SubscriptionRef.set(chosen, microphone),
      setSmartInput: () => Effect.void,
      setSmartDisplacement: () => Effect.void,
      setSidebarWidth: () => Effect.void,
      setContext: () => Effect.void,
      setKeepScreenOn: () => Effect.void,
      changes: SubscriptionRef.changes(chosen).pipe(
        Stream.drop(1),
        Stream.map(() => undefined),
      ),
    });
    const levels = yield* Queue.unbounded<number, Cause.Done>();
    /** Each Take ended, in turn: its Connection and its whole audio. */
    const asked: Array<{ connectionId: string; audio: ReadonlyArray<number> }> =
      [];
    let recordings = 0;
    /** The microphones asked for, in turn: to record, then each switch. */
    const opened: Array<string | null> = [];
    let recording = false;
    // The last recording's end: its audio ends with it.
    let ended = Deferred.makeUnsafe<void>();
    Deferred.doneUnsafe(ended, Effect.void);
    const connected = new Set(options.connected ?? []);
    const heard = (microphone: string | null) => {
      opened.push(microphone);
      const there = microphone === null || connected.has(microphone);
      return {
        name: there ? (microphone ?? 'Default') : 'Default',
        fellBack: !there,
      };
    };
    const said = [...(options.said ?? ['hello'])];
    /** How many times the socket has come up: each time, what it keeps subscribed runs again. */
    const generation = yield* SubscriptionRef.make(0);
    /** Each Take's stretches, and what it is heard as once it ends. */
    const takes = new Map<
      string,
      {
        readonly stretches: Map<number, ReadonlyArray<number>>;
        readonly done: Deferred.Deferred<string, TranscriptionFailed>;
      }
    >();
    const takeOf = (id: string) => {
      const found = takes.get(id);
      if (found !== undefined) return found;
      const made = {
        stretches: new Map<number, ReadonlyArray<number>>(),
        done: Deferred.makeUnsafe<string, TranscriptionFailed>(),
      };
      takes.set(id, made);
      return made;
    };
    const connection = (connectionId: string) =>
      Layer.merge(
        // An RPC client's procedures are generic over how they are called;
        // a stand-in answers the one way the app calls them.
        Layer.mock(CodeClient)({
          addTakeAudio: (({
            id,
            at,
            audio,
          }: {
            readonly id: string;
            readonly at: number;
            readonly audio: Uint8Array;
          }) =>
            Effect.sync(
              () => void takeOf(id).stretches.set(at, [...audio]),
            )) as unknown as Api['addTakeAudio'],
          // Heard once every stretch it counts is in, as the Connection does.
          endTake: (({
            id,
            count,
          }: {
            readonly id: string;
            readonly count: number;
          }) =>
            Effect.suspend(() => {
              const take = takeOf(id);
              if (take.stretches.size < count) return Effect.void;
              asked.push({
                connectionId,
                audio: Array.from({ length: count }, (_, at) => [
                  ...(take.stretches.get(at) ?? []),
                ]).flat(),
              });
              return Effect.asVoid(
                Effect.forkDetach(
                  Effect.andThen(
                    options.gate ?? Effect.void,
                    Effect.suspend(() => {
                      const next = said.length > 1 ? said.shift()! : said[0]!;
                      return typeof next === 'string'
                        ? Deferred.succeed(take.done, next)
                        : Deferred.fail(take.done, next);
                    }),
                  ),
                ),
              );
            })) as unknown as Api['endTake'],
          watchTake: (({ id }: { readonly id: string }) =>
            Stream.concat(
              Stream.fromIterable(options.first ?? []),
              Stream.fromEffect(
                Effect.map(Deferred.await(takeOf(id).done), (text) => ({
                  _tag: 'Done' as const,
                  text,
                })),
              ),
            )) as unknown as Api['watchTake'],
        }),
        Layer.mock(RpcConnection)({
          connectionStatus: Stream.concat(
            Stream.make('connected' as const),
            Stream.never,
          ),
          // Run again each time the socket comes up; done once it ends.
          keepSubscribed: <A, E, R>(subscribe: () => Stream.Stream<A, E, R>) =>
            SubscriptionRef.changes(generation).pipe(
              Stream.switchMap(() =>
                Stream.concat(subscribe(), Stream.make(END)),
              ),
              Stream.takeWhile((each): each is A => each !== END),
            ),
          hooks: { onConnect: Effect.void, onDisconnect: Effect.void },
        }),
      );
    const layer = Layer.mergeAll(
      voice,
      device,
      CodeClients.make(
        options.unreachable === true
          ? () =>
              Layer.effectContext(
                Effect.never as Effect.Effect<
                  Context.Context<CodeClient | RpcConnection>
                >,
              )
          : connection,
      ),
      Layer.mock(Connections)({
        connection: () =>
          Stream.make({ name: 'mac.local', displayName: 'Studio' } as never),
      }),
      Layer.succeed(Recorder, {
        record: (microphone) =>
          options.microphone !== undefined
            ? Effect.fail(
                options.microphone === 'denied'
                  ? new MicrophoneUnavailable({
                      reason: 'The microphone is blocked for this site',
                      blocked: true,
                    })
                  : new MicrophoneUnavailable({
                      reason: 'No microphone found',
                    }),
              )
            : Effect.andThen(
                options.opening ?? Effect.void,
                Effect.acquireRelease(
                  Effect.sync(() => {
                    recordings++;
                    recording = true;
                    ended = Deferred.makeUnsafe<void>();
                    return {
                      heard: heard(microphone),
                      levels: Stream.fromQueue(levels),
                    };
                  }),
                  () =>
                    Effect.sync(() => {
                      recording = false;
                      Deferred.doneUnsafe(ended, Effect.void);
                    }),
                ),
              ),
        switchTo: (microphone) =>
          Effect.sync(() => (recording ? heard(microphone) : null)),
        clip: Effect.succeed(Uint8Array.of(1, 0, 2, 0)),
        // One chunk, then nothing more until the recording ends.
        audio: Stream.unwrap(
          Effect.sync(() =>
            Stream.concat(
              Stream.make(Int16Array.of(1, 2)),
              Stream.drain(Stream.fromEffect(Deferred.await(ended))),
            ),
          ),
        ),
        inputs: Stream.empty,
      }),
    );
    return {
      layer,
      levels,
      asked,
      /** The Connection restarts, losing every Take, and the socket comes up again. */
      restart: Effect.andThen(
        Effect.sync(() => takes.clear()),
        SubscriptionRef.update(generation, (count) => count + 1),
      ),
      recordings: () => recordings,
      recording: () => recording,
      opened,
    };
  });

const walk = (at: Instance): ReadonlyArray<Instance> => [
  at,
  ...Object.values(at.children).flatMap((child) =>
    ((Array.isArray(child) ? child : [child]) as Array<Instance>).flatMap(walk),
  ),
];

const dictation = (app: Running<unknown>) =>
  walk(app.snapshot()).find((each) => each.actor === 'Dictation')!;

const stateOf = (app: Running<unknown>) =>
  Schema.decodeUnknownSync(State)(dictation(app).state);

const noticeOf = (app: Running<unknown>) =>
  Schema.decodeUnknownSync(
    Schema.Struct({
      notice: Schema.NullOr(Schema.Struct({ reason: Schema.String })),
    }),
  )(dictation(app).model).notice?.reason ?? null;

const blockedOf = (app: Running<unknown>) =>
  Schema.decodeUnknownSync(Schema.Struct({ blocked: Schema.Boolean }))(
    dictation(app).model,
  ).blocked;

const settle = Effect.gen(function* () {
  for (let at = 0; at < 20; at++) yield* Effect.yieldNow;
  yield* TestClock.adjust('1 millis');
  for (let at = 0; at < 20; at++) yield* Effect.yieldNow;
});

const timed = <A>(effect: Effect.Effect<A, unknown, Scope.Scope>) =>
  Effect.runPromise(
    Effect.scoped(effect).pipe(
      Effect.provide(TestClock.layer()),
    ) as Effect.Effect<A>,
  );

const textsOf = (app: Running<unknown>) =>
  Schema.decodeUnknownSync(
    Schema.Struct({
      texts: Schema.Array(
        Schema.Struct({
          id: Schema.Finite,
          owner: Schema.String,
          text: Schema.String,
        }),
      ),
    }),
  )(dictation(app).model).texts;

/** The field each app's toggles start one for, unless told another. */
const fields = new WeakMap<Running<unknown>, Draft | null>();

/** The app, its toggles starting one for `draft`. */
const start = (draft: Draft | null, layer: Layer.Layer<any>) =>
  Effect.gen(function* () {
    const app = (yield* Runtime.start(
      OwnerLive as never,
      layer as never,
    )) as Running<unknown>;
    fields.set(app, draft);
    return app;
  });

/** Asks the Dictation as the app does: through the root's Command. */
const askIt = (app: Running<unknown>, asked: typeof Ask.Type) =>
  Effect.andThen(
    Effect.sync(() => app.send(app.snapshot().id, { _tag: 'Ask', ask: asked })),
    settle,
  );

/** Start one for `owner`, or stop the one recording. */
const toggle = (
  app: Running<unknown>,
  owner: Draft | null = fields.get(app) ?? null,
) => askIt(app, { _tag: 'Toggle', owner });

const send = (
  app: Running<unknown>,
  message: { readonly _tag: string; readonly [field: string]: unknown },
) =>
  Effect.andThen(
    Effect.sync(() => app.send(dictation(app).id, message)),
    settle,
  );

describe('Dictation', () => {
  it('throws away one being transcribed on a Cancel that comes after its Stop, its text with it', () =>
    timed(
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>();
        const { layer, asked } = yield* world({
          said: ['too late'],
          gate: Deferred.await(gate),
        });
        const app = yield* start(session('m1', 's1'), layer);
        yield* settle;
        yield* toggle(app);
        yield* send(app, { _tag: 'Stop' });
        expect(stateOf(app)._tag).toBe('Transcribing');
        expect(asked).toHaveLength(1);
        yield* askIt(app, { _tag: 'Cancel' });
        expect(stateOf(app)._tag).toBe('Idle');
        yield* Deferred.succeed(gate, undefined);
        yield* settle;
        expect(stateOf(app)._tag).toBe('Idle');
      }),
    ));

  it('throws away text not yet taken on Cancel', () =>
    timed(
      Effect.gen(function* () {
        const { layer } = yield* world({});
        const app = yield* start(session('m1', 's1'), layer);
        yield* settle;
        yield* toggle(app);
        yield* toggle(app);
        expect(textsOf(app)).toEqual([{ id: 1, owner: 's1', text: 'hello' }]);
        yield* askIt(app, { _tag: 'Cancel' });
        expect(stateOf(app)._tag).toBe('Idle');
        expect(textsOf(app)).toEqual([]);
      }),
    ));

  it('throws away the one recording on Cancel: the microphone lets go and nothing is transcribed', () =>
    timed(
      Effect.gen(function* () {
        const { layer, asked, recording } = yield* world({});
        const app = yield* start(session('m1', 's1'), layer);
        yield* settle;
        yield* toggle(app);
        expect(stateOf(app)._tag).toBe('Recording');
        expect(recording()).toBe(true);
        yield* askIt(app, { _tag: 'Cancel' });
        expect(stateOf(app)._tag).toBe('Idle');
        expect(recording()).toBe(false);
        expect(asked).toEqual([]);
      }),
    ));

  it('starts whatever its Connection says, and while it records shows the model downloading, then what is heard so far', () =>
    timed(
      Effect.gen(function* () {
        const { layer, asked } = yield* world({
          first: [
            { _tag: 'Downloading', done: 1, total: 4 },
            { _tag: 'Heard', text: 'look' },
          ],
          said: ['look here'],
        });
        const app = yield* start(session('m1', 's1'), layer);
        yield* settle;
        yield* toggle(app);
        expect(stateOf(app)).toMatchObject({
          _tag: 'Recording',
          text: 'look',
          downloading: null,
        });
        yield* toggle(app);
        expect(asked).toEqual([{ connectionId: 'm1', audio: [1, 0, 2, 0] }]);
        expect(textsOf(app)).toEqual([
          { id: 1, owner: 's1', text: 'look here' },
        ]);
      }),
    ));

  it('shows how far the model has downloaded while it records', () =>
    timed(
      Effect.gen(function* () {
        const { layer } = yield* world({
          first: [{ _tag: 'Downloading', done: 1, total: 4 }],
        });
        const app = yield* start(session('m1', 's1'), layer);
        yield* settle;
        yield* toggle(app);
        expect(stateOf(app)).toMatchObject({
          _tag: 'Recording',
          downloading: { done: 1, total: 4 },
        });
      }),
    ));

  it('says why the microphone would not open', () =>
    timed(
      Effect.gen(function* () {
        const { layer } = yield* world({ microphone: 'missing' });
        const app = yield* start(session('m1', 's1'), layer);
        yield* settle;
        yield* toggle(app);
        expect(stateOf(app)._tag).toBe('Idle');
        expect(noticeOf(app)).toBe('No microphone found');
        expect(blockedOf(app)).toBe(false);
      }),
    ));

  it('asks for a reload when the browser blocked the microphone, until dismissed', () =>
    timed(
      Effect.gen(function* () {
        const { layer } = yield* world({ microphone: 'denied' });
        const app = yield* start(session('m1', 's1'), layer);
        yield* settle;
        yield* toggle(app);
        expect(stateOf(app)._tag).toBe('Idle');
        expect(blockedOf(app)).toBe(true);
        expect(noticeOf(app)).toBeNull();
        yield* send(app, { _tag: 'BlockedDismissed' });
        expect(blockedOf(app)).toBe(false);
      }),
    ));

  it('waits while the microphone opens, recording only once it is live, and a toggle while it waits lets go of it', () =>
    timed(
      Effect.gen(function* () {
        const open = yield* Deferred.make<void>();
        const { layer, levels, recording } = yield* world({
          opening: Deferred.await(open),
        });
        const app = yield* start(session('m1', 's1'), layer);
        yield* settle;
        yield* toggle(app);
        expect(stateOf(app)).toEqual({
          _tag: 'Waiting',
          id: 1,
          owner: session('m1', 's1'),
        });
        expect(recording()).toBe(false);
        yield* Deferred.succeed(open, undefined);
        yield* settle;
        expect(stateOf(app)).toMatchObject({ _tag: 'Recording', id: 1 });
        yield* Queue.offer(levels, 0.5);
        yield* settle;
        expect(stateOf(app)).toMatchObject({ _tag: 'Recording', level: 0.5 });
        yield* askIt(app, { _tag: 'Cancel' });
        expect(stateOf(app)._tag).toBe('Idle');

        const { layer: blocked, recordings } = yield* world({
          opening: Effect.never,
        });
        const again = yield* start(session('m1', 's1'), blocked);
        yield* settle;
        yield* toggle(again);
        expect(stateOf(again)._tag).toBe('Waiting');
        yield* toggle(again);
        expect(stateOf(again)._tag).toBe('Idle');
        expect(recordings()).toBe(0);
      }),
    ));

  it('records the level, carries on as the page changes, and stopped from anywhere gives its text to the field that started it', () =>
    timed(
      Effect.gen(function* () {
        const { layer, levels, asked } = yield* world({
          said: ['  look here '],
        });
        const app = yield* start(session('m1', 's1'), layer);
        yield* settle;
        yield* toggle(app);
        expect(stateOf(app)).toMatchObject({
          _tag: 'Recording',
          level: 0,
          owner: session('m1', 's1'),
        });
        yield* Queue.offer(levels, 0.5);
        yield* settle;
        expect(stateOf(app)).toMatchObject({ _tag: 'Recording', level: 0.5 });
        // Started in Session 1, stopped from Session 2's Draft on another Connection.
        yield* toggle(app, session('m2', 's2'));
        expect(asked).toEqual([{ connectionId: 'm1', audio: [1, 0, 2, 0] }]);
        expect(stateOf(app)._tag).toBe('Idle');
        expect(textsOf(app)).toEqual([
          { id: 1, owner: 's1', text: 'look here' },
        ]);
        yield* send(app, { _tag: 'Took', id: 1 });
        expect(textsOf(app)).toEqual([]);
      }),
    ));

  it('does not start with no field to dictate into, as in Settings, and says why', () =>
    timed(
      Effect.gen(function* () {
        const { layer, recordings } = yield* world({});
        const app = yield* start(null, layer);
        yield* settle;
        yield* toggle(app);
        expect(stateOf(app)._tag).toBe('Idle');
        expect(noticeOf(app)).toBe('Open a Draft to dictate into');
        expect(recordings()).toBe(0);
      }),
    ));

  it('keeps each field’s text until it takes it, and a Cancel throws away only the last one’s', () =>
    timed(
      Effect.gen(function* () {
        const { layer } = yield* world({
          said: ['first', 'second', 'third'],
        });
        const app = yield* start(session('m1', 's1'), layer);
        yield* settle;
        yield* toggle(app);
        yield* toggle(app);
        const question = { key: 'q1', connectionId: 'm1' };
        yield* toggle(app, question);
        yield* toggle(app, question);
        expect(textsOf(app)).toEqual([
          { id: 1, owner: 's1', text: 'first' },
          { id: 2, owner: 'q1', text: 'second' },
        ]);
        // Its next one, not yet taken, takes the place of the last.
        yield* toggle(app, question);
        yield* toggle(app, question);
        expect(textsOf(app)).toEqual([
          { id: 1, owner: 's1', text: 'first' },
          { id: 3, owner: 'q1', text: 'third' },
        ]);
        yield* askIt(app, { _tag: 'Cancel' });
        expect(textsOf(app)).toEqual([{ id: 1, owner: 's1', text: 'first' }]);
      }),
    ));

  it('stops itself at five minutes', () =>
    timed(
      Effect.gen(function* () {
        const { layer, asked } = yield* world({});
        const app = yield* start(session('m1', 's1'), layer);
        yield* settle;
        yield* toggle(app);
        yield* TestClock.adjust(LIMIT - 1_000);
        yield* settle;
        expect(stateOf(app)._tag).toBe('Recording');
        yield* TestClock.adjust('1 second');
        yield* settle;
        expect(asked).toHaveLength(1);
        expect(textsOf(app)).toMatchObject([{ text: 'hello' }]);
      }),
    ));

  it('fails with a retry, which transcribes the same clip again', () =>
    timed(
      Effect.gen(function* () {
        const { layer, asked } = yield* world({
          said: [
            new TranscriptionFailed({ message: 'The model would not load' }),
            'second time',
          ],
        });
        const app = yield* start(session('m1', 's1'), layer);
        yield* settle;
        yield* toggle(app);
        yield* toggle(app);
        expect(stateOf(app)).toMatchObject({
          _tag: 'Failed',
          id: 1,
          owner: session('m1', 's1'),
          reason: 'The model would not load',
        });
        yield* send(app, { _tag: 'Retry', id: 1 });
        expect(asked).toHaveLength(2);
        expect(asked[1]!.audio).toEqual(asked[0]!.audio);
        expect(textsOf(app)).toEqual([
          { id: 1, owner: 's1', text: 'second time' },
        ]);
      }),
    ));

  it('records from the microphone chosen, and switches to another chosen while it records, in the same recording', () =>
    timed(
      Effect.gen(function* () {
        const { layer, opened, recordings, asked } = yield* world({
          connected: ['usb', 'desk'],
          chosen: 'usb',
        });
        const app = yield* start(session('m1', 's1'), layer);
        yield* settle;
        yield* toggle(app);
        expect(stateOf(app)).toMatchObject({
          _tag: 'Recording',
          microphone: 'usb',
          using: 'usb',
        });
        app.send(app.snapshot().id, { _tag: 'Choose', microphone: 'desk' });
        yield* settle;
        expect(stateOf(app)).toMatchObject({
          _tag: 'Recording',
          microphone: 'desk',
          using: 'desk',
        });
        expect(opened).toEqual(['usb', 'desk']);
        expect(recordings()).toBe(1);
        expect(noticeOf(app)).toBeNull();
        yield* toggle(app);
        expect(asked).toHaveLength(1);
      }),
    ));

  it('records from the default when the one chosen is not linked, and says so', () =>
    timed(
      Effect.gen(function* () {
        const { layer, opened } = yield* world({
          chosen: 'gone',
        });
        const app = yield* start(session('m1', 's1'), layer);
        yield* settle;
        yield* toggle(app);
        expect(opened).toEqual(['gone']);
        expect(stateOf(app)).toMatchObject({
          _tag: 'Recording',
          microphone: 'Default',
        });
        expect(noticeOf(app)).toBe(
          "The microphone chosen isn't connected, so the default one is recording",
        );
      }),
    ));

  it('sends its clip again from the start when the socket comes back, as after its Connection restarted, and is heard', () =>
    timed(
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>();
        const { layer, asked, restart } = yield* world({
          said: ['still here'],
          gate: Deferred.await(gate),
        });
        const app = yield* start(session('m1', 's1'), layer);
        yield* settle;
        yield* toggle(app);
        yield* toggle(app);
        expect(stateOf(app)._tag).toBe('Transcribing');
        expect(asked).toHaveLength(1);
        // Restarted, the Connection has none of it.
        yield* restart;
        yield* settle;
        expect(asked).toHaveLength(2);
        expect(asked[1]!.audio).toEqual(asked[0]!.audio);
        yield* Deferred.succeed(gate, undefined);
        yield* settle;
        expect(textsOf(app)).toEqual([
          { id: 1, owner: 's1', text: 'still here' },
        ]);
      }),
    ));

  it('fails with a retry once stopped when its Connection is out of reach for long, naming it', () =>
    timed(
      Effect.gen(function* () {
        const { layer } = yield* world({ unreachable: true });
        const app = yield* start(session('m1', 's1'), layer);
        yield* settle;
        yield* toggle(app);
        // While it records, it waits as long as it records.
        yield* TestClock.adjust(REACH * 2);
        yield* settle;
        expect(stateOf(app)._tag).toBe('Recording');
        yield* toggle(app);
        yield* TestClock.adjust(REACH - 1_000);
        yield* settle;
        expect(stateOf(app)._tag).toBe('Transcribing');
        yield* TestClock.adjust('1 second');
        yield* settle;
        expect(stateOf(app)).toMatchObject({
          _tag: 'Failed',
          id: 1,
          reason: "Couldn't reach Studio",
        });
      }),
    ));

  it('fails with a retry once voice says nothing for a minute, and the retry sends the clip again', () =>
    timed(
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>();
        const { layer, asked } = yield* world({
          said: ['at last'],
          gate: Deferred.await(gate),
        });
        const app = yield* start(session('m1', 's1'), layer);
        yield* settle;
        yield* toggle(app);
        yield* toggle(app);
        yield* TestClock.adjust(ANSWER - 1_000);
        yield* settle;
        expect(stateOf(app)._tag).toBe('Transcribing');
        yield* TestClock.adjust('1 second');
        yield* settle;
        expect(stateOf(app)).toMatchObject({
          _tag: 'Failed',
          id: 1,
          reason: 'Voice stopped answering',
        });
        yield* Deferred.succeed(gate, undefined);
        yield* send(app, { _tag: 'Retry', id: 1 });
        expect(asked).toHaveLength(2);
        expect(asked[1]!.audio).toEqual(asked[0]!.audio);
        expect(textsOf(app)).toEqual([{ id: 1, owner: 's1', text: 'at last' }]);
      }),
    ));

  it('waits five minutes between words while the model downloads', () =>
    timed(
      Effect.gen(function* () {
        const { layer } = yield* world({
          first: [{ _tag: 'Downloading', done: 1, total: 4 }],
          gate: Effect.never,
        });
        const app = yield* start(session('m1', 's1'), layer);
        yield* settle;
        yield* toggle(app);
        yield* toggle(app);
        yield* TestClock.adjust(DOWNLOAD - 1_000);
        yield* settle;
        expect(stateOf(app)).toMatchObject({
          _tag: 'Transcribing',
          downloading: { done: 1, total: 4 },
        });
        yield* TestClock.adjust('1 second');
        yield* settle;
        expect(stateOf(app)).toMatchObject({
          _tag: 'Failed',
          reason: 'Voice stopped answering',
        });
      }),
    ));

  it('says so when nothing was heard', () =>
    timed(
      Effect.gen(function* () {
        const { layer } = yield* world({
          said: ['   '],
        });
        const app = yield* start(session('m1', 's1'), layer);
        yield* settle;
        yield* toggle(app);
        yield* toggle(app);
        expect(stateOf(app)._tag).toBe('Idle');
        expect(noticeOf(app)).toBe('Heard nothing to write');
      }),
    ));
});
