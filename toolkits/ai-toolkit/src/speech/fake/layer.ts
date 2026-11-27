import { Effect, Layer, SubscriptionRef } from 'effect';
import { Speech } from '../contract/index.js';
import type { SpeechHost } from '../capabilities/index.js';
import { speechOver } from '../front/index.js';
import type { SpeechState } from './speech.js';

/*
 * `Speech` over the Speech fake's state: the real speech model and Takes
 * (`../front`) on a SpeechHost that reads and writes it, so enabling,
 * downloading, hearing and Takes are the real code's.
 *
 * 1. Disk      the wish and the model's files are the state's `wished` and
 *              `installed`; removing them clears both.
 * 2. Download  starts as soon as it is asked for, and runs by itself to the
 *              end a tenth at a time, telling its progress as it goes.
 * 3. Hearing   reads the state each time: its text, else a plain sentence.
 */

/** How big the fake model is, in bytes: about Parakeet's. */
export const SPEECH_MODEL_BYTES = 480 * 1024 * 1024;

/** What a Take turns into unless told. */
export const HEARD_TEXT =
  'Add a dark mode toggle to the settings page, and keep the choice across reloads.';

/** How long a download waits between two tenths, in ms. */
const STEP_MS = 150;

export const speechFakeOver = (
  state: SubscriptionRef.SubscriptionRef<SpeechState>,
): Layer.Layer<Speech> =>
  Layer.merge(
    // The mark every fake carries: a production build that has it fails.
    Layer.effectDiscard(Effect.logDebug('kestack-fake: the Speech fake')),
    Layer.effect(
      Speech,
      Effect.gen(function* () {
        const read = SubscriptionRef.get(state);
        const change = (to: Partial<SpeechState>) =>
          SubscriptionRef.update(state, (s) => ({ ...s, ...to }));

        // 2. Download
        const install: SpeechHost['Service']['install'] = (progress) =>
          Effect.gen(function* () {
            const total = SPEECH_MODEL_BYTES;
            yield* change({ wished: true });
            yield* progress({ done: 0, total });
            for (let done = 0; done < total;) {
              yield* Effect.sleep(STEP_MS);
              done = Math.min(total, done + Math.ceil(total / 10));
              yield* progress({ done, total });
            }
            yield* change({ installed: true });
          });

        // 3. Hearing
        const transcribe = () =>
          Effect.map(read, ({ hearing }) => hearing || HEARD_TEXT);

        // 1. Disk
        return yield* speechOver({
          wished: Effect.map(read, ({ wished }) => wished),
          installed: Effect.map(read, ({ installed }) => installed),
          install,
          transcribe,
          remove: change({ wished: false, installed: false }),
        });
      }),
    ),
  );
