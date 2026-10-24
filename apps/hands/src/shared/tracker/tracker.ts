import { Context, Data, Schema } from 'effect';
import type { Effect, Stream } from 'effect';
import type { Fired, Options } from '../gestures/index.ts';

/*
 * The Capability the Playground Requires: the camera and the model as one
 * Stream. Running it asks for the camera, loads the model and reads every
 * frame until it is interrupted, which lets the camera go. It says how far
 * it got and every gesture fired; each frame's reading goes straight to
 * the stage, outside the app's Messages, since it changes 30 times a
 * second. Only the browser has it: `src/client/tracker` is the real one.
 */

export const Delegate = Schema.Literals(['GPU', 'CPU']);
export type Delegate = typeof Delegate.Type;

export type Signal =
  | { readonly _tag: 'Loading' }
  | { readonly _tag: 'Ready'; readonly delegate: Delegate }
  | { readonly _tag: 'Fired'; readonly fired: Fired };

export class TrackerError extends Data.TaggedError('TrackerError')<{
  readonly reason: string;
}> {}

export class Tracker extends Context.Service<
  Tracker,
  {
    /** Opens the camera, then the model, then reads frames until interrupted. */
    readonly track: Stream.Stream<Signal, TrackerError>;
    /** How each frame is read from now on. */
    readonly configure: (options: Options) => Effect.Effect<void>;
  }
>()('hands/Tracker') {}
