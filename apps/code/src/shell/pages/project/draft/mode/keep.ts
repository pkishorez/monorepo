import { Effect, Queue, Stream } from 'effect';

/*
 * When a part of the Draft is kept in its Saved Draft, whoever owns the
 * part: the Draft its mode open, files and picks, a Draft Mode its text.
 * A quarter of a second after the last change, and at once as the page is
 * hidden or left and as the owner goes. Each write is stamped as it reads
 * what it keeps, so a write older than one already made is dropped.
 */

/** How long after the last change a part is kept, in ms. */
const SETTLE = 250;

let clock = 0;

/** A stamp for a write, later than any before it in this tab. */
const stamp = Effect.sync(() => ++clock);

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

/** What an owner counts: its changes to keep, and how many are kept. */
interface Counted {
  readonly model: { readonly changes: number; readonly kept: number };
}

/** The part of an owner's Self the workers use. */
interface Keeper<D> {
  readonly get: Effect.Effect<D>;
  readonly send: (message: {
    readonly _tag: 'Kept';
    readonly changes: number;
  }) => Effect.Effect<void>;
}

/**
 * An owner's two Keep Workers: `save`, a quarter of a second after each
 * change; `flush`, as the page is hidden or left and as the owner goes.
 * `unkept` says whether there is a change to keep now; `keep` keeps it,
 * stamped. Each Sends `Kept` with the changes it kept.
 */
export const keeping = <D extends Counted, R>(
  unkept: (data: D) => boolean,
  keep: (data: D, at: number) => Effect.Effect<void, never, R>,
) => {
  const kept = (self: Keeper<D>) =>
    Effect.gen(function* () {
      const data = yield* self.get;
      if (!unkept(data)) return null;
      yield* keep(data, yield* stamp);
      return data.model.changes;
    });
  return {
    save: {
      each: (data: D) => (unkept(data) ? [String(data.model.changes)] : []),
      run: (self: Keeper<D>) =>
        Effect.gen(function* () {
          yield* Effect.sleep(SETTLE);
          const changes = yield* kept(self);
          if (changes !== null) yield* self.send({ _tag: 'Kept', changes });
        }),
    },
    flush: {
      run: (self: Keeper<D>) =>
        Effect.addFinalizer(() => kept(self)).pipe(
          Effect.andThen(
            Stream.runForEach(leaving, () =>
              Effect.flatMap(kept(self), (changes) =>
                changes === null
                  ? Effect.void
                  : self.send({ _tag: 'Kept', changes }),
              ),
            ),
          ),
        ),
    },
  };
};
