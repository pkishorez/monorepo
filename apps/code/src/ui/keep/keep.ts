import { Effect, Queue, Stream } from 'effect';

/*
 * When something written in the page is kept: a quarter of a second after
 * the last change, at once as the page is hidden or left, and once more
 * as the one keeping it goes. Each keep runs after the one before ends.
 */

/** How long after the last change it is kept, in ms. */
const SETTLE = 250;

/**
 * Once each time the page is hidden or left, as the browser says: a tab
 * switched away from, the app put in the background, a reload. None
 * outside a browser.
 */
const leaving: Stream.Stream<void> =
  typeof document === 'undefined'
    ? Stream.never
    : Stream.callback<void>((queue) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const hidden = () => {
              if (document.visibilityState === 'hidden')
                Queue.offerUnsafe(queue, undefined);
            };
            const left = () => Queue.offerUnsafe(queue, undefined);
            document.addEventListener('visibilitychange', hidden);
            window.addEventListener('pagehide', left);
            return () => {
              document.removeEventListener('visibilitychange', hidden);
              window.removeEventListener('pagehide', left);
            };
          }),
          (stop) => Effect.sync(stop),
        ),
      );

/** Runs `keep` after `changes` settle, as the page is hidden or left, and as it is stopped. */
export const keeping = <R>(
  changes: Stream.Stream<unknown>,
  keep: Effect.Effect<void, never, R>,
): Effect.Effect<void, never, R> =>
  Stream.merge(Stream.debounce(changes, SETTLE), leaving).pipe(
    Stream.runForEach(() => keep),
    Effect.ensuring(keep),
  );
