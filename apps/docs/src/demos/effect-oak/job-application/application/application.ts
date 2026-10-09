import { Context, Effect, Layer, Queue, Stream } from 'effect';
import type { Part } from './parts.js';

/*
 * What the application and its steps share: the steps, the Parts the steps
 * report, and the two ways they talk.
 *
 * - Up, through Answers: a Request the application Provides. Every change in
 *   a step reports its whole Part, so the application always has the latest
 *   answers for its nav, preview, review and submit.
 * - Down, through Reveals: a Service in the app's Layer. Effect Oak has no
 *   way for a parent to send its Child a Message (blocker 14), so pressing
 *   Submit posts a reveal there, and each step's Lifetime hears it and sends
 *   `RevealedErrors` to its own Node. Both Messages are in the Log, so
 *   Replay needs neither Service.
 */

/** Provided by the application: where steps report their Parts. */
export class Answers extends Context.Service<
  Answers,
  { readonly report: (part: Part) => void }
>()('docs/job-application/Answers') {}

/** In the app's Layer: tells every step to show all its errors. */
export class Reveals extends Context.Service<
  Reveals,
  {
    readonly reveal: Effect.Effect<void>;
    readonly heard: Stream.Stream<void>;
  }
>()('docs/job-application/Reveals') {}

export const RevealsLive = Layer.sync(Reveals, () => {
  const listeners = new Set<() => void>();
  return {
    reveal: Effect.sync(() => listeners.forEach((listener) => listener())),
    heard: Stream.callback<void>((queue) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const listener = () => Queue.offerUnsafe(queue, undefined);
          listeners.add(listener);
          return listener;
        }),
        (listener) => Effect.sync(() => listeners.delete(listener)),
      ),
    ),
  };
});

/** A step's Command: hand the application this step's latest Part. */
export const report = (part: Part) =>
  Effect.gen(function* () {
    (yield* Answers).report(part);
  });

/** The application's Command: every step shows all its errors. */
export const revealAll = Effect.gen(function* () {
  yield* (yield* Reveals).reveal;
});

/** A step's Lifetime: each reveal, as the step's own Message. */
export const heardReveal = Stream.unwrap(
  Effect.gen(function* () {
    return (yield* Reveals).heard;
  }),
).pipe(Stream.map(() => ({ _tag: 'RevealedErrors' as const })));

export { blankSheet, FileInfo, Part, Sheet } from './parts.js';
export { STEPS, Step, stepAfter, stepLabel } from './steps.js';
export { employmentRange, fileSize, pluralize } from './format.js';
