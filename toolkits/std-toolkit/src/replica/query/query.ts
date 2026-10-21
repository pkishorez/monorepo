import {
  createLiveQueryCollection,
  type ChangeMessage,
  type InitialQueryBuilder,
  type QueryBuilder,
  type QueryResult,
} from '@tanstack/db';
import { Actor } from '@kestack/kabuki';
import type { ActorType } from '@kestack/kabuki';
import { Effect, Queue, Schema, Stream } from 'effect';
import type { Scope } from 'effect';
import { Holding } from '../replicas/index.js';
import {
  applied,
  empty,
  MessageSchema,
  ModelSchema,
  type Entry,
  type Message,
  type Model,
} from './model.js';

/*
 * A Query: an actor whose Model is rows from the Collections of any
 * Instances, joins included. Its Props say which Instances: `from` gets
 * them, and holds them for as long as the Props stay; `query` is a TanStack
 * DB query over their Collections.
 *
 * 1. Open     new Props clear the rows shown, before any new row shows.
 * 2. Load     `from`, then the query's rows, as one Message.
 * 3. Follow   every change after, as a Message of only what changed,
 *             until an Instance it reads stops under it, as the Store
 *             removing it does: then it fails.
 */

/** What `from` gives: Instances, by any names the query reads them under. */
type Instances = Readonly<
  Record<
    string,
    { readonly name: string; readonly stopped: Effect.Effect<void> }
  >
>;

type QueryActor<Name extends string, P, Row, R> = ActorType<
  Name,
  void,
  P,
  Model<Row>,
  { readonly _tag: 'Single' },
  Message<Row>,
  { readonly Single: {} },
  Exclude<R, Scope.Scope>
>;

const messageOf = (cause: unknown) =>
  cause instanceof Error ? cause.message : String(cause);

const entriesOf = <Row>(
  changes: ReadonlyArray<ChangeMessage<object, string | number>>,
) => {
  const added: Entry<Row>[] = [];
  const updated: Entry<Row>[] = [];
  const removed: (string | number)[] = [];
  for (const change of changes) {
    const entry = { id: change.key, row: change.value as Row };
    if (change.type === 'insert') added.push(entry);
    else if (change.type === 'update') updated.push(entry);
    else removed.push(change.key);
  }
  return { added, updated, removed };
};

const define = <
  const Name extends string,
  P,
  I extends Instances,
  E,
  R,
  TQuery extends QueryBuilder<any>,
>(
  name: Name,
  options: {
    readonly props: Schema.Codec<P, unknown, never, never>;
    /** The Instances the rows come from, for these Props: `Effect.all({ pocket: Pocket.get(props.account) })`. */
    readonly from: (data: { readonly props: P }) => Effect.Effect<I, E, R>;
    readonly query: (
      data: { readonly props: P },
      instances: I,
    ) => (q: InitialQueryBuilder) => TQuery;
  },
): QueryActor<Name, P, QueryResult<TQuery>, R> => {
  type Row = QueryResult<TQuery>;
  const encodeProps = Schema.encodeSync(options.props);
  // `from` needs what the app gives it, `R`, which the actor's type carries
  // up; Kabuki checks a Worker against the Capabilities listed, and `R` is
  // only a type, so it is read here as needing nothing.
  const from = options.from as (data: {
    readonly props: P;
  }) => Effect.Effect<I, E, Scope.Scope>;

  const actor = Actor.build(
    Actor.define(name, {
      props: options.props,
      model: ModelSchema,
      message: MessageSchema,
    }),
    {
      init: () => ({ model: empty }),
      workers: {
        // One Worker per Props: new Props stop the old one, and let go of
        // its Instances, before the next starts.
        read: {
          each: ({ props }) => [JSON.stringify(encodeProps(props))],
          run: (self) =>
            Effect.gen(function* () {
              // 1. Open
              yield* self.send({ _tag: 'Opened' });
              const { props } = yield* self.get;

              // 2. Load
              const instances = yield* from({ props }).pipe(
                Effect.provideService(Holding, {
                  holder: self.id,
                  action: false,
                }),
              );
              const read = Object.values(instances);
              const live = createLiveQueryCollection({
                query: options.query({ props }, instances) as (
                  q: InitialQueryBuilder,
                ) => QueryBuilder<any>,
                startSync: true,
                gcTime: 0,
              });
              yield* Effect.addFinalizer(() =>
                Effect.promise(() => live.cleanup()),
              );
              yield* Effect.promise(() => live.preload());

              // 3. Follow: what it holds now, then every change after. A
              // subscription is told of a row's update or removal only once
              // it was given the row, so it starts from what it holds.
              const changes =
                yield* Queue.unbounded<
                  ReadonlyArray<ChangeMessage<object, string | number>>
                >();
              let initial: Array<
                ChangeMessage<object, string | number>
              > | null = [];
              const subscription = live.subscribeChanges(
                (batch) => {
                  if (initial) initial.push(...batch);
                  else Queue.offerUnsafe(changes, batch);
                },
                { includeInitialState: true },
              );
              const rows = entriesOf<Row>(initial).added;
              initial = null;
              yield* Effect.addFinalizer(() =>
                Effect.sync(() => subscription.unsubscribe()),
              );
              yield* self.send({
                _tag: 'Loaded',
                keys: read.map(({ name }) => name),
                rows,
              });
              const follow = Stream.fromQueue(changes).pipe(
                Stream.map((batch) => entriesOf<Row>(batch)),
                Stream.filter(
                  ({ added, updated, removed }) =>
                    added.length + updated.length + removed.length > 0,
                ),
                Stream.runForEach((change) =>
                  self.send({ _tag: 'Changed', ...change }),
                ),
              );
              const stopped = (
                read.length === 0
                  ? Effect.never
                  : Effect.raceAll(
                      read.map((instance) =>
                        Effect.as(instance.stopped, instance.name),
                      ),
                    )
              ).pipe(
                Effect.flatMap((stopped) =>
                  self.send({
                    _tag: 'Failed',
                    message: `Instance ${stopped} stopped`,
                  }),
                ),
              );
              yield* Effect.raceFirst(follow, stopped);
            }).pipe(
              Effect.catch((cause) =>
                self.send({ _tag: 'Failed', message: messageOf(cause) }),
              ),
            ),
        },
      },
      on: {
        Opened: () => ({ model: empty }),
        Loaded: ({ keys, rows }) => ({
          model: { keys, rows, status: 'ready', problem: null },
        }),
        Changed: (change, { model }) => ({
          model: { ...model, rows: applied(model.rows, change) },
        }),
        Failed: ({ message }, { model }) => ({
          model: { ...model, rows: [], status: 'failed', problem: message },
        }),
      },
    },
  );
  // Its Schemas check rows as unknown; its type says what they are.
  return actor as unknown as QueryActor<Name, P, Row, R>;
};

/** A reader of rows from Collections of any Instances, as an actor. */
export const Query = { define };
