import { type Cause, Effect, Layer, Queue, Stream } from 'effect';
import type { Runtime } from '@kestack/kabuki';
import {
  type Hearing,
  type Input,
  type Microphones,
  type Recorder,
  recorderOver,
  unavailable,
} from '../recorder.ts';
import type {
  MicrophoneFake,
  MicrophoneMessage,
  MicrophoneModel,
} from './actor.ts';
import { CHUNK_MS, chunkOf } from './sound.ts';

/*
 * `Recorder` over the running Microphone fake: the real Recorder
 * (`recorderOver`, which keeps the clip and its audio) over microphones
 * read from the fake's Model, the site allowed at once, failing as the
 * browser fails, with the browser's own errors made into sentences the
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
const systemDefault = (model: MicrophoneModel) => model.microphones[0];

/** The inputs as the browser lists them. */
const listed = (model: MicrophoneModel): ReadonlyArray<Input> => {
  const fallback = systemDefault(model);
  return [
    {
      deviceId: null,
      label: fallback === undefined ? '' : `Default - ${fallback.name}`,
    },
    ...model.microphones.map(({ id, name }) => ({ deviceId: id, label: name })),
  ];
};

export const microphoneOver = (
  runtime: Runtime<typeof MicrophoneFake>,
): Layer.Layer<Recorder> => {
  const root = runtime.root;
  const send = (message: MicrophoneMessage) =>
    Effect.sync(() => void root.send(message));

  // 1. Open
  const open = (microphone: string | null) =>
    Effect.gen(function* () {
      const model = root.model;
      const chosen =
        microphone === null
          ? undefined
          : model.microphones.find(({ id }) => id === microphone);
      const opened = chosen ?? systemDefault(model);
      if (opened === undefined)
        return yield* Effect.fail(
          unavailable(browserError('NotFoundError', 'None')),
        );
      return {
        id: opened.id,
        heard: {
          name: opened.name,
          fellBack: microphone !== null && chosen === undefined,
        },
      };
    });

  // 2. Hear
  const hear: Microphones['hear'] = (chunks, microphone, added) =>
    Effect.gen(function* () {
      const first = yield* open(microphone);
      let ended = false;
      const levels = yield* Queue.sliding<number, Cause.Done>(1);
      yield* send({ _tag: 'RecordingFrom', id: first.id });
      yield* Effect.addFinalizer(() =>
        Effect.andThen(
          Effect.sync(() => {
            ended = true;
            Queue.endUnsafe(levels);
          }),
          send({ _tag: 'RecordingEnded' }),
        ),
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
      const switchTo: Hearing['switchTo'] = (next) =>
        Effect.gen(function* () {
          const opened = yield* open(next);
          if (!ended) yield* send({ _tag: 'RecordingFrom', id: opened.id });
          return opened.heard;
        });
      return {
        heard: first.heard,
        levels: Stream.fromQueue(levels),
        switchTo,
      } satisfies Hearing;
    });

  // 3. List
  const inputs = runtime.changes.pipe(
    Stream.map((snapshot) => listed(snapshot.root.model)),
    Stream.changesWith((a, b) => JSON.stringify(a) === JSON.stringify(b)),
  );

  return Layer.merge(
    // The mark every fake carries: a production build that has it fails.
    Layer.effectDiscard(Effect.logDebug('kestack-fake: the Microphone fake')),
    recorderOver({ hear, inputs }),
  );
};
