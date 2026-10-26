import { Context, Effect, Layer, Queue, Schema, Stream } from 'effect';
import type { History } from '@kestack/kabuki';
import type { AppRuntime } from '@kestack/kabuki/react';

/*
 * The app the tool inspects: code, by the History its last mount left
 * under its name. Kabuki keeps every app's History on `globalThis` for hot
 * reloads, and the tool reads it there, as code outside the app; a real
 * DevTools would be handed it.
 *
 * 1. Steps    the History's Branch as the tool's Actors keep it: who sent
 *             what to whom, small enough to hold in a Model.
 * 2. Read     the Capability, for the Actors: the Steps, now and after
 *             each change.
 * 3. History  the History itself, for the Views: a Step's Snapshot is
 *             played from it as it is drawn, never kept in a Model. And
 *             code's Runtime, handed over by the page it runs in, for
 *             what each Instance provides now.
 */

/** The name code's app runs under: its root, Start's Router. */
const HOST = 'Router';

// 1. Steps
export const Step = Schema.Struct({
  id: Schema.Number,
  parent: Schema.NullOr(Schema.Number),
  /** The Message's tag. */
  message: Schema.String,
  /** The Instance it was for. */
  destination: Schema.String,
  /** What sent it: a View, a Worker, a Command, a Provide, outside, a Restore. */
  source: Schema.String,
});
export type Step = typeof Step.Type;

// 3. History
/** code's History, if it has run in this tab. */
export const hostHistory = (): History | undefined => {
  const apps = (
    globalThis as {
      readonly [key: symbol]:
        | ReadonlyMap<string, { readonly history: History }>
        | undefined;
    }
  )[Symbol.for('@kestack/kabuki/apps')];
  return apps?.get(HOST)?.history;
};

let running: AppRuntime | null = null;

/** Hands the tool code's Runtime, as the page it is drawn in reads it. */
export const attach = (runtime: AppRuntime | null) => {
  running = runtime;
};

/** The Capability keys an Instance of code provides now: none while code is not running. */
export const providedBy = (id: string) =>
  running?.provided(id) ?? { top: [], state: [] };

const stepsOf = (history: History | undefined): ReadonlyArray<Step> =>
  (history?.branch() ?? []).map((entry) => ({
    id: entry.id,
    parent: entry.parent,
    message: entry.message._tag,
    destination: entry.destination,
    source: entry.source.kind,
  }));

// 2. Read
export class Inspected extends Context.Service<
  Inspected,
  {
    /** code's Steps now, then after every change to its History. */
    readonly steps: Stream.Stream<ReadonlyArray<Step>>;
  }
>()('code/kabuki/Inspected') {}

export const inspected = Layer.succeed(Inspected, {
  steps: Stream.callback<ReadonlyArray<Step>>(
    (queue) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const history = hostHistory();
          Queue.offerUnsafe(queue, stepsOf(history));
          return (
            history?.subscribe(() =>
              Queue.offerUnsafe(queue, stepsOf(history)),
            ) ?? (() => {})
          );
        }),
        (unsubscribe) => Effect.sync(unsubscribe),
      ),
    { bufferSize: 1, strategy: 'sliding' },
  ),
});
