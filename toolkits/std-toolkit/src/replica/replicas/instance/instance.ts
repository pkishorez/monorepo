import type { Collection } from '@tanstack/db';
import { Actor } from '@kestack/kabuki';
import { Clock, Context, Duration, Effect, Semaphore, Stream } from 'effect';
import type { Entity } from '../../../core/index.js';
import type { AnyEntityESchema } from '../../../eschema/index.js';
import {
  nameOf,
  type AnyShape,
  type CollectionSchemas,
  type Shape,
  type ReplicaError,
  type Row,
} from '../../shape/index.js';
import type { Strategy } from './strategy/index.js';
import { Store, type Opening } from '../../store/contract/index.js';
import {
  announced,
  answered,
  closed,
  Input,
  Message,
  Model,
  opened,
  released,
  reported,
  resettled,
  State,
  stillCaughtUp,
  withoutOne,
  type Synced,
} from './model.js';
import { openInstance, type Live, type Opened } from './opened.js';
import { runStrategy } from './syncing.js';
import { workerKey, type WindowAt, type WindowMap } from './windows.js';

/*
 * An Instance: one Replica for one Key, as a Kabuki actor. It is Invoked by
 * Replicas, keyed by its Key, and lives as long as something holds it.
 *
 * 1. Open     its space in the Store and its Collections, and say it is up,
 *             so whoever holds it gets it. The Doorbell refreshes them.
 * 2. Lead     when the Store makes this participant its Leader: the State
 *             goes from Following to Leading.
 * 3. Gate     follows the Gate's Stream into the Model, as Messages.
 * 4. Window   a Query's `where` opens Windows and its end lets them go, as
 *             Messages; one nothing uses closes once its GC Time passes.
 *             Each participant records the Windows it has open, so the
 *             Leader runs them all.
 * 5. Sync     one Worker per Strategy: the whole Collection's, and each
 *             open Window's, only while Leading and the Gate is open. A
 *             closed Gate stops fetching, never reading.
 * 6. Caught Up a scope is, once its Strategy answered, until it stops. The
 *             Leader tells the others through the Store; each tells the
 *             Queries that read it.
 */

type KeyOf<D> = D extends Shape<string, infer K, any> ? K : never;

/** Where a Query finds, on an Instance, whether what it reads is Caught Up: never a Collection's name. */
export const CaughtUp: unique symbol = Symbol.for(
  '@kestack/std-toolkit/replica/CaughtUp',
);

/** Where a Query finds, on an Instance, whether what it reads is Never Synced: never a Collection's name. */
export const NeverSynced: unique symbol = Symbol.for(
  '@kestack/std-toolkit/replica/Synced',
);

/** A running Instance, as `Replica.get` gives it: its Key, its Collections, and Confirm. */
export type Instance<D extends AnyShape> = {
  readonly name: string;
  readonly key: KeyOf<D>;
  /** Whether what a Query reads of it is Caught Up, for Query alone. */
  readonly [CaughtUp]: Live['caughtUp'];
  /** Whether what a Query reads of it was ever synced on this device, for Query alone. */
  readonly [NeverSynced]: Live['synced'];
  /** Puts the Entities the Backend returned, in encoded form, in the Store, in place of the Optimistic Changes they answer. */
  readonly confirm: (
    entities: ReadonlyArray<Entity<unknown>>,
  ) => Effect.Effect<void, ReplicaError>;
  /** Waits until the Instance stops: no one holds it any more, or the Store removed it. */
  readonly stopped: Effect.Effect<void>;
} & {
  readonly [N in keyof D['collections']]: Collection<
    Row<D['collections'][N]>,
    string
  >;
};

/**
 * Between the Instances and Replicas, which Invokes them: an Instance says
 * here when it is up and down, and that the Store asked for it to stop.
 * Replicas gives it.
 */
export class Hosting extends Context.Service<
  Hosting,
  {
    readonly up: (opened: Opened) => Effect.Effect<void>;
    readonly failed: (name: string, error: ReplicaError) => Effect.Effect<void>;
    readonly down: (name: string) => Effect.Effect<void>;
    /** The open Instance of this name, once it is up. */
    readonly opened: (name: string) => Effect.Effect<Opened, ReplicaError>;
    readonly removed: (name: string) => Effect.Effect<void>;
  }
>()('@kestack/std-toolkit/replica/Hosting') {}

/** How one Collection syncs: a Strategy for all of it, one per Window, or both. */
export interface CollectionBuild<K, S extends AnyEntityESchema, R> {
  readonly strategy?: Strategy<K, any, R>;
  /** Each runs while a Query filters on its field: `walletId: (walletId) => oldToNew(...)`. */
  readonly windows?: WindowMap<K, S, R>;
}

export interface BuildOptions<K, C extends CollectionSchemas, R> {
  /** Whether the Instance of a Key may fetch now; open unless given. */
  readonly gate?: (input: {
    readonly key: K;
  }) => Stream.Stream<boolean, never, R>;
  /**
   * How long an Instance, or one of its Windows, runs on once nothing uses
   * it; `Infinity` keeps it running until the Store removes it.
   */
  readonly gcTime: Duration.Input;
  readonly collections: {
    readonly [N in keyof C]?: CollectionBuild<K, C[N], R>;
  };
}

/** A Replica's Build: its Shape, its GC Time, and the actor each of its Instances runs. */
export interface Build<D extends AnyShape = AnyShape, R = any> {
  readonly shape: D;
  /** In milliseconds; `Infinity` never stops. */
  readonly gcTime: number;
  readonly actor: Actor.Actor<
    D['name'],
    typeof Input.Type,
    void,
    Model,
    State,
    Message,
    { readonly Following: {}; readonly Leading: {} },
    Store | Hosting | R
  >;
}

type StrategyNeeds<S> = S extends Strategy<any, any, infer R> ? R : never;

/** What a Build's Gate and Strategies need, each read on its own so they add up. */
type NeedsOf<O> =
  | (O extends {
      readonly gate: (...args: any) => Stream.Stream<any, any, infer R>;
    }
      ? R
      : never)
  | (O extends { readonly collections: infer Written }
      ? {
          [N in keyof Written]:
            | (Written[N] extends { readonly strategy: infer S }
                ? StrategyNeeds<S>
                : never)
            | (Written[N] extends { readonly windows: infer W }
                ? {
                    [P in keyof W]: W[P] extends (value: any) => infer S
                      ? StrategyNeeds<S>
                      : never;
                  }[keyof W]
                : never);
        }[keyof Written]
      : never);

type Data = { readonly model: Model; readonly state: State };

/** One Strategy the Model says may run: the whole Collection's, or one Window's. */
const scopesOf = (model: Model) =>
  model.collections.flatMap((synced) => [
    ...(synced.strategy && synced.strategy.status !== 'outdated'
      ? [{ collection: synced.collection, window: null }]
      : []),
    ...synced.windows
      .filter((window) => window.status !== 'outdated')
      .map((window) => ({
        collection: synced.collection,
        window: { path: window.path, value: window.value } as WindowAt | null,
      })),
  ]);

/** The Windows open here, as the Store records them. */
const openHere = (model: Model): ReadonlyArray<Opening> =>
  model.collections.flatMap((synced) =>
    synced.windows
      .filter((window) => window.here)
      .map(({ path, value }) => ({
        collection: synced.collection,
        path,
        value,
      })),
  );

const same = <A>(left: A, right: A) =>
  JSON.stringify(left) === JSON.stringify(right);

const build = <
  K,
  C extends CollectionSchemas,
  const Name extends string,
  const O extends BuildOptions<K, C, any>,
>(
  shape: Shape<Name, K, C>,
  options: O,
): Build<Shape<Name, K, C>, NeedsOf<O>> => {
  type R = NeedsOf<O>;
  const nameOfModel = ({ model }: { readonly model: Model }) =>
    nameOf(shape.name, model.key);
  const keyOfModel = ({ model }: { readonly model: Model }) =>
    shape.keyOf(model.key);
  // An Instance that could not open said so already: its other Workers
  // wait for nothing then.
  const spaceOf = (data: { readonly model: Model }) =>
    Effect.flatMap(Hosting, (hosting) => hosting.opened(nameOfModel(data)));
  const openedOf = (data: { readonly model: Model }) =>
    Effect.orDie(spaceOf(data));
  const warn = (what: string) => (error: unknown) =>
    Effect.logWarning(`[@kestack/std-toolkit/replica] ${what}`, error);
  // The Gate and the Strategies need what the app gives them, `R`, which
  // the actor's type carries up to the app's Layer. Kabuki checks an actor's
  // own work against the Capabilities it lists, and `R` is only a type, so
  // they are read here as needing anything: the Runtime runs every Worker
  // with the whole app's Context.
  const { gate, collections }: BuildOptions<K, C, any> = options;
  const gcTime = Duration.toMillis(Duration.fromInputUnsafe(options.gcTime));
  const written = Object.entries(collections).flatMap(([collection, each]) =>
    each && (each.strategy || each.windows)
      ? [
          {
            collection,
            strategy: each.strategy as Strategy<K, any, any> | undefined,
            windows: (each.windows ?? {}) as Readonly<
              Record<
                string,
                ((value: unknown) => Strategy<K, any, any>) | undefined
              >
            >,
          },
        ]
      : [],
  );
  const whole = new Set(
    written.flatMap(({ collection, strategy }) =>
      strategy ? [collection] : [],
    ),
  );
  const windowPaths = Object.fromEntries(
    written.flatMap(({ collection, windows }) => {
      const paths = Object.keys(windows);
      return paths.length === 0 ? [] : [[collection, paths]];
    }),
  );
  const strategyOf = (collection: string, window: WindowAt | null) => {
    const found = written.find((each) => each.collection === collection);
    return window === null
      ? found?.strategy
      : found?.windows[window.path]?.(window.value);
  };
  const leading = ({ state }: Data) => state._tag === 'Leading';
  /** While it leads, a scope whose Strategy stopped is no longer Caught Up. */
  const whileLeading = (data: Data, model: Model) =>
    leading(data) ? stillCaughtUp(model) : model;

  // 5. Sync
  const syncing = {
    sync: {
      each: ({ model }: Data) =>
        model.gate
          ? scopesOf(model).map(({ collection, window }) =>
              workerKey(collection, window),
            )
          : [],
      run: (
        self: {
          readonly get: Effect.Effect<Data>;
          readonly send: (message: Message) => Effect.Effect<void>;
        },
        key: string,
      ) =>
        Effect.gen(function* () {
          const data = yield* self.get;
          const scope = scopesOf(data.model).find(
            ({ collection, window }) => workerKey(collection, window) === key,
          );
          const strategy = scope && strategyOf(scope.collection, scope.window);
          if (!scope || !strategy) return;
          yield* runStrategy({
            ...scope,
            strategy,
            key: keyOfModel(data),
            opened: yield* openedOf(data),
            send: self.send,
          });
        }),
    },
    // 6. Caught Up: what it is, told to the others whenever it changes, and
    // again when one asks. Its first word, as it leads, clears what the last
    // Leader told.
    tell: {
      run: (self: {
        readonly get: Effect.Effect<Data>;
        readonly changes: Stream.Stream<Data>;
      }) =>
        Effect.gen(function* () {
          const { space } = yield* spaceOf(yield* self.get);
          const telling = yield* Semaphore.make(1);
          let latest: ReadonlyArray<string> = [];
          const tell = telling.withPermit(
            Effect.suspend(() => space.tell(latest)).pipe(
              Effect.catch(
                warn(`${space.name}: could not tell what is Caught Up`),
              ),
            ),
          );
          yield* Effect.all(
            [
              self.changes.pipe(
                Stream.map(({ model }) => model.caughtUp),
                Stream.changesWith(same),
                Stream.runForEach((scopes) =>
                  Effect.andThen(
                    Effect.sync(() => {
                      latest = scopes;
                    }),
                    tell,
                  ),
                ),
              ),
              Stream.runForEach(space.asked, () => tell),
            ],
            { concurrency: 'unbounded', discard: true },
          );
        }).pipe(Effect.ignore),
    },
    // 4. Window: what other participants have open, read anew each time
    // one records it. A new Leader first clears every record and asks for
    // them again, so one left by a participant that crashed goes now.
    openings: {
      run: (self: {
        readonly get: Effect.Effect<Data>;
        readonly send: (message: Message) => Effect.Effect<void>;
      }) =>
        Effect.gen(function* () {
          const { space } = yield* spaceOf(yield* self.get);
          yield* space.recall.pipe(
            Effect.catch(warn(`${space.name}: could not ask for open Windows`)),
          );
          let last: ReadonlyArray<Opening> = [];
          yield* Stream.runForEach(space.announced, () =>
            space.openings.pipe(
              Effect.map((all) =>
                all.filter(({ collection, path }) =>
                  windowPaths[collection]?.includes(path),
                ),
              ),
              Effect.flatMap((windows) => {
                if (same(windows, last)) return Effect.void;
                last = windows;
                return self.send({ _tag: 'Announced', windows });
              }),
              Effect.catch(
                warn(`${space.name}: could not read the open Windows`),
              ),
            ),
          );
        }).pipe(Effect.ignore),
    },
  };

  const actor = Actor.build(
    Actor.define(shape.name, {
      requires: [Store, Hosting],
      input: Input,
      model: Model,
      state: State,
      message: Message,
    }),
    {
      init: ({ key }) => ({
        model: {
          key,
          gate: gate === undefined,
          pending: [],
          caughtUp: [],
          collections: written.map(({ collection, strategy }): Synced => ({
            collection,
            strategy: strategy ? { status: 'idle', problem: null } : null,
            windows: [],
          })),
        },
        state: { _tag: 'Following' },
      }),
      workers: {
        // 1. Open
        open: {
          run: (self) =>
            Effect.gen(function* () {
              const data = yield* self.get;
              const name = nameOfModel(data);
              const hosting = yield* Hosting;
              const space = yield* (yield* Store).open(name);
              const instance = yield* openInstance(
                shape,
                keyOfModel(data),
                space,
                windowPaths,
                whole,
              );
              yield* Effect.acquireRelease(hosting.up(instance), () =>
                hosting.down(name),
              );
              // What another participant wrote, read again when it rings.
              const follow = Stream.runForEach(space.changes, () =>
                instance.refresh.pipe(
                  Effect.catch(warn(`${name}: could not read the Store again`)),
                ),
              );
              yield* Effect.all(
                [
                  follow,
                  Effect.andThen(space.removed, hosting.removed(name)),
                  Stream.runForEach(instance.messages, self.send),
                ],
                { concurrency: 'unbounded', discard: true },
              );
            }).pipe(
              Effect.catch((error) =>
                Effect.gen(function* () {
                  const hosting = yield* Hosting;
                  const name = nameOfModel(yield* self.get);
                  yield* Effect.acquireRelease(
                    hosting.failed(name, error),
                    () => hosting.down(name),
                  );
                  yield* Effect.logError(
                    '[@kestack/std-toolkit/replica] an Instance could not open',
                    error,
                  );
                  yield* Effect.never;
                }),
              ),
            ),
        },
        // 6. Caught Up: what the Model says, for the Queries that read it.
        report: {
          run: (self) =>
            Effect.gen(function* () {
              const opened = yield* spaceOf(yield* self.get);
              yield* self.changes.pipe(
                Stream.map(({ model }) => model.caughtUp),
                Stream.changesWith(same),
                Stream.runForEach(opened.report),
              );
            }).pipe(Effect.ignore),
        },
        // 2. Lead
        lead: {
          run: (self) =>
            Effect.gen(function* () {
              const { space } = yield* (yield* Hosting).opened(
                nameOfModel(yield* self.get),
              );
              yield* space.lead(
                Effect.andThen(self.send({ _tag: 'Led' }), Effect.never),
              );
            }).pipe(Effect.ignore),
        },
        // 3. Gate
        ...(gate && {
          gate: {
            run: (self) =>
              Effect.gen(function* () {
                const data = yield* self.get;
                yield* gate({ key: keyOfModel(data) }).pipe(
                  Stream.changes,
                  Stream.runForEach((open) =>
                    self.send({ _tag: 'Gated', open }),
                  ),
                );
              }),
          },
        }),
        // 4. Window: one nothing here uses closes once its GC Time passes.
        collect: {
          each: ({ model }) =>
            model.collections.flatMap((synced) =>
              synced.windows
                .filter((window) => window.gcAt !== null)
                .map((window) => workerKey(synced.collection, window)),
            ),
          run: (self, key) =>
            Effect.gen(function* () {
              const { model } = yield* self.get;
              const found = model.collections
                .flatMap((synced) =>
                  synced.windows.map((window) => ({
                    collection: synced.collection,
                    window,
                  })),
                )
                .find(
                  ({ collection, window }) =>
                    workerKey(collection, window) === key,
                );
              const until = found?.window.gcAt;
              if (!found || until == null) return;
              const { path, value } = found.window;
              const now = yield* Clock.currentTimeMillis;
              yield* Effect.sleep(Math.max(0, until - now));
              yield* self.send({
                _tag: 'WindowClosed',
                collection: found.collection,
                path,
                value,
                until,
              });
            }),
        },
        // 4. Window: the ones open here, recorded for the Leader, and
        // recorded again when a new Leader asks.
        announce: {
          run: (self) =>
            Effect.gen(function* () {
              if (Object.keys(windowPaths).length === 0) return;
              const { space } = yield* spaceOf(yield* self.get);
              const writing = yield* Semaphore.make(1);
              let latest: ReadonlyArray<Opening> = [];
              const record = writing.withPermit(
                Effect.suspend(() => space.announce(latest)).pipe(
                  Effect.catch(
                    warn(`${space.name}: could not record its open Windows`),
                  ),
                ),
              );
              yield* Effect.all(
                [
                  self.changes.pipe(
                    Stream.map(({ model }) => openHere(model)),
                    Stream.changesWith(same),
                    Stream.runForEach((windows) =>
                      Effect.andThen(
                        Effect.sync(() => {
                          latest = windows;
                        }),
                        record,
                      ),
                    ),
                  ),
                  Stream.runForEach(space.recalled, () => record),
                ],
                { concurrency: 'unbounded', discard: true },
              );
            }).pipe(Effect.ignore),
        },
      },
      on: {
        Gated: ({ open }, data) => ({
          model: whileLeading(
            data,
            resettled({ ...data.model, gate: open }, leading(data)),
          ),
        }),
        ActionBegan: ({ action }, { model }) => ({
          model: { ...model, pending: [...model.pending, action] },
        }),
        ActionEnded: ({ action }, { model }) => ({
          model: { ...model, pending: withoutOne(model.pending, action) },
        }),
        WindowOpened: ({ _tag, ...where }, data) => ({
          model: opened(data.model, where, leading(data)),
        }),
        WindowReleased: ({ _tag, at, ...where }, { model }) => ({
          model: released(model, where, at, gcTime),
        }),
        WindowClosed: ({ _tag, until, ...where }, data) => ({
          model: whileLeading(data, closed(data.model, where, until)),
        }),
        Announced: ({ windows }, data) => ({
          model: whileLeading(
            data,
            announced(data.model, windows, leading(data)),
          ),
        }),
        Outdated: ({ _tag, ...scope }, { model }) => ({
          model: reported(model, scope, { status: 'outdated', problem: null }),
        }),
        Failed: ({ _tag, message, ...scope }, { model }) => ({
          model: reported(model, scope, {
            status: 'failing',
            problem: message,
          }),
        }),
        Recovered: ({ _tag, ...scope }, { model }) => ({
          model: reported(model, scope, { status: 'running', problem: null }),
        }),
      },
      state: {
        Following: {
          on: {
            // Its own Strategies start now: none has answered yet.
            Led: (_, { model }) => ({
              model: { ...resettled(model, true), caughtUp: [] },
              state: { _tag: 'Leading' },
            }),
            Told: ({ scopes }, { model }) => ({
              model: { ...model, caughtUp: scopes },
            }),
          },
          workers: {
            // 6. Caught Up: what the Leader tells, once what it read shows here.
            hear: {
              run: (self) =>
                Effect.gen(function* () {
                  const opened = yield* spaceOf(yield* self.get);
                  const { space } = opened;
                  yield* Stream.runForEach(space.told, () =>
                    Effect.gen(function* () {
                      const scopes = yield* space.caughtUp;
                      yield* opened.refresh;
                      yield* self.send({ _tag: 'Told', scopes });
                    }).pipe(
                      Effect.catch(
                        warn(`${space.name}: could not hear what is Caught Up`),
                      ),
                    ),
                  );
                }).pipe(Effect.ignore),
            },
          },
        },
        Leading: {
          on: {
            Answered: ({ _tag, ...scope }, { model }) => ({
              model: answered(model, scope),
            }),
          },
          workers:
            Object.keys(windowPaths).length > 0
              ? syncing
              : { sync: syncing.sync, tell: syncing.tell },
        },
      },
    },
  );
  return {
    shape,
    gcTime,
    // Written out: the type `Actor.build` infers names Kabuki's internals,
    // and what it needs gains `R`, which the Gate and the Strategies use.
    actor: actor as Build<Shape<Name, K, C>, R>['actor'],
  };
};

/** How each Instance of a Replica syncs: its Gate, its GC Time, and the Strategies of its Collections and their Windows. */
export const Instances = { build };
export type { Live, Opened, WindowMap };
/** Makes a query, naming what it reads of each Instance as it is made. */
export { readsOf } from './collections.js';
