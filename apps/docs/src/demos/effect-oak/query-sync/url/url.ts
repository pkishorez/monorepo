import { Context, Effect, Layer, Stream, SubscriptionRef } from 'effect';

/*
 * The page's query string as a Capability: Effect Oak has no router, so the URL
 * is outside the tree like any other resource. `query` gives the query string
 * now and at every change; `replace` sets some parameters and drops empty
 * ones, without a new history entry, as Foldkit's `replaceUrl` does. The
 * back and forward buttons are heard too.
 */

export class Url extends Context.Service<
  Url,
  {
    readonly query: Stream.Stream<string>;
    readonly replace: (
      params: Readonly<Record<string, string>>,
    ) => Effect.Effect<void>;
  }
>()('docs/query-sync/Url') {}

const withParams = (
  query: string,
  params: Readonly<Record<string, string>>,
) => {
  const next = new URLSearchParams(query);
  for (const [name, value] of Object.entries(params)) {
    if (value === '') next.delete(name);
    else next.set(name, value);
  }
  const text = next.toString();
  return text === '' ? '' : `?${text}`;
};

export const BrowserUrl = Layer.effect(
  Url,
  Effect.gen(function* () {
    const query = yield* SubscriptionRef.make(window.location.search);
    yield* Effect.acquireRelease(
      Effect.sync(() => {
        const heard = () =>
          Effect.runSync(SubscriptionRef.set(query, window.location.search));
        window.addEventListener('popstate', heard);
        return heard;
      }),
      (heard) =>
        Effect.sync(() => window.removeEventListener('popstate', heard)),
    );
    return {
      query: SubscriptionRef.changes(query),
      replace: (params) =>
        Effect.gen(function* () {
          const next = withParams(window.location.search, params);
          if (next === window.location.search) return;
          window.history.replaceState(
            window.history.state,
            '',
            `${window.location.pathname}${next}`,
          );
          yield* SubscriptionRef.set(query, next);
        }),
    };
  }),
);
