/**
 * Holds the service worker alive while calls are in flight: every event seen
 * while busy is extended with one shared promise, settled on `release`.
 */
export const makeKeepAlive = () => {
  let held: { promise: Promise<void>; release: () => void } | undefined;
  return {
    extend(event: ExtendableEvent): void {
      if (held === undefined) {
        let release!: () => void;
        const promise = new Promise<void>((resolve) => (release = resolve));
        held = { promise, release };
      }
      try {
        event.waitUntil(held.promise);
      } catch {
        // The event is no longer extendable (InvalidStateError). A later
        // event of the same calls extends the lifetime instead.
      }
    },
    release(): void {
      held?.release();
      held = undefined;
    },
  };
};
