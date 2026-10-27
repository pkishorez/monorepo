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
import { Ask, Dictations } from '../../voice.ts';
import { Preferences, nothing } from '../../../../../store.ts';
import { type Known, Machines, nobody } from '../../../machines.ts';
import { MicrophoneUnavailable, Recorder } from '../../recorder/index.ts';
import { dictations } from '../../voice.ts';
import { DictationLive, LIMIT, State } from '../actor.ts';

/** Hands an ask to the Dictation, as Voice does. */
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
 * minutes; transcribes the clip on the Machine of the Draft on screen when
 * that one can, else on another; and its text goes to the Draft on screen
 * as it stopped, the last one drawn, or into the list with none, where it
 * waits to be pasted. Refused, it retries from the same clip. It records
 * from the microphone chosen, the default when that one is not connected,
 * saying so, and another chosen while it records is switched to in the
 * same recording.
 */

/** A Draft drawn: its key, as its View makes one, and its Machine. */
type Draft = { readonly key: string; readonly machineId: string };

/** Voice's part: the asks it hands on, Drafts drawn and gone among them. */
const Owner = Actor.define('Owner', {
  requires: [Dictations, Preferences],
  message: Schema.TaggedUnion({
    Choose: { microphone: Schema.NullOr(Schema.String) },
    Ask: { ask: Ask },
  }),
});

/** The Draft of one Session, on one Machine. */
const session = (machineId: string, sessionId: string): Draft => ({
  key: sessionId,
  machineId,
});

/** Chooses a microphone, as the Microphone Picker does: in Preferences. */
const choose = Command.make('ChooseMicrophone', {
  args: Schema.Struct({ microphone: Schema.NullOr(Schema.String) }),
  run: ({ microphone }) =>
    Effect.flatMap(Preferences, (device) =>
      device.setMicrophone(microphone),
    ).pipe(Effect.ignore),
});

const OwnerLive = Actor.build(Owner, {
  children: {
    dictation: { actor: DictationLive, props: () => ({ drawn: true }) },
  },
  on: {
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
  /** The microphone chosen in Preferences at the start. */
  readonly chosen?: string | null;
  /** What each `transcribe` waits for before it answers. */
  readonly gate?: Effect.Effect<void>;
  /** What the microphone waits for before it opens, as a browser asking for permission does. */
  readonly opening?: Effect.Effect<void>;
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
      setups: Object.fromEntries(
        Object.entries(options.speech).map(([id, tag]) => [
          id,
          {
            accounts: null,
            speech: speechOf(tag),
            harnesses: null,
            models: [],
            savedRead: true,
            problem: null,
          },
        ]),
      ),
    };
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
            : Effect.andThen(
                options.opening ?? Effect.void,
                Effect.acquireRelease(
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

const textsOf = (app: Running<unknown>) =>
  Schema.decodeUnknownSync(
    Schema.Struct({
      texts: Schema.Array(
        Schema.Struct({
          id: Schema.Finite,
          target: Schema.NullOr(Schema.String),
          text: Schema.String,
        }),
      ),
    }),
  )(dictation(app).model).texts;

/** The app, with `draft` drawn, if any. */
const start = (draft: Draft | null, layer: Layer.Layer<any>) =>
  Effect.gen(function* () {
    const app = (yield* Runtime.start(
      OwnerLive as never,
      layer as never,
    )) as Running<unknown>;
    if (draft !== null)
      app.send(app.snapshot().id, {
        _tag: 'Ask',
        ask: { _tag: 'Register', ...draft },
      });
    return app;
  });

/** Asks the Dictation as the app does: through the root's Command. */
const askIt = (app: Running<unknown>, asked: typeof Ask.Type) =>
  Effect.andThen(
    Effect.sync(() => app.send(app.snapshot().id, { _tag: 'Ask', ask: asked })),
    settle,
  );

const toggle = (app: Running<unknown>) => askIt(app, { _tag: 'Toggle' });

/** A Draft drawn, as its View says. */
const drawn = (app: Running<unknown>, draft: Draft) =>
  askIt(app, { _tag: 'Register', ...draft });

/** A Draft gone, as its View says. */
const gone = (app: Running<unknown>, draft: Draft) =>
  askIt(app, { _tag: 'Unregister', key: draft.key });

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
        expect(textsOf(app)).toEqual([{ id: 1, target: 's1', text: 'hello' }]);
        yield* askIt(app, { _tag: 'Cancel' });
        expect(stateOf(app)._tag).toBe('Idle');
        expect(textsOf(app)).toEqual([]);
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

  it('waits while the microphone opens, recording only once it is live, and a toggle while it waits lets go of it', () =>
    timed(
      Effect.gen(function* () {
        const open = yield* Deferred.make<void>();
        const { layer, levels, recording } = yield* world({
          speech: { m1: 'Ready' },
          opening: Deferred.await(open),
        });
        const app = yield* start(session('m1', 's1'), layer);
        yield* settle;
        yield* toggle(app);
        expect(stateOf(app)).toEqual({ _tag: 'Waiting', id: 1 });
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
          speech: { m1: 'Ready' },
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

  it('records the level, carries on as the page changes, and gives its text to the Draft on screen as it stops', () =>
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
        // Started on page A, it carries on while the app moves to page B.
        yield* send(app, { _tag: 'Level', level: 0.25 });
        yield* gone(app, session('m1', 's1'));
        yield* drawn(app, session('m2', 's2'));
        expect(stateOf(app)._tag).toBe('Recording');
        yield* toggle(app);
        expect(asked).toEqual([{ machineId: 'm2', audio: [1, 0, 2, 0] }]);
        expect(stateOf(app)._tag).toBe('Idle');
        expect(textsOf(app)).toEqual([
          { id: 1, target: 's2', text: 'look here' },
        ]);
        yield* send(app, { _tag: 'Took', id: 1 });
        expect(textsOf(app)).toEqual([]);
      }),
    ));

  it('transcribes on another Machine when the Draft’s cannot, and keeps the text in the list with no Draft on screen', () =>
    timed(
      Effect.gen(function* () {
        const { layer, asked } = yield* world({
          speech: { m1: 'Ready', m2: 'Downloading' },
        });
        const app = yield* start(session('m2', 's2'), layer);
        yield* settle;
        yield* toggle(app);
        yield* gone(app, session('m2', 's2'));
        yield* toggle(app);
        expect(asked.map(({ machineId }) => machineId)).toEqual(['m1']);
        expect(stateOf(app)._tag).toBe('Idle');
        expect(textsOf(app)).toEqual([{ id: 1, target: null, text: 'hello' }]);
      }),
    ));

  it('starts with no Draft drawn, as in Settings, and keeps the text in the list, to paste into a Draft drawn later or throw away', () =>
    timed(
      Effect.gen(function* () {
        const { layer } = yield* world({
          speech: { m1: 'Ready' },
          said: ['first', 'second'],
        });
        const app = yield* start(null, layer);
        yield* settle;
        yield* toggle(app);
        expect(stateOf(app)._tag).toBe('Recording');
        yield* toggle(app);
        yield* toggle(app);
        yield* toggle(app);
        expect(textsOf(app)).toEqual([
          { id: 1, target: null, text: 'first' },
          { id: 2, target: null, text: 'second' },
        ]);
        // No Draft on screen: nowhere to paste.
        yield* askIt(app, { _tag: 'Paste', id: 1 });
        expect(textsOf(app)[0]!.target).toBeNull();
        yield* drawn(app, session('m1', 's1'));
        yield* askIt(app, { _tag: 'Paste', id: 1 });
        yield* askIt(app, { _tag: 'Discard', id: 2 });
        expect(textsOf(app)).toEqual([{ id: 1, target: 's1', text: 'first' }]);
      }),
    ));

  it('gives the text to the last Draft drawn of two', () =>
    timed(
      Effect.gen(function* () {
        const { layer, asked } = yield* world({
          speech: { m1: 'Ready', m2: 'Ready' },
        });
        const app = yield* start(session('m1', 's1'), layer);
        yield* drawn(app, session('m2', 's2'));
        yield* toggle(app);
        yield* toggle(app);
        expect(asked.map(({ machineId }) => machineId)).toEqual(['m2']);
        expect(textsOf(app)).toEqual([{ id: 1, target: 's2', text: 'hello' }]);
        // The one before is on screen again once the last one goes.
        yield* gone(app, session('m2', 's2'));
        yield* toggle(app);
        yield* toggle(app);
        expect(textsOf(app).map(({ target }) => target)).toEqual([null, 's1']);
      }),
    ));

  it('keeps in the list what was on its way to a Draft that left before its text came', () =>
    timed(
      Effect.gen(function* () {
        const gate = yield* Deferred.make<void>();
        const { layer } = yield* world({
          speech: { m1: 'Ready' },
          gate: Deferred.await(gate),
        });
        const app = yield* start(session('m1', 's1'), layer);
        yield* settle;
        yield* toggle(app);
        yield* toggle(app);
        expect(stateOf(app)).toMatchObject({
          _tag: 'Transcribing',
          target: 's1',
        });
        yield* gone(app, session('m1', 's1'));
        expect(stateOf(app)).toMatchObject({
          _tag: 'Transcribing',
          target: null,
        });
        yield* Deferred.succeed(gate, undefined);
        yield* settle;
        expect(textsOf(app)).toEqual([{ id: 1, target: null, text: 'hello' }]);
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
        expect(textsOf(app)).toMatchObject([{ text: 'hello' }]);
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
          target: 's1',
          reason: 'The model would not load',
        });
        yield* send(app, { _tag: 'Retry', id: 1 });
        expect(asked).toHaveLength(2);
        expect(asked[1]!.audio).toEqual(asked[0]!.audio);
        expect(textsOf(app)).toEqual([
          { id: 1, target: 's1', text: 'second time' },
        ]);
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
