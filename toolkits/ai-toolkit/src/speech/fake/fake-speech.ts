import { Deferred, Effect, Layer } from 'effect';
import { SpeechToText, SpeechToTextError } from '../contract/index.js';

/*
 * Speech to Text for tests. Its model is one small file, fetched in two
 * halves of 50 bytes; held, the fetch stops at the first half until
 * `release()`. A failure queued with `failNext` fails the next fetch at
 * that half. A loaded model hears how many samples it was given:
 * `heard <n> samples`. The folders a fetch filled are kept in memory, so
 * it runs in a browser too.
 */

/** The bytes the fake model is. */
export const FAKE_MODEL_BYTES = 100;

export interface FakeSpeech {
  readonly layer: Layer.Layer<SpeechToText>;
  /** Fetches started, and models loaded. */
  readonly installs: () => number;
  readonly loads: () => number;
  /** Fails the next fetch with `message`. */
  readonly failNext: (message: string) => void;
  /** Stops each fetch after its first half until `release()`. */
  readonly hold: () => void;
  readonly release: () => void;
}

export const makeFakeSpeech = (): FakeSpeech => {
  const failures: Array<string> = [];
  let gate: Deferred.Deferred<void> | undefined;
  let installs = 0;
  let loads = 0;
  /** The folders a fetch filled. */
  const filled = new Set<string>();
  const speech = Layer.succeed(SpeechToText, {
    installed: (folder) => Effect.sync(() => filled.has(folder)),
    install: (folder, progress) =>
      Effect.gen(function* () {
        installs++;
        const total = FAKE_MODEL_BYTES;
        yield* progress({ done: 0, total });
        yield* progress({ done: total / 2, total });
        if (gate) yield* Deferred.await(gate);
        const failure = failures.shift();
        if (failure !== undefined)
          return yield* new SpeechToTextError({ message: failure });
        filled.add(folder);
        yield* progress({ done: total, total });
      }),
    load: () =>
      Effect.sync(() => {
        loads++;
        return {
          transcribe: (samples) =>
            Effect.succeed(`heard ${samples.length} samples`),
        };
      }),
  });
  const layer = Layer.merge(
    speech,
    // The mark every fake carries: a production build that has it fails.
    Layer.effectDiscard(Effect.logDebug('kestack-fake: the fake Speech')),
  );
  return {
    layer,
    installs: () => installs,
    loads: () => loads,
    failNext: (message) => void failures.push(message),
    hold: () => {
      gate = Deferred.makeUnsafe<void>();
    },
    release: () => {
      if (gate) Deferred.doneUnsafe(gate, Effect.void);
      gate = undefined;
    },
  };
};
