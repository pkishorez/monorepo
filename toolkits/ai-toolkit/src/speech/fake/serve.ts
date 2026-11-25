import { Effect, Layer } from 'effect';
import type { Runtime } from '@kestack/kabuki';
import { Speech } from '../contract/index.js';
import type { SpeechHost } from '../capabilities/index.js';
import { speechOver } from '../front/index.js';
import type { SpeechFake, SpeechMessage, SpeechModel } from './actor.js';

/*
 * `Speech` over the running Speech fake: the real speech model and Takes
 * (`../front`) on a SpeechHost that reads and writes the fake's Model, so
 * enabling, downloading, hearing and Takes are the real code's.
 *
 * 1. Disk      the wish and the model's files are the Model's `wished` and
 *              `installed`; removing them is a Message.
 * 2. Download  starts as soon as it is asked for, and runs by itself to the
 *              end a tenth at a time, telling its progress as it goes.
 * 3. Hearing   reads the Model each time: its text, else a plain sentence.
 */

/** How big the fake model is, in bytes: about Parakeet's. */
export const SPEECH_MODEL_BYTES = 480 * 1024 * 1024;

/** What a Take turns into unless told. */
export const HEARD_TEXT =
  'Add a dark mode toggle to the settings page, and keep the choice across reloads.';

/** How long a download waits between two tenths, in ms. */
const STEP_MS = 150;

export const speechFakeOver = (
  runtime: Runtime<typeof SpeechFake>,
): Layer.Layer<Speech> =>
  Layer.merge(
    // The mark every fake carries: a production build that has it fails.
    Layer.effectDiscard(Effect.logDebug('kestack-fake: the Speech fake')),
    Layer.effect(
      Speech,
      Effect.gen(function* () {
        const root = runtime.root;
        const model = (): SpeechModel => root.model;
        const send = (message: SpeechMessage) =>
          Effect.sync(() => void root.send(message));

        // 2. Download
        const install: SpeechHost['Service']['install'] = (progress) =>
          Effect.gen(function* () {
            const total = SPEECH_MODEL_BYTES;
            yield* send({ _tag: 'Wished' });
            yield* send({ _tag: 'DownloadStarted', total });
            yield* progress({ done: 0, total });
            for (let done = 0; done < total;) {
              yield* Effect.sleep(STEP_MS);
              done = Math.min(total, done + Math.ceil(total / 10));
              yield* send({ _tag: 'Progressed', done });
              yield* progress({ done, total });
            }
            yield* send({ _tag: 'Downloaded' });
          }).pipe(Effect.onInterrupt(() => send({ _tag: 'DownloadLetGo' })));

        // 3. Hearing
        const transcribe = () =>
          Effect.andThen(
            send({ _tag: 'Heard' }),
            Effect.sync(() => model().hearing || HEARD_TEXT),
          );

        // 1. Disk
        return yield* speechOver({
          wished: Effect.sync(() => model().wished),
          installed: Effect.sync(() => model().installed),
          install,
          transcribe,
          remove: send({ _tag: 'Removed' }),
        });
      }),
    ),
  );
