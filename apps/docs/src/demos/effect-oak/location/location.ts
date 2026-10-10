import { Context, Effect, Layer, Queue, Stream } from 'effect';

export { Link } from './link.js';

/*
 * The demo's own address, as a Capability: Effect Oak has no router, and the
 * docs app's router owns the page's path. So each routing demo keeps its
 * route after the `#` (`/demos/effect-oak/routing#/people/3`), which the
 * docs router never reads.
 *
 * `push` adds a history entry, `replace` does not, and the back and forward
 * buttons are heard. An Actor hears the address with a Lifetime made by
 * `heardUrl`, and asks to move with a Command calling `push`.
 */

export class Location extends Context.Service<
  Location,
  {
    /** The path now, `/` when there is none. */
    readonly now: Effect.Effect<string>;
    /** Every later path: pushed, replaced, or reached with back and forward. */
    readonly changes: Stream.Stream<string>;
    readonly push: (path: string) => Effect.Effect<void>;
    readonly replace: (path: string) => Effect.Effect<void>;
  }
>()('docs/location/Location') {}

const pathNow = () => window.location.hash.slice(1) || '/';

const hrefFor = (path: string) =>
  `${window.location.pathname}${window.location.search}#${path}`;

/*
 * The docs app's router (TanStack) numbers its history entries and reads the
 * number back on back and forward, so a pushed entry carries the next one.
 */
const nextEntry = () => {
  const state = (window.history.state ?? {}) as { __TSR_index?: number };
  const key = Math.random().toString(36).slice(2, 10);
  return { __TSR_index: (state.__TSR_index ?? 0) + 1, key, __TSR_key: key };
};

/*
 * Built on plain listeners rather than a SubscriptionRef: in effect 4.0.0 a
 * Stream of a SubscriptionRef's changes ends in a `Done` failure when it is
 * interrupted, which the Runtime logs on every Transition.
 */
export const HashLocation = Layer.effect(
  Location,
  Effect.gen(function* () {
    const listeners = new Set<(path: string) => void>();
    const tell = () => {
      for (const listener of listeners) listener(pathNow());
    };
    yield* Effect.acquireRelease(
      Effect.sync(() => window.addEventListener('popstate', tell)),
      () => Effect.sync(() => window.removeEventListener('popstate', tell)),
    );
    const write = (push: boolean) => (next: string) =>
      Effect.sync(() => {
        if (next === pathNow()) return;
        if (push) window.history.pushState(nextEntry(), '', hrefFor(next));
        else
          window.history.replaceState(window.history.state, '', hrefFor(next));
        tell();
      });
    return {
      now: Effect.sync(pathNow),
      changes: Stream.callback<string>((queue) =>
        Effect.acquireRelease(
          Effect.sync(() => {
            const heard = (path: string) => Queue.offerUnsafe(queue, path);
            listeners.add(heard);
            return heard;
          }),
          (heard) => Effect.sync(() => listeners.delete(heard)),
        ),
      ),
      push: write(true),
      replace: write(false),
    };
  }),
);

/**
 * A Lifetime's Stream of `ChangedUrl` Messages. With `seen`, the path the
 * Actor already shows, it sends each later path that differs from the last
 * one sent; with `null` it starts with the path now.
 *
 * A Lifetime starts once, with the Model it entered its State with, so the
 * Actor passes the path it was entered with and the Stream remembers the rest.
 */
export const heardUrl = (seen: string | null) =>
  Stream.unwrap(
    Effect.gen(function* () {
      const location = yield* Location;
      const paths =
        seen === null
          ? Stream.concat(Stream.fromEffect(location.now), location.changes)
          : location.changes;
      let last = seen;
      return paths.pipe(
        Stream.filter((path) => {
          if (path === last) return false;
          last = path;
          return true;
        }),
      );
    }),
  ).pipe(Stream.map((path) => ({ _tag: 'ChangedUrl' as const, path })));

/** A Command moving the demo to `path`, with a history entry. */
export const pushUrl = (path: string) =>
  Effect.gen(function* () {
    yield* (yield* Location).push(path);
  });

/** The path and query of a demo path, read like a URL. */
export const readPath = (path: string) => {
  const url = new URL(path, 'https://demo.invalid');
  return {
    segments: url.pathname
      .split('/')
      .filter((segment) => segment !== '')
      .map(decodeURIComponent),
    query: url.searchParams,
  };
};
