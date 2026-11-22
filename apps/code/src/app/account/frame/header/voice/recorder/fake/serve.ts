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
 * read from the fake's Model, failing as the browser fails, with the
 * browser's own errors made into sentences the same way (`unavailable`).
 *
 * 1. Allow  the first use asks: it waits until a Control allows or denies
 *           it. Denied, or blocked until a reload, it fails as blocked.
 * 2. Open   after `opensInMs`; broken, it fails as in use; with none
 *           plugged in, as missing. The one chosen, else the system
 *           default, falling back to it when the one chosen is gone.
 * 3. Hear   a chunk each eighth of a second, loud or silent as the Model
 *           says now; the one recording unplugged, it ends.
 * 4. List   once allowed, the system default first (named after the one
 *           it is, as Chrome names it), then each one, again on each change.
 */

/** An error as the browser throws it, by its name. */
const browserError = (name: string, message: string) =>
  Object.assign(new Error(message), { name });

const BLOCKED = () => unavailable(browserError('NotAllowedError', 'Denied'));

/** The system default, as the Model says it is now; none when nothing is plugged in. */
const systemDefault = (model: MicrophoneModel) =>
  model.microphones.find(({ id }) => id === model.systemDefault) ??
  model.microphones[0];

/** The inputs as the browser lists them, once allowed. */
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
  const models = runtime.changes.pipe(
    Stream.map((snapshot) => snapshot.root.model),
  );

  // 1. Allow
  const allowed = Effect.gen(function* () {
    if (root.model.permission === 'Prompt' && !root.model.asking)
      yield* send({ _tag: 'PermissionAsked' });
    const { model } = yield* Effect.orDie(
      root.until(({ model: now }) => now.permission !== 'Prompt'),
    );
    if (model.permission === 'Denied') return yield* Effect.fail(BLOCKED());
  });

  // 2. Open
  const open = (microphone: string | null) =>
    Effect.gen(function* () {
      yield* allowed;
      if (root.model.untilReload.blocked) return yield* Effect.fail(BLOCKED());
      yield* Effect.sleep(root.model.opensInMs);
      const model = root.model;
      if (model.broken)
        return yield* Effect.fail(
          unavailable(browserError('NotReadableError', 'In use')),
        );
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

  // 3. Hear
  const hear: Microphones['hear'] = (chunks, microphone, added) =>
    Effect.gen(function* () {
      const first = yield* open(microphone);
      let live = first.id;
      let ended = false;
      const levels = yield* Queue.sliding<number, Cause.Done>(1);
      const end = Effect.sync(() => {
        ended = true;
        Queue.endUnsafe(levels);
      });
      yield* send({ _tag: 'RecordingFrom', id: live });
      yield* Effect.addFinalizer(() =>
        Effect.andThen(end, send({ _tag: 'RecordingEnded' })),
      );
      let index = 0;
      yield* Effect.forkScoped(
        Effect.forever(
          Effect.andThen(
            Effect.sleep(CHUNK_MS),
            Effect.sync(() => {
              if (ended) return;
              const chunk = chunkOf(index++, root.model.loud);
              chunks.push(chunk.samples);
              added();
              Queue.offerUnsafe(levels, chunk.level);
            }),
          ),
        ),
      );
      // The one recording unplugged ends it, as its track ending does.
      yield* Effect.forkScoped(
        models.pipe(
          Stream.filter(
            (model) => !model.microphones.some(({ id }) => id === live),
          ),
          Stream.take(1),
          Stream.runDrain,
          Effect.andThen(end),
        ),
      );
      const switchTo: Hearing['switchTo'] = (next) =>
        Effect.gen(function* () {
          const opened = yield* open(next);
          if (!ended) {
            live = opened.id;
            yield* send({ _tag: 'RecordingFrom', id: live });
          }
          return opened.heard;
        });
      return {
        heard: first.heard,
        levels: Stream.fromQueue(levels),
        switchTo,
      } satisfies Hearing;
    });

  // 4. List
  const inputs = Stream.unwrap(
    Effect.as(
      allowed,
      models.pipe(
        Stream.map(listed),
        Stream.changesWith((a, b) => JSON.stringify(a) === JSON.stringify(b)),
      ),
    ),
  );

  return Layer.merge(
    // The mark every fake carries: a production build that has it fails.
    Layer.effectDiscard(Effect.logDebug('kestack-fake: the Microphone fake')),
    recorderOver({ hear, inputs }),
  );
};
