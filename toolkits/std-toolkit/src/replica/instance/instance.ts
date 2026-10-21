import type { Collection } from '@tanstack/db';
import { Actor } from '@kestack/kabuki';
import type { ActorType } from '@kestack/kabuki';
import { Context, Effect, Stream } from 'effect';
import type { Entity } from '../../core/index.js';
import {
  nameOf,
  type AnyDefinition,
  type CollectionSchemas,
  type Definition,
  type ReplicaError,
  type Row,
} from '../definition/index.js';
import type { Strategy } from '../strategy/index.js';
import { Store } from '../store/contract/index.js';
import { Input, Message, Model, State, withoutOne } from './model.js';
import { openInstance, type Live, type Opened } from './opened.js';
import { runStrategy } from './syncing.js';

/*
 * An Instance: one Replica for one Key, as a Kabuki actor. It is Invoked by
 * Replicas, keyed by its Key, and lives as long as something holds it.
 *
 * 1. Open    its space in the Store and its Collections, and say it is up,
 *            so whoever holds it gets it. The Doorbell refreshes them.
 * 2. Lead    when the Store makes this participant its Leader: the State
 *            goes from Following to Leading.
 * 3. Gate    follows the Gate's Stream into the Model, as Messages.
 * 4. Sync    one Worker per Collection with a Strategy, only while Leading
 *            and the Gate is open. A closed Gate stops fetching, never
 *            reading.
 * 5. Report  its State and Gate, for the state Replicas shows.
 */

type KeyOf<D> = D extends Definition<string, infer K, any> ? K : never;

/** A running Instance, as `Replica.get` gives it: its Key, its Collections, and Confirm. */
export type Instance<D extends AnyDefinition> = {
  readonly name: string;
  readonly key: KeyOf<D>;
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

/** Leading or following, and the Gate, as Replicas shows them. */
export interface Status {
  readonly role: 'leading' | 'following';
  readonly gate: boolean;
}

/**
 * Between the Instances and Replicas, which Invokes them: an Instance says
 * here when it is up and down, how it is doing, and that the Store asked
 * for it to stop. Replicas gives it.
 */
export class Hosting extends Context.Service<
  Hosting,
  {
    readonly up: (opened: Opened) => Effect.Effect<void>;
    readonly failed: (name: string, error: ReplicaError) => Effect.Effect<void>;
    readonly down: (name: string) => Effect.Effect<void>;
    /** The open Instance of this name, once it is up. */
    readonly opened: (name: string) => Effect.Effect<Opened, ReplicaError>;
    readonly report: (name: string, status: Status) => Effect.Effect<void>;
    readonly removed: (name: string) => Effect.Effect<void>;
  }
>()('@kestack/std-toolkit/replica/Hosting') {}

export interface BuildOptions<K, C extends CollectionSchemas, R> {
  /** Whether the Instance of a Key may fetch now; open unless given. */
  readonly gate?: (input: {
    readonly key: K;
  }) => Stream.Stream<boolean, never, R>;
  readonly collections: {
    readonly [N in keyof C]?: { readonly strategy?: Strategy<K, any, R> };
  };
}

/** A Replica's Build: its Definition and the actor each of its Instances runs. */
export interface Build<D extends AnyDefinition = AnyDefinition, R = any> {
  readonly definition: D;
  readonly actor: ActorType<
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

/** What a Build's Gate and Strategies need, each read on its own so they add up. */
type NeedsOf<O> =
  | (O extends {
      readonly gate: (...args: any) => Stream.Stream<any, any, infer R>;
    }
      ? R
      : never)
  | (O extends { readonly collections: infer Written }
      ? {
          [N in keyof Written]: Written[N] extends {
            readonly strategy: Strategy<any, any, infer R>;
          }
            ? R
            : never;
        }[keyof Written]
      : never);

const build = <
  K,
  C extends CollectionSchemas,
  const Name extends string,
  const O extends BuildOptions<K, C, any>,
>(
  definition: Definition<Name, K, C>,
  options: O,
): Build<Definition<Name, K, C>, NeedsOf<O>> => {
  type R = NeedsOf<O>;
  const nameOfModel = ({ model }: { readonly model: Model }) =>
    nameOf(definition.name, model.key);
  const keyOfModel = ({ model }: { readonly model: Model }) =>
    definition.keyOf(model.key);
  const opened = (data: { readonly model: Model }) =>
    Effect.flatMap(Hosting, (hosting) =>
      hosting.opened(nameOfModel(data)),
    ).pipe(Effect.orDie);
  // The Gate and the Strategies need what the app gives them, `R`, which
  // the actor's type carries up to the app's Layer. Kabuki checks an actor's
  // own work against the Capabilities it lists, and `R` is only a type, so
  // they are read here as needing anything: the Runtime runs every Worker
  // with the whole app's Context.
  const { gate, collections }: BuildOptions<K, C, any> = options;

  // 4. Sync
  const syncing = Object.fromEntries(
    Object.entries(collections).flatMap(([collection, written]) => {
      const strategy = written?.strategy;
      if (!strategy) return [];
      return [
        [
          `sync ${collection}`,
          {
            while: ({ model }: { readonly model: Model }) =>
              model.gate && !model.outdated.includes(collection),
            run: (self: {
              readonly get: Effect.Effect<{ readonly model: Model }>;
              readonly send: (message: Message) => Effect.Effect<void>;
            }) =>
              Effect.gen(function* () {
                const data = yield* self.get;
                yield* runStrategy({
                  collection,
                  strategy,
                  key: keyOfModel(data),
                  opened: yield* opened(data),
                  send: self.send,
                });
              }),
          },
        ],
      ];
    }),
  );

  const actor = Actor.build(
    Actor.define(definition.name, {
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
          outdated: [],
          failing: [],
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
                definition,
                keyOfModel(data),
                space,
              );
              yield* Effect.acquireRelease(hosting.up(instance), () =>
                hosting.down(name),
              );
              // What another participant wrote, read again when it rings.
              const follow = Stream.runForEach(space.changes, () =>
                instance.refresh.pipe(
                  Effect.catch((error) =>
                    Effect.logWarning(
                      `[@kestack/std-toolkit/replica] ${name}: could not read the Store again`,
                      error,
                    ),
                  ),
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
        // 5. Report
        report: {
          run: (self) =>
            Effect.gen(function* () {
              const hosting = yield* Hosting;
              const name = nameOfModel(yield* self.get);
              yield* self.changes.pipe(
                Stream.map(({ model, state }): Status => ({
                  role: state._tag === 'Leading' ? 'leading' : 'following',
                  gate: model.gate,
                })),
                Stream.changesWith(
                  (a, b) => a.role === b.role && a.gate === b.gate,
                ),
                Stream.runForEach((status) => hosting.report(name, status)),
              );
            }),
        },
      },
      on: {
        Gated: ({ open }, { model }) => ({ model: { ...model, gate: open } }),
        ActionBegan: ({ action }, { model }) => ({
          model: { ...model, pending: [...model.pending, action] },
        }),
        ActionEnded: ({ action }, { model }) => ({
          model: { ...model, pending: withoutOne(model.pending, action) },
        }),
        Outdated: ({ collection }, { model }) => ({
          model: { ...model, outdated: [...model.outdated, collection] },
        }),
        Failed: ({ collection, message }, { model }) => ({
          model: {
            ...model,
            failing: [
              ...model.failing.filter((each) => each.collection !== collection),
              { collection, message },
            ],
          },
        }),
        Recovered: ({ collection }, { model }) => ({
          model: {
            ...model,
            failing: model.failing.filter(
              (each) => each.collection !== collection,
            ),
          },
        }),
      },
      state: {
        Following: { on: { Led: () => ({ state: { _tag: 'Leading' } }) } },
        Leading: { workers: syncing },
      },
    },
  );
  return {
    definition,
    // Written out: the type `Actor.build` infers names Kabuki's internals,
    // and what it needs gains `R`, which the Gate and the Strategies use.
    actor: actor as Build<Definition<Name, K, C>, R>['actor'],
  };
};

/** How each Instance of a Replica syncs: its Gate and a Strategy per Collection. */
export const Instances = { build };
export type { Live, Opened };
