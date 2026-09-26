import * as Effect from 'effect/Effect';
import * as Queue from 'effect/Queue';
import * as Stream from 'effect/Stream';

/**
 * How long a message event is held open after it reaches a subscriber, so
 * the subscriber can still call `event.waitUntil` asynchronously (the
 * platform only allows that while another lifetime promise is pending).
 */
const GRACE_MS = 100;

interface Pending {
  readonly event: ExtendableMessageEvent;
  readonly release: () => void;
}

/**
 * Non-Control-Channel message events for `WorkerHost.messages`. Until the
 * first subscriber arrives, events are buffered and the worker is kept
 * alive; `close()` releases them when no subscriber will ever come.
 */
export const makeMessageHub = (options: { readonly buffer: boolean }) => {
  let pending: Array<Pending> = [];
  let open = options.buffer;
  const subscribers = new Set<(event: ExtendableMessageEvent) => void>();

  const hold = (event: ExtendableMessageEvent): (() => void) => {
    let release = () => {};
    event.waitUntil(new Promise<void>((resolve) => (release = resolve)));
    return () => setTimeout(release, GRACE_MS);
  };

  const deliver = (event: ExtendableMessageEvent, release: () => void) => {
    for (const subscriber of subscribers) subscriber(event);
    release();
  };

  const publish = (event: ExtendableMessageEvent): void => {
    if (subscribers.size > 0) deliver(event, hold(event));
    else if (open) pending.push({ event, release: hold(event) });
  };

  const close = (): void => {
    open = false;
    for (const { release } of pending) release();
    pending = [];
  };

  const messages: Stream.Stream<ExtendableMessageEvent> = Stream.callback(
    (queue) =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const subscriber = (event: ExtendableMessageEvent) => {
            Queue.offerUnsafe(queue, event);
          };
          subscribers.add(subscriber);
          const buffered = pending;
          pending = [];
          for (const { event, release } of buffered) deliver(event, release);
          return subscriber;
        }),
        (subscriber) => Effect.sync(() => subscribers.delete(subscriber)),
      ),
  );

  return { publish, close, messages };
};
