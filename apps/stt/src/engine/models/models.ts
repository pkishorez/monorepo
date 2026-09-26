/**
 * Every speech model the demo offers, from every engine. An engine is a
 * folder here filling in the contract in engine.ts; it plugs in through the
 * list below and nowhere else, so dropping one leaves the rest working.
 */
import { Effect, Stream } from 'effect';
import {
  EngineError,
  type Loading,
  type ModelCache,
  type SpeechEngine,
} from './engine.ts';
import { deleteLegacyStores } from './legacy.ts';
import { parakeetEngine } from './parakeet/index.ts';
import { whisperEngine } from './whisper/index.ts';

export { EngineError };
export type { Loading, ModelCache };

const engines: ReadonlyArray<SpeechEngine> = [whisperEngine, parakeetEngine];

/** The models in the order the picker shows them. */
export const speechModels = engines.flatMap((engine) => engine.models);

const engineOf = (model: string): Effect.Effect<SpeechEngine, EngineError> => {
  const engine = engines.find((entry) =>
    entry.models.some((candidate) => candidate.id === model),
  );
  return engine
    ? Effect.succeed(engine)
    : Effect.fail(
        new EngineError({ message: `No speech engine offers ${model}.` }),
      );
};

/** Downloads and warms up a model: download states, then the loaded model once. */
export const loadSpeechModel = (
  model: string,
): Stream.Stream<Loading, EngineError> =>
  Stream.unwrap(Effect.map(engineOf(model), (engine) => engine.load(model)));

/**
 * What the browser holds of each model. Stores from before the shared
 * downloader are deleted first.
 */
export const readModelCaches: Effect.Effect<ReadonlyMap<string, ModelCache>> =
  Effect.gen(function* () {
    yield* deleteLegacyStores;
    const states = yield* Effect.forEach(
      engines.flatMap((engine) =>
        engine.models.map((model) =>
          engine
            .readCache(model.id)
            .pipe(Effect.map((state) => [model.id, state] as const)),
        ),
      ),
      (read) => read,
      { concurrency: 'unbounded' },
    );
    return new Map(states);
  });

/** Deletes the model's files, so the next load downloads it again. */
export const clearModelCache = (
  model: string,
): Effect.Effect<void, EngineError> =>
  Effect.flatMap(engineOf(model), (engine) => engine.clearCache(model));
