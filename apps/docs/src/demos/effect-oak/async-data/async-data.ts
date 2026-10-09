import { Effect, Schema } from 'effect';

export { ErrorPanel, LoadingPanel } from './panels.js';

/*
 * Fetched data as plain Model data, Foldkit's AsyncData: Idle, Loading,
 * Failed, Loaded, Refreshing (old data on screen while it loads again) and
 * Stale (a refresh failed, the old data stays). Update decides what to load
 * with the functions below; each returns the next value, or null when nothing
 * should be fetched.
 */

export type AsyncData<A> =
  | { readonly _tag: 'Idle' }
  | { readonly _tag: 'Loading' }
  | { readonly _tag: 'Failed'; readonly error: string }
  | { readonly _tag: 'Loaded'; readonly data: A }
  | { readonly _tag: 'Refreshing'; readonly data: A }
  | { readonly _tag: 'Stale'; readonly data: A; readonly error: string };

/** The Schema of an AsyncData holding `data`. */
const schema = <A extends Schema.Top>(data: A) =>
  Schema.TaggedUnion({
    Idle: {},
    Loading: {},
    Failed: { error: Schema.String },
    Loaded: { data },
    Refreshing: { data },
    Stale: { data, error: Schema.String },
  });

/** The Schema of what a fetch came back with, for the Message that carries it. */
const result = <A extends Schema.Top>(data: A) =>
  Schema.TaggedUnion({ Ok: { data }, Err: { error: Schema.String } });

/** Run a fetch for a Command: it always ends, with the data or the error. */
const attempt = <A, R>(fetch: Effect.Effect<A, string, R>) =>
  fetch.pipe(
    Effect.map((data) => ({ _tag: 'Ok' as const, data })),
    Effect.catch((error) => Effect.succeed({ _tag: 'Err' as const, error })),
  );

const idle = { _tag: 'Idle' } as const;
const loading = { _tag: 'Loading' } as const;

/** The data, if there is any. */
const dataOf = <A>(value: AsyncData<A>): A | undefined =>
  'data' in value ? value.data : undefined;

/** The last error, if the last fetch failed. */
const errorOf = <A>(value: AsyncData<A>): string | undefined =>
  'error' in value ? value.error : undefined;

const isPending = <A>(value: AsyncData<A>) =>
  value._tag === 'Loading' || value._tag === 'Refreshing';

/** Load only if there is nothing, or the last try failed. */
const loadIfMissing = <A>(value: AsyncData<A>): AsyncData<A> | null =>
  value._tag === 'Idle' || value._tag === 'Failed' ? loading : null;

/** Fetch again, keeping what is on screen; nothing while a fetch runs. */
const revalidateOrLoad = <A>(value: AsyncData<A>): AsyncData<A> | null => {
  if (isPending(value)) return null;
  const data = dataOf(value);
  return data === undefined ? loading : { _tag: 'Refreshing', data };
};

/** Fetch again only if there is data to keep on screen. */
const revalidate = <A>(value: AsyncData<A>): AsyncData<A> | null =>
  value._tag === 'Loaded' || value._tag === 'Stale'
    ? { _tag: 'Refreshing', data: value.data }
    : null;

/** A fetch came back: new data, or an error that keeps the old data. */
const settle = <A>(
  value: AsyncData<A>,
  result:
    | { readonly _tag: 'Ok'; readonly data: A }
    | { readonly _tag: 'Err'; readonly error: string },
): AsyncData<A> => {
  if (result._tag === 'Ok') return { _tag: 'Loaded', data: result.data };
  const data = dataOf(value);
  return data === undefined
    ? { _tag: 'Failed', error: result.error }
    : { _tag: 'Stale', data, error: result.error };
};

export const AsyncData = {
  schema,
  result,
  attempt,
  idle,
  loading,
  dataOf,
  errorOf,
  isPending,
  loadIfMissing,
  revalidateOrLoad,
  revalidate,
  settle,
};
