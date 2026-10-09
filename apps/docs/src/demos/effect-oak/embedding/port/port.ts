import { Context, Effect, Layer, Queue, Stream } from 'effect';

/*
 * The wire between the widget and the page it is embedded in: Foldkit's
 * Flags and Ports, built by hand.
 *
 * The host's side is plain functions: set the flags before mounting, push a
 * step in, listen for counts coming out. The widget's side is the Host
 * Service in its Layer: a Lifetime reads the flags and hears the steps, a
 * Command reports each count.
 *
 * `toReact` takes its Layer once, when the app is made, so the wire has to
 * exist before the widget does and outlive each mount: it is one per page.
 */

type Flags = { readonly initialCount: number };

export class Host extends Context.Service<
  Host,
  {
    readonly flags: Effect.Effect<Flags>;
    /** The host's step now, then each new one. */
    readonly steps: Stream.Stream<number>;
    readonly reportCount: (count: number) => Effect.Effect<void>;
  }
>()('docs/embedding/Host') {}

let flags: Flags = { initialCount: 0 };
let step = 1;
const stepListeners = new Set<(step: number) => void>();
const countListeners = new Set<(count: number) => void>();

/** The host's side of the wire. */
export const wire = {
  setFlags: (next: Flags) => {
    flags = next;
  },
  sendStep: (next: number) => {
    step = next;
    for (const listener of stepListeners) listener(next);
  },
  onCount: (listener: (count: number) => void) => {
    countListeners.add(listener);
    return () => {
      countListeners.delete(listener);
    };
  },
};

export const HostLive = Layer.succeed(Host, {
  flags: Effect.sync(() => flags),
  steps: Stream.callback<number>((queue) =>
    Effect.acquireRelease(
      Effect.sync(() => {
        const heard = (next: number) => Queue.offerUnsafe(queue, next);
        heard(step);
        stepListeners.add(heard);
        return heard;
      }),
      (heard) => Effect.sync(() => stepListeners.delete(heard)),
    ),
  ),
  reportCount: (count) =>
    Effect.sync(() => {
      for (const listener of countListeners) listener(count);
    }),
});
