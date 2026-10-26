import {
  Deferred,
  Effect,
  Layer,
  Queue,
  Schema,
  Stream,
  SubscriptionRef,
} from 'effect';
import type { Cause, Scope } from 'effect';
import { TestClock } from 'effect/testing';
import {
  CodeClient,
  CodeClients,
  type SpeechToTextState,
  TranscriptionFailed,
} from '@kestack/connect/code';
import {
  Actor,
  Command,
  type Instance,
  Runtime,
  type Running,
} from '@kestack/kabuki';
import { connection as RpcConnection } from '@kestack/rpc-toolkit/rpc/websocket';
import { describe, expect, it } from 'vitest';
import {
  Ask,
  DeviceState,
  Dictations,
  type Known,
  Machines,
  MicrophoneUnavailable,
  nobody,
  nothing,
  Recorder,
} from '../../../layer/capabilities/index.ts';
import { dictations } from '../../../layer/services/index.ts';
import { DictationLive, LIMIT, State } from './actor.ts';

/** Hands an ask to the Dictation, as the root page does. */
const ask = Command.make('AskDictation', {
  args: Ask,
  run: (asked) =>
    Effect.flatMap(Dictations, ({ asked: queue }) =>
      Effect.asVoid(Queue.offer(queue, asked)),
    ),
});

/*
 * The Dictation with the microphone and every Machine stood in for. It
 * starts only with a Machine to transcribe on, and says why otherwise, for
 * a few seconds; records the level until it is asked to stop, or for five
 * minutes; transcribes the clip on the open Session's Machine when that
 * one can, else on another; and its text waits for the Draft open when it
 * stopped. Refused, it retries from the same clip. It records from the
 * microphone chosen, the default when that one is not connected, saying
 * so, and another chosen while it records is switched to in the same
 * recording.
 */

const Place = Schema.NullOr(
  Schema.Struct({
    machineId: Schema.String,
    projectId: Schema.String,
    sessionId: Schema.NullOr(Schema.String),
  }),
);
type Place = typeof Place.Type;

/** The root page's part: where the app is, and the asks it hands on. */
const Owner = Actor.define('Owner', {
  requires: [Dictations, DeviceState],
  model: Schema.Struct({ place: Place }),
  message: Schema.TaggedUnion({
    Open: { place: Place },
    Choose: { microphone: Schema.NullOr(Schema.String) },
    Ask: { ask: Ask },
  }),
});

const session = (machineId: string, sessionId: string) => ({
  machineId,
  projectId: 'p1',
  sessionId,
});

/** Chooses a microphone, as the Microphone Picker does: in Device State. */
const choose = Command.make('ChooseMicrophone', {
  args: Schema.Struct({ microphone: Schema.NullOr(Schema.String) }),
  run: ({ microphone }) =>
    Effect.flatMap(DeviceState, (device) =>
      device.setMicrophone(microphone),
    ).pipe(Effect.ignore),
});

const OwnerLive = (start: { readonly place: Place }) =>
  Actor.build(Owner, {
    init: () => ({ model: { place: start.place } }),
    children: {
      dictation: {
        actor: DictationLive,
        props: ({ model }) => model,
      },
    },
    on: {
      Open: ({ place }, { model }) => ({ model: { ...model, place } }),
      Choose: ({ microphone }) => ({ command: choose({ microphone }) }),
      Ask: ({ ask: asked }) => ({ command: ask(asked) }),
    },
  });

type Api = CodeClient['Service'];

const speechOf = (tag: SpeechToTextState['_tag']): SpeechToTextState =>
  tag === 'Downloading'
    ? { _tag: 'Downloading', done: 1, total: 2 }
    : tag === 'Failed'
      ? { _tag: 'Failed', reason: 'No network' }
      : { _tag: tag };

/** The stand-ins, and what they were asked. */
const world = (options: {
  readonly speech: Readonly<Record<string, SpeechToTextState['_tag']>>;
  readonly microphone?: 'denied';
  /** What each `transcribe` answers, in turn; the last one again after. */
  readonly said?: ReadonlyArray<string | TranscriptionFailed>;
  /** The microphones connected, by `deviceId`, besides the default. */
  readonly connected?: ReadonlyArray<string>;
  /** The microphone chosen in Device State at the start. */
  readonly chosen?: string | null;
  /** What each `transcribe` waits for before it answers. */
  readonly gate?: Effect.Effect<void>;
}) =>
  Effect.gen(function* () {
    // Two Machines listed, each answering, each with its Speech to Text.
    const known: Known = {
      ...nobody,
      accountId: 'a1',
      machines: ['m1', 'm2'].map((id) => ({
        id,
        name: id,
        key: `key-${id}`,
        version: '0.0.1',
        status: { _tag: 'Opening' } as const,
        lastSeen: 1,
      })),
      lines: { m1: 'connected', m2: 'connected' },
      speech: Object.fromEntries(
        Object.entries(options.speech).map(([id, tag]) => [id, speechOf(tag)]),
      ),
    };
    const chosen = yield* SubscriptionRef.make(options.chosen ?? null);
    const device = Layer.succeed(DeviceState, {
      read: Effect.map(SubscriptionRef.get(chosen), (microphone) => ({
        ...nothing,
        microphone,
      })),
      setBindings: () => Effect.void,
      setVim: () => Effect.void,
      setMicrophone: (microphone) => SubscriptionRef.set(chosen, microphone),
      setTouchMode: () => Effect.void,
      setSidebarMachine: () => Effect.void,
      markSeen: () => Effect.void,
      drop: () => Effect.void,
      changes: SubscriptionRef.changes(chosen).pipe(
        Stream.drop(1),
        Stream.map(() => undefined),
      ),
    });
    const levels = yield* Queue.unbounded<number, Cause.Done>();
    const asked: Array<{ machineId: string; audio: ReadonlyArray<number> }> =
      [];
    let recordings = 0;
    /** The microphones asked for, in turn: to record, then each switch. */
    const opened: Array<string | null> = [];
    let recording = false;
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
    const machine = (machineId: string) =>
      Layer.merge(
        // An RPC client's procedures are generic over how they are called;
        // a stand-in answers the one way the app calls them.
        Layer.mock(CodeClient)({
          watchSpeechToText: (() =>
            Stream.make(
              speechOf(options.speech[machineId] ?? 'Off'),
            )) as unknown as Api['watchSpeechToText'],
          transcribe: (({ audio }: { readonly audio: Uint8Array }) =>
            Effect.suspend(() => {
              asked.push({ machineId, audio: [...audio] });
              return options.gate ?? Effect.void;
            }).pipe(
              Effect.andThen(
                Effect.suspend(() => {
                  const next = said.length > 1 ? said.shift()! : said[0]!;
                  return typeof next === 'string'
                    ? Effect.succeed(next)
                    : Effect.fail(next);
                }),
              ),
            )) as unknown as Api['transcribe'],
        }),
        Layer.mock(RpcConnection)({
          connectionStatus: Stream.concat(
            Stream.make('connected' as const),
            Stream.never,
          ),
          keepSubscribed: (subscribe) => subscribe(),
          hooks: { onConnect: Effect.void, onDisconnect: Effect.void },
        }),
      );
    const layer = Layer.mergeAll(
      dictations,
      device,
      Layer.mock(Machines)({ state: Stream.make(known) }),
      CodeClients.make(machine),
      Layer.succeed(Recorder, {
        record: (microphone) =>
          options.microphone === 'denied'
            ? Effect.fail(
                new MicrophoneUnavailable({
                  reason: 'The microphone is blocked for this site',
                }),
              )
            : Effect.acquireRelease(
                Effect.sync(() => {
                  recordings++;
                  recording = true;
                  return {
                    heard: heard(microphone),
                    levels: Stream.fromQueue(levels),
                  };
                }),
                () => Effect.sync(() => void (recording = false)),
              ),
        switchTo: (microphone) =>
          Effect.sync(() => (recording ? heard(microphone) : null)),
        clip: Effect.succeed(Uint8Array.of(1, 0, 2, 0)),
        inputs: Stream.empty,
      }),
    );
    return {
      layer,
      levels,
      asked,
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

const start = (place: Place, layer: Layer.Layer<any>) =>
  Runtime.start(OwnerLive({ place }) as never, layer as never) as Effect.Effect<
    Running<unknown>,
    never,
    Scope.Scope
  >;

/** Asks the Dictation as the app does: through the root's Command. */
const askIt = (app: Running<unknown>, asked: typeof Ask.Type) =>
  Effect.andThen(
    Effect.sync(() => app.send(app.snapshot().id, { _tag: 'Ask', ask: asked })),
    settle,
  );

const toggle = (app: Running<unknown>) => askIt(app, { _tag: 'Toggle' });

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
          speech: { m1: 'Ready' },
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
        const { layer } = yield* world({ speech: { m1: 'Ready' } });
        const app = yield* start(session('m1', 's1'), layer);
        yield* settle;
        yield* toggle(app);
        yield* toggle(app);
        expect(stateOf(app)._tag).toBe('Done');
        yield* askIt(app, { _tag: 'Cancel' });
        expect(stateOf(app)._tag).toBe('Idle');
      }),
    ));

  it('throws away the one recording on Cancel: the microphone lets go and nothing is transcribed', () =>
    timed(
      Effect.gen(function* () {
        const { layer, asked, recording } = yield* world({
          speech: { m1: 'Ready' },
        });
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

  it('does not start without a Machine to transcribe on, and says why for a few seconds', () =>
    timed(
      Effect.gen(function* () {
        const { layer, recordings } = yield* world({ speech: { m1: 'Off' } });
        const app = yield* start(session('m1', 's1'), layer);
        yield* settle;
        yield* toggle(app);
        expect(stateOf(app)._tag).toBe('Idle');
        expect(noticeOf(app)).toBe('Turn on Speech to Text in Settings');
        expect(recordings()).toBe(0);
        yield* TestClock.adjust('4 seconds');
        yield* settle;
        expect(noticeOf(app)).toBeNull();
      }),
    ));

  it('says why the microphone would not open', () =>
    timed(
      Effect.gen(function* () {
        const { layer } = yield* world({
          speech: { m1: 'Ready' },
          microphone: 'denied',
        });
        const app = yield* start(session('m1', 's1'), layer);
        yield* settle;
        yield* toggle(app);
        expect(stateOf(app)._tag).toBe('Idle');
        expect(noticeOf(app)).toBe('The microphone is blocked for this site');
      }),
    ));

  it('records the level, then transcribes on the open Session’s Machine for the Draft open as it stops', () =>
    timed(
      Effect.gen(function* () {
        const { layer, levels, asked } = yield* world({
          speech: { m1: 'Ready', m2: 'Ready' },
          said: ['  look here '],
        });
        const app = yield* start(session('m1', 's1'), layer);
        yield* settle;
        yield* toggle(app);
        expect(stateOf(app)).toMatchObject({ _tag: 'Recording', level: 0 });
        yield* Queue.offer(levels, 0.5);
        yield* settle;
        expect(stateOf(app)).toMatchObject({ _tag: 'Recording', level: 0.5 });
        // It carries on while the app moves to another Session.
        yield* send(app, { _tag: 'Level', level: 0.25 });
        app.send(app.snapshot().id, {
          _tag: 'Open',
          place: session('m2', 's2'),
        });
        yield* settle;
        expect(stateOf(app)._tag).toBe('Recording');
        yield* toggle(app);
        expect(asked).toEqual([{ machineId: 'm2', audio: [1, 0, 2, 0] }]);
        const done = stateOf(app);
        expect(done).toEqual({
          _tag: 'Done',
          id: 1,
          target: session('m2', 's2'),
          text: 'look here',
        });
        yield* send(app, { _tag: 'Took', id: 1 });
        expect(stateOf(app)._tag).toBe('Idle');
      }),
    ));

  it('transcribes on another Machine when the open Session’s cannot, and goes to the next Draft with none open', () =>
    timed(
      Effect.gen(function* () {
        const { layer, asked } = yield* world({
          speech: { m1: 'Ready', m2: 'Downloading' },
        });
        const app = yield* start(session('m2', 's2'), layer);
        yield* settle;
        yield* toggle(app);
        app.send(app.snapshot().id, { _tag: 'Open', place: null });
        yield* settle;
        yield* toggle(app);
        expect(asked.map(({ machineId }) => machineId)).toEqual(['m1']);
        expect(stateOf(app)).toMatchObject({ _tag: 'Done', target: null });
      }),
    ));

  it('stops itself at five minutes', () =>
    timed(
      Effect.gen(function* () {
        const { layer, asked } = yield* world({ speech: { m1: 'Ready' } });
        const app = yield* start(session('m1', 's1'), layer);
        yield* settle;
        yield* toggle(app);
        yield* TestClock.adjust(LIMIT - 1_000);
        yield* settle;
        expect(stateOf(app)._tag).toBe('Recording');
        yield* TestClock.adjust('1 second');
        yield* settle;
        expect(asked).toHaveLength(1);
        expect(stateOf(app)).toMatchObject({ _tag: 'Done', text: 'hello' });
      }),
    ));

  it('fails with a retry, which transcribes the same clip again', () =>
    timed(
      Effect.gen(function* () {
        const { layer, asked } = yield* world({
          speech: { m1: 'Ready' },
          said: [
            new TranscriptionFailed({ message: 'The model would not load' }),
            'second time',
          ],
        });
        const app = yield* start(session('m1', 's1'), layer);
        yield* settle;
        yield* toggle(app);
        yield* toggle(app);
        expect(stateOf(app)).toEqual({
          _tag: 'Failed',
          id: 1,
          target: session('m1', 's1'),
          reason: 'The model would not load',
        });
        yield* send(app, { _tag: 'Retry', id: 1 });
        expect(asked).toHaveLength(2);
        expect(asked[1]!.audio).toEqual(asked[0]!.audio);
        expect(stateOf(app)).toMatchObject({
          _tag: 'Done',
          text: 'second time',
        });
      }),
    ));

  it('records from the microphone chosen, and switches to another chosen while it records, in the same recording', () =>
    timed(
      Effect.gen(function* () {
        const { layer, opened, recordings, asked } = yield* world({
          speech: { m1: 'Ready' },
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

  it('records from the default when the one chosen is not connected, and says so', () =>
    timed(
      Effect.gen(function* () {
        const { layer, opened } = yield* world({
          speech: { m1: 'Ready' },
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

  it('says so when nothing was heard', () =>
    timed(
      Effect.gen(function* () {
        const { layer } = yield* world({
          speech: { m1: 'Ready' },
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
