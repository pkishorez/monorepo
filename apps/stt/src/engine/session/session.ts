/**
 * One transcribe-to-stop run. Owns the audio clock through the microphone,
 * drives the rolling transcription loop, records injections against the
 * clock, and publishes the transcript as it settles.
 */
import {
  Context,
  Effect,
  Fiber,
  Layer,
  Scope,
  type Stream,
  SubscriptionRef,
} from 'effect';
import {
  Microphone,
  type Capture,
  type MicrophoneError,
} from '../microphone/index.ts';
import {
  Transcriber,
  type LoadProgress,
  type SpeechError,
} from '../transcriber/index.ts';
import {
  buildTranscript,
  emptyTranscript,
  type Injection,
  type Transcript,
  type Word,
} from '../transcript/index.ts';
import { defaultSessionConfig, type SessionConfig } from './config.ts';
import { RollingWords } from './rolling-words.ts';
import { tameWordEnds } from './word-times.ts';

export type SessionStatus =
  | 'idle'
  | 'recording'
  | 'finishing'
  | 'done'
  | { readonly failed: MicrophoneError | SpeechError };

/** What one pass of the model saw and returned, for diagnosis. */
export interface PassReport {
  readonly index: number;
  /** Window on the audio clock that was sent to the model. */
  readonly from: number;
  readonly to: number;
  /** Wall-clock milliseconds the model took. */
  readonly durationMs: number;
  /** Words as the model returned them, already shifted onto the audio clock. */
  readonly words: ReadonlyArray<Word>;
  /** Where the frozen edge sat after this pass. */
  readonly frozenUntil: number;
  readonly outcome: 'transcribed' | 'silent' | 'skipped' | 'last';
}

export interface VoiceSessionService<P = unknown> {
  /** Downloads and warms up a model in the worker; sessions use the last one loaded. */
  readonly loadModel: (
    model: string,
  ) => Stream.Stream<LoadProgress, SpeechError>;
  readonly status: SubscriptionRef.SubscriptionRef<SessionStatus>;
  readonly transcript: SubscriptionRef.SubscriptionRef<Transcript<P>>;
  /** Every pass of the current run, oldest first. */
  readonly passes: SubscriptionRef.SubscriptionRef<ReadonlyArray<PassReport>>;
  /** Opens the microphone and starts transcribing. Idempotent while recording. */
  readonly start: Effect.Effect<void, MicrophoneError | SpeechError>;
  /** Runs the last pass, freezes the transcript and releases the microphone. */
  readonly stop: Effect.Effect<void, SpeechError>;
  /** Records a press at the current audio-clock time. Ignored unless recording. */
  readonly inject: (payload: P) => Effect.Effect<void>;
  /** Forgets the finished transcript so a new session can begin. */
  readonly reset: Effect.Effect<void>;
}

const peakOf = (samples: Float32Array): number => {
  let peak = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const value = Math.abs(samples[index]!);
    if (value > peak) peak = value;
  }
  return peak;
};

interface Live {
  readonly scope: Scope.Closeable;
  readonly capture: Capture;
  loop: Fiber.Fiber<void> | null;
  /** Frozen once the microphone is paused. */
  end: number | null;
}

/** The engine's own dependencies: the speech worker and the microphone. */
const engineLayer = Layer.merge(Transcriber.layer, Microphone.layer);

/**
 * Builds a session service. The worker it spawns lives in the caller's scope,
 * so build it once per page, not per run.
 */
export const makeVoiceSession = <P>(
  config: SessionConfig = defaultSessionConfig,
): Effect.Effect<VoiceSessionService<P>, never, Scope.Scope> =>
  Effect.gen(function* () {
    // Built into the caller's scope: the worker must outlive this constructor.
    const engine = yield* Layer.build(engineLayer);
    const microphone = Context.get(engine, Microphone);
    const transcriber = Context.get(engine, Transcriber);

    const status = yield* SubscriptionRef.make<SessionStatus>('idle');
    const transcript =
      yield* SubscriptionRef.make<Transcript<P>>(emptyTranscript);
    const passes = yield* SubscriptionRef.make<ReadonlyArray<PassReport>>([]);

    let words = new RollingWords();
    let injections: Array<Injection<P>> = [];
    let live: Live | null = null;

    const publish = (final: boolean) =>
      SubscriptionRef.set(
        transcript,
        buildTranscript(words.all, injections, { final }),
      );

    const report = (
      entry: Omit<PassReport, 'index' | 'frozenUntil'>,
    ): Effect.Effect<void> =>
      SubscriptionRef.update(passes, (list) => [
        ...list,
        { ...entry, index: list.length, frozenUntil: words.windowStart },
      ]);

    /** One pass over the unfrozen stretch of audio. */
    const pass = (capture: Capture, options: { readonly last: boolean }) =>
      Effect.gen(function* () {
        const now = yield* capture.now;
        words.capWindow(now, config.windowSeconds);
        const from = words.windowStart;
        const started = Date.now();
        const skipped = (outcome: 'skipped' | 'silent') =>
          report({ from, to: now, durationMs: 0, words: [], outcome });
        if (now - from < config.minimumWindowSeconds && !options.last) {
          return yield* skipped('skipped');
        }
        const samples = yield* capture.window(from, now);
        if (samples.length === 0) return;
        if (peakOf(samples) < config.silencePeak) {
          words.clearProvisional();
          yield* publish(false);
          return yield* skipped('silent');
        }
        const heard = yield* transcriber.transcribe(samples, from);
        words.accept(
          tameWordEnds(heard, {
            windowEnd: now,
            maxWordSeconds: config.maxWordSeconds,
          }),
          now - config.finalizeLagSeconds,
        );
        yield* publish(false);
        yield* report({
          from,
          to: now,
          durationMs: Date.now() - started,
          words: heard,
          outcome: options.last ? 'last' : 'transcribed',
        });
      });

    /** Releases the microphone without a last pass. */
    const abandon = Effect.gen(function* () {
      const current = live;
      if (current === null) return;
      live = null;
      words.freezeAll();
      yield* publish(true);
      yield* Scope.close(current.scope, Effect.void as never);
    });

    /** A failed pass ends the run: the transcript is frozen as it stands. */
    const loop = (capture: Capture) =>
      Effect.gen(function* () {
        while (true) {
          yield* Effect.sleep(`${config.passEverySeconds} seconds`);
          yield* pass(capture, { last: false });
        }
      }).pipe(
        Effect.catch((failed) =>
          Effect.andThen(abandon, SubscriptionRef.set(status, { failed })),
        ),
      );

    const start = Effect.gen(function* () {
      if (live !== null) return;
      words = new RollingWords();
      injections = [];
      yield* SubscriptionRef.set(passes, []);
      yield* publish(false);
      const scope = yield* Scope.make();
      const capture = yield* microphone.capture.pipe(Scope.provide(scope));
      const session: Live = { scope, capture, loop: null, end: null };
      live = session;
      session.loop = yield* loop(capture).pipe(Effect.forkIn(scope));
      yield* SubscriptionRef.set(status, 'recording');
    });

    const stop = Effect.gen(function* () {
      const current = live;
      if (current === null || current.end !== null) return;
      yield* SubscriptionRef.set(status, 'finishing');
      current.end = yield* current.capture.now;
      yield* current.capture.pause;
      if (current.loop) yield* Fiber.interrupt(current.loop);
      yield* pass(current.capture, { last: true });
      words.freezeAll();
      yield* publish(true);
      yield* Scope.close(current.scope, Effect.void as never);
      live = null;
      yield* SubscriptionRef.set(status, 'done');
    }).pipe(
      Effect.tapError((failed) =>
        Effect.andThen(abandon, SubscriptionRef.set(status, { failed })),
      ),
    );

    const inject = (payload: P) =>
      Effect.gen(function* () {
        const current = live;
        if (current === null) return;
        const at = current.end ?? (yield* current.capture.now);
        injections.push({
          id: `injection-${injections.length + 1}`,
          at,
          sequence: injections.length,
          payload,
        });
        yield* publish(false);
      });

    const reset = Effect.gen(function* () {
      if (live !== null) return;
      words = new RollingWords();
      injections = [];
      yield* SubscriptionRef.set(transcript, emptyTranscript);
      yield* SubscriptionRef.set(passes, []);
      yield* SubscriptionRef.set(status, 'idle');
    });

    return {
      loadModel: transcriber.load,
      status,
      transcript,
      passes,
      start,
      stop,
      inject,
      reset,
    };
  });
