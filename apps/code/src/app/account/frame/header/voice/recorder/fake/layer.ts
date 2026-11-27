import {
  type Cause,
  Effect,
  Layer,
  Queue,
  Stream,
  SubscriptionRef,
} from 'effect';
import {
  type Hearing,
  type Input,
  type Microphones,
  type Recorder,
  recorderOver,
  unavailable,
} from '../recorder.ts';
import type { MicrophoneState } from './microphone.ts';
import { CHUNK_MS, chunkOf } from './sound.ts';

/*
 * `Recorder` over the Microphone fake's state: the real Recorder
 * (`recorderOver`, which keeps the clip and its audio) over the
 * microphones in it, the site allowed at once, failing as the browser
 * fails, with the browser's own errors made into sentences the
 * same way (`unavailable`).
 *
 * 1. Open   at once: the one chosen, else the system default (the first
 *           plugged in), falling back to it when the one chosen is gone;
 *           with none plugged in, it fails as missing.
 * 2. Hear   a chunk of a voice each eighth of a second.
 * 3. List   the system default first (named after the one it is, as
 *           Chrome names it), then each one, again on each change.
 */

/** An error as the browser throws it, by its name. */
const browserError = (name: string, message: string) =>
  Object.assign(new Error(message), { name });

/** The system default: the first plugged in; none when nothing is. */
const systemDefault = (now: MicrophoneState) => now.microphones[0];

/** The inputs as the browser lists them. */
const listed = (now: MicrophoneState): ReadonlyArray<Input> => {
  const fallback = systemDefault(now);
  return [
    {
      deviceId: null,
      label: fallback === undefined ? '' : `Default - ${fallback.name}`,
    },
    ...now.microphones.map(({ id, name }) => ({ deviceId: id, label: name })),
  ];
};

export const microphoneOver = (
  state: SubscriptionRef.SubscriptionRef<MicrophoneState>,
): Layer.Layer<Recorder> => {
  // 1. Open
  const open = (microphone: string | null) =>
    Effect.gen(function* () {
      const now = yield* SubscriptionRef.get(state);
      const chosen =
        microphone === null
          ? undefined
          : now.microphones.find(({ id }) => id === microphone);
      const opened = chosen ?? systemDefault(now);
      if (opened === undefined)
        return yield* Effect.fail(
          unavailable(browserError('NotFoundError', 'None')),
        );
      return {
        name: opened.name,
        fellBack: microphone !== null && chosen === undefined,
      };
    });

  // 2. Hear
  const hear: Microphones['hear'] = (chunks, microphone, added) =>
    Effect.gen(function* () {
      const heard = yield* open(microphone);
      let ended = false;
      const levels = yield* Queue.sliding<number, Cause.Done>(1);
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          ended = true;
          Queue.endUnsafe(levels);
        }),
      );
      let index = 0;
      yield* Effect.forkScoped(
        Effect.forever(
          Effect.andThen(
            Effect.sleep(CHUNK_MS),
            Effect.sync(() => {
              if (ended) return;
              const chunk = chunkOf(index++);
              chunks.push(chunk.samples);
              added();
              Queue.offerUnsafe(levels, chunk.level);
            }),
          ),
        ),
      );
      return {
        heard,
        levels: Stream.fromQueue(levels),
        switchTo: open,
      } satisfies Hearing;
    });

  // 3. List
  const inputs = SubscriptionRef.changes(state).pipe(
    Stream.map(listed),
    Stream.changesWith((a, b) => JSON.stringify(a) === JSON.stringify(b)),
  );

  return Layer.merge(
    // The mark every fake carries: a production build that has it fails.
    Layer.effectDiscard(Effect.logDebug('kestack-fake: the Microphone fake')),
    recorderOver({ hear, inputs }),
  );
};
