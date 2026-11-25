import { claudeOneShotWith, OneShotPrompt } from '@kestack/ai-toolkit/harness';
import { sherpa, SpeechToText } from '@kestack/ai-toolkit/speech';
import { Context, Effect, Layer } from 'effect';
import { Failed } from './process.ts';

/** Claude, asked one prompt at a time: no tools, nothing kept. */
export class Claude extends Context.Service<
  Claude,
  { readonly ask: (prompt: string) => Effect.Effect<string, Failed> }
>()('ke-video/Claude') {}

/** What a piece of audio says, each word with its start and end in seconds from the piece's start. */
export interface Heard {
  readonly text: string;
  readonly words: ReadonlyArray<{
    readonly text: string;
    readonly start: number;
    readonly end: number;
  }>;
}

/** A speech model loaded, hearing 16 kHz mono samples in [-1, 1]. */
export interface Listener {
  readonly hear: (samples: Float32Array) => Effect.Effect<Heard, Failed>;
}

/** The speech model in a folder: fetched once, then loaded from it. */
export class Ears extends Context.Service<
  Ears,
  {
    readonly installed: (folder: string) => Effect.Effect<boolean>;
    /** Fetches the model into `folder`, reporting how far it is, 0..1, when that is known. */
    readonly install: (
      folder: string,
      progress: (fraction: number | null) => Effect.Effect<void>,
    ) => Effect.Effect<void, Failed>;
    readonly load: (folder: string) => Effect.Effect<Listener, Failed>;
  }
>()('ke-video/Ears') {}

/** Claude Code's one-shot prompts, given up to 15 minutes to answer. */
export const claude: Layer.Layer<Claude> = Layer.effect(
  Claude,
  Effect.gen(function* () {
    const oneShot = yield* OneShotPrompt;
    return {
      ask: (prompt: string) =>
        oneShot.prompt(prompt).pipe(
          Effect.mapError(
            (error) =>
              new Failed({
                message: `Claude did not answer: ${error.message}`,
              }),
          ),
        ),
    };
  }),
).pipe(Layer.provide(claudeOneShotWith({ timeout: '15 minutes' })));

/** Parakeet through sherpa-onnx, from ai-toolkit's Speech to Text. */
export const ears: Layer.Layer<Ears> = Layer.effect(
  Ears,
  Effect.gen(function* () {
    const speech = yield* SpeechToText;
    const failed = (error: { readonly message: string }) =>
      new Failed({ message: error.message });
    return {
      installed: speech.installed,
      install: (folder, progress) =>
        speech
          .install(folder, (fetched) =>
            progress(
              fetched.total === null ? null : fetched.done / fetched.total,
            ),
          )
          .pipe(Effect.mapError(failed)),
      load: (folder) =>
        speech.load(folder).pipe(
          Effect.map((recognizer) => ({
            hear: (samples: Float32Array) =>
              recognizer.hear(samples).pipe(Effect.mapError(failed)),
          })),
          Effect.mapError(failed),
        ),
    };
  }),
).pipe(Layer.provide(sherpa()));
