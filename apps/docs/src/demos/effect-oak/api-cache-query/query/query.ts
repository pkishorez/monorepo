import { Effect, Schema, Stream } from 'effect';
import type { Context } from 'effect';
import { Node } from 'effect-oak';
import { AsyncData } from '../../async-data/index.js';
import { Order, Orders } from './orders.js';

type Order = typeof Order.Type;

/*
 * Foldkit's Query.define as a Node factory: one fetch, and everything it ever
 * fetched, by key, as AsyncData. A Query with no arguments uses the key ''.
 *
 * The parent decides when to load, through Orders. The Query's own View may
 * retry or refresh it directly, and may report a choice the user made in it
 * (a clicked row) through `choose`, a Command the app writes: usually a
 * Request to the parent.
 */

type Requires = Readonly<Record<string, Context.Key<any, any>>>;
type IdsOf<R extends Requires> = {
  [K in keyof R]: R[K] extends Context.Key<infer I, any> ? I : never;
}[keyof R];

export { Orders, OrdersLive } from './orders.js';

/** Post an Order to the Query with this name, from a parent's Command. */
export const tell = (query: string, order: Order) =>
  Effect.gen(function* () {
    yield* (yield* Orders).tell(query, order);
  });

export const makeQuery = <
  const Name extends string,
  A extends Schema.Top,
  R extends Requires,
>(options: {
  readonly name: Name;
  readonly data: A;
  readonly requires: R;
  readonly fetch: (key: string) => Effect.Effect<A['Type'], string, IdsOf<R>>;
  readonly choose?: (value: string) => Effect.Effect<void, never, IdsOf<R>>;
}) => {
  const fetch = (key: string) =>
    Effect.map(AsyncData.attempt(options.fetch(key)), (result) => ({
      _tag: 'Settled' as const,
      key,
      result,
    }));

  const Entry = AsyncData.schema(options.data);
  type Entry = AsyncData<A['Type']>;
  const Model = Schema.Struct({
    entries: Schema.Record(Schema.String, Entry),
    /** The key last ordered: the one the View shows. */
    focus: Schema.String,
  });
  type Model = {
    readonly entries: Record<string, Entry>;
    readonly focus: string;
  };

  /** Move one entry on, and fetch it if it moved. */
  const step = (
    model: Model,
    key: string,
    next: (entry: Entry) => Entry | null,
  ) => {
    const entry = next(model.entries[key] ?? AsyncData.idle);
    return entry
      ? {
          model: { ...model, entries: { ...model.entries, [key]: entry } },
          commands: [fetch(key)],
        }
      : {};
  };

  const ORDERS = {
    LoadIfMissing: AsyncData.loadIfMissing,
    Refresh: AsyncData.revalidateOrLoad,
    Revalidate: AsyncData.revalidate,
  } as const;

  return Node.make(`Query(${options.name})`, {
    requires: { orders: Orders, ...options.requires },
    model: Model as unknown as Schema.Schema<Model>,
    message: Schema.TaggedUnion({
      Ordered: { order: Order },
      ClickedRetry: { key: Schema.String },
      ClickedRefresh: { key: Schema.String },
      Chose: { value: Schema.String },
      Settled: {
        key: Schema.String,
        result: AsyncData.result(options.data),
      },
    }),
  }).build({
    init: () => ({ model: { entries: {}, focus: '' } }),
    // TypeScript cannot see that Orders is among `{ orders } & R`'s Services
    // while R is generic, so the Lifetime's needs are cast away here.
    lifetime: () =>
      Stream.unwrap(
        Effect.gen(function* () {
          return (yield* Orders).heard(options.name);
        }),
      ).pipe(
        Stream.map((order) => ({ _tag: 'Ordered' as const, order })),
      ) as Stream.Stream<{ readonly _tag: 'Ordered'; readonly order: Order }>,
    update: {
      Ordered: ({ order: { _tag, key } }, { model }) =>
        step({ ...model, focus: key }, key, ORDERS[_tag]),
      ClickedRetry: ({ key }, { model }) =>
        step(model, key, AsyncData.revalidateOrLoad),
      ClickedRefresh: ({ key }, { model }) =>
        step(model, key, AsyncData.revalidateOrLoad),
      Chose: ({ value }) =>
        options.choose ? { commands: [options.choose(value)] } : {},
      Settled: ({ key, result }, { model }) => ({
        model: {
          ...model,
          entries: {
            ...model.entries,
            [key]: AsyncData.settle(
              model.entries[key] ?? AsyncData.loading,
              result as never,
            ),
          },
        },
      }),
    },
  });
};
