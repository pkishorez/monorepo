import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { Effect, Layer, Semaphore } from 'effect';
import { Speech, SpeechToText, type Recognizer } from './contract/index.js';
import type { SpeechHost } from './capabilities/index.js';
import { speechOver } from './front/index.js';

/*
 * Speech to Text on Node: the front door (`./front`, ADR 0017) over a
 * SpeechHost on a folder.
 *
 * Everything lives in one folder of the Connection's data folder: the wish,
 * `on`, kept while Speech to Text is switched on, and the model's files in
 * `model/`. Switching off deletes the folder. speech.ts builds the
 * SpeechHost the model stands on from SpeechToText and that folder.
 */

export interface SpeechOptions {
  /** The folder Speech to Text keeps its wish and model in. */
  readonly folder: string;
}

const exists = (path: string) =>
  Effect.promise(() =>
    access(path).then(
      () => true,
      () => false,
    ),
  );

const host = (folder: string) =>
  Effect.gen(function* () {
    const speech = yield* SpeechToText;
    const model = join(folder, 'model');
    const wish = join(folder, 'on');
    // Fetching and deleting never overlap; a fetch stopped by Disable lets go first.
    const disk = yield* Semaphore.make(1);
    const loading = yield* Semaphore.make(1);
    let loaded: Recognizer | undefined;
    const recognizer = loading.withPermits(1)(
      Effect.suspend(() =>
        loaded
          ? Effect.succeed(loaded)
          : Effect.tap(speech.load(model), (made) =>
              Effect.sync(() => {
                loaded = made;
              }),
            ),
      ),
    );
    const service: SpeechHost['Service'] = {
      wished: exists(wish),
      installed: speech.installed(model),
      install: (progress) =>
        Effect.tryPromise({
          try: async () => {
            await mkdir(folder, { recursive: true });
            await writeFile(wish, '');
          },
          catch: () => `Could not write ${wish}`,
        }).pipe(
          Effect.andThen(
            Effect.mapError(
              speech.install(model, progress),
              (error) => error.message,
            ),
          ),
          disk.withPermits(1),
        ),
      transcribe: (samples) =>
        Effect.flatMap(recognizer, (made) => made.transcribe(samples)).pipe(
          Effect.mapError((error) => error.message),
        ),
      remove: Effect.sync(() => {
        loaded = undefined;
      }).pipe(
        Effect.andThen(
          Effect.promise(() => rm(folder, { recursive: true, force: true })),
        ),
        disk.withPermits(1),
      ),
    };
    return service;
  });

const make = (options: SpeechOptions) =>
  Effect.flatMap(host(options.folder), speechOver);

/** `Speech`, run until its Scope closes from the wish and files in `options.folder`. */
export const speechLayer = (
  options: SpeechOptions,
): Layer.Layer<Speech, never, SpeechToText> =>
  Layer.effect(Speech, make(options));
