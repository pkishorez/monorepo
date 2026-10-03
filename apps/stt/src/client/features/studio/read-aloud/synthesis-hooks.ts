/**
 * React's door onto the synthesizer: one runtime for the page, a hook that
 * loads Kokoro with progress, and a hook that plays sentences as they arrive.
 */
import { Cause, Effect, ManagedRuntime, Stream } from 'effect';
import { useRef, useState } from 'react';
import { useComponentLifecycle, useRunEffectLatest } from 'use-effect-ts';
import {
  Synthesizer,
  type VoiceId,
} from '../../../../engine/synthesizer/index.ts';

let runtime: ManagedRuntime.ManagedRuntime<Synthesizer, never> | null = null;

/**
 * Made on first use and kept for the page, so Kokoro loads once however
 * often the dialog opens.
 */
const synthesizerRuntime = () =>
  (runtime ??= ManagedRuntime.make(Synthesizer.layer));

const withSynthesizer = <A, E>(
  use: (synthesizer: Synthesizer['Service']) => Effect.Effect<A, E>,
) =>
  Effect.gen(function* () {
    const context = yield* synthesizerRuntime().contextEffect;
    return yield* Effect.flatMap(Synthesizer, use).pipe(
      Effect.provide(context),
    );
  });

const describeCause = (cause: Cause.Cause<{ readonly message: string }>) => {
  const failure = Cause.findErrorOption(cause);
  return failure._tag === 'Some' ? failure.value.message : Cause.pretty(cause);
};

/** Reports a failure; being stopped is not one. */
const reportFailure =
  (report: (message: string) => void) =>
  (cause: Cause.Cause<{ readonly message: string }>) =>
    Cause.hasInterruptsOnly(cause)
      ? Effect.void
      : Effect.sync(() => report(describeCause(cause)));

export type VoiceModel =
  | {
      readonly status: 'loading';
      readonly loaded: number;
      readonly total: number;
    }
  | { readonly status: 'ready' }
  | { readonly status: 'error'; readonly message: string };

/** Loads Kokoro while the component is mounted; ready at once when loaded before. */
export function useVoiceModel(): VoiceModel {
  const [state, setState] = useState<VoiceModel>({
    status: 'loading',
    loaded: 0,
    total: 0,
  });
  useComponentLifecycle(
    withSynthesizer((synthesizer) =>
      Stream.runForEach(synthesizer.load, (progress) =>
        Effect.sync(() =>
          setState(
            progress.status === 'ready'
              ? { status: 'ready' }
              : {
                  status: 'loading',
                  loaded: progress.loaded,
                  total: progress.total,
                },
          ),
        ),
      ),
    ).pipe(
      Effect.catchCause(
        reportFailure((message) => setState({ status: 'error', message })),
      ),
    ),
  );
  return state;
}

export interface Playback {
  /** Waiting for the first sentence, or speaking. */
  readonly playing: boolean;
  /** The sentence being heard, once the first one starts. */
  readonly sentence: number | null;
  readonly error: string | null;
  readonly play: (sentences: ReadonlyArray<string>, voice: VoiceId) => void;
  readonly stop: () => void;
}

/**
 * Plays each sentence right after the one before, as soon as it arrives.
 * Stopping, playing again or unmounting closes the audio at once.
 */
export function usePlayback(): Playback {
  const [playing, setPlaying] = useState(false);
  const [sentence, setSentence] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useRunEffectLatest((effect: Effect.Effect<void>) => effect);
  // A stopped run may finish closing after the next has begun; only the
  // latest run gets to reset the state.
  const latest = useRef(0);

  const speak = (
    id: number,
    audio: AudioContext,
    sentences: ReadonlyArray<string>,
    voice: VoiceId,
  ) =>
    Effect.gen(function* () {
      yield* Effect.addFinalizer(() =>
        Effect.promise(() => audio.close()).pipe(
          Effect.andThen(
            Effect.sync(() => {
              if (id !== latest.current) return;
              setPlaying(false);
              setSentence(null);
            }),
          ),
        ),
      );
      const timers = new Set<ReturnType<typeof setTimeout>>();
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => timers.forEach(clearTimeout)),
      );
      let endsAt = 0;
      yield* withSynthesizer((synthesizer) =>
        Stream.runForEach(synthesizer.speak(sentences, voice), (spoken) =>
          Effect.sync(() => {
            const buffer = audio.createBuffer(
              1,
              spoken.samples.length,
              spoken.sampleRate,
            );
            buffer.copyToChannel(spoken.samples, 0);
            const source = audio.createBufferSource();
            source.buffer = buffer;
            source.connect(audio.destination);
            const startsAt = Math.max(endsAt, audio.currentTime);
            source.start(startsAt);
            endsAt = startsAt + buffer.duration;
            const timer = setTimeout(
              () => setSentence(spoken.index),
              (startsAt - audio.currentTime) * 1000,
            );
            timers.add(timer);
          }),
        ),
      );
      yield* Effect.sleep((endsAt - audio.currentTime) * 1000);
    }).pipe(Effect.scoped, Effect.catchCause(reportFailure(setError)));

  const stop = Effect.sync(() => {
    latest.current += 1;
    setPlaying(false);
    setSentence(null);
  });

  return {
    playing,
    sentence,
    error,
    play: (sentences, voice) => {
      // Made in the click, so browsers that need a gesture let it play.
      const audio = new AudioContext();
      setPlaying(true);
      setSentence(null);
      setError(null);
      void run(speak(++latest.current, audio, sentences, voice));
    },
    stop: () => void run(stop),
  };
}
