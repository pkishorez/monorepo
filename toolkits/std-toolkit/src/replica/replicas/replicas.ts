import { Actor } from '@kestack/kabuki';
import type { ActorType } from '@kestack/kabuki';
import {
  Clock,
  Context,
  Deferred,
  Duration,
  Effect,
  Layer,
  Queue,
  Stream,
  SubscriptionRef,
} from 'effect';
import type { Scope } from 'effect';
import { nameOf, partsOf, ReplicaError } from '../definition/index.js';
import {
  Hosting,
  type Build,
  type Live,
  type Opened,
} from '../instance/index.js';
import type { Store } from '../store/contract/index.js';
import {
  dropped,
  held,
  lingered,
  Message,
  Model,
  released,
  reported,
  type Running,
} from './model.js';

/*
 * Replicas: the one actor that runs the Instances in use, placed once near
 * the root as the Router holds pages. A page Provides `Replicas.layer` and
 * places `Replicas.child([...])` among its children; everything below it
 * gets Instances with `Replica.get`.
 *
 * 1. Hold     getting an Instance holds it until the holder's Scope closes:
 *             the first holder starts it, as a Child keyed by its Key.
 * 2. Linger   once no one holds it, it runs on for `linger`, then stops;
 *             a Replica in `keep` never lingers. The Store removing one
 *             stops it at once.
 * 3. Show     every running Instance, its role, Gate, holders and when it
 *             stops, in the Model and as `state`.
 */

/** Who holds an Instance: named in the state shown, and whether it is an Action. */
export const Holding = Context.Reference<{
  readonly holder: string;
  readonly action: boolean;
}>('@kestack/std-toolkit/replica/Holding', {
  defaultValue: () => ({ holder: 'anonymous', action: false }),
});

type Request = Message;

/** Between `Replicas.layer` and the actor under it: what it shows, what is asked of it, and the Instances up. */
class Link extends Context.Service<
  Link,
  {
    readonly linger: number;
    readonly keep: ReadonlyArray<string>;
    readonly shown: SubscriptionRef.SubscriptionRef<ReadonlyArray<Running>>;
    readonly asked: Queue.Queue<Request>;
    /** The Replicas the actor runs, once it has started. */
    readonly replicas: Deferred.Deferred<ReadonlySet<string>>;
  }
>()('@kestack/std-toolkit/replica/Link') {}

export interface LayerOptions {
  /** How long an Instance runs on once no one holds it. */
  readonly linger: Duration.Input;
  /** Replicas whose Instances, once started, run until the Store removes them. */
  readonly keep?: ReadonlyArray<{ readonly name: string }>;
}

// The Capability: built once with the page that Provides it.
const layer = (options: LayerOptions): Layer.Layer<Replicas | Hosting | Link> =>
  Layer.effectContext(
    Effect.gen(function* () {
      const shown = yield* SubscriptionRef.make<ReadonlyArray<Running>>([]);
      const asked = yield* Queue.unbounded<Request>();
      const replicas = yield* Deferred.make<ReadonlySet<string>>();
      const up = new Map<string, Deferred.Deferred<Opened>>();
      const ask = (request: Request) =>
        Effect.asVoid(Queue.offer(asked, request));
      const waiting = (name: string) => {
        let found = up.get(name);
        if (found === undefined) {
          found = Deferred.makeUnsafe<Opened>();
          up.set(name, found);
        }
        return found;
      };

      // 1. Hold
      const hold = (replica: string, key: string) =>
        Effect.gen(function* () {
          const known = yield* Deferred.await(replicas);
          if (!known.has(replica))
            return yield* new ReplicaError({
              message: `Replica "${replica}" does not run here: put its Build in Replicas.child`,
            });
          const { holder, action } = yield* Holding;
          const where = { replica, key };
          yield* Effect.acquireRelease(
            ask({ _tag: 'Held', ...where, holder }),
            () =>
              Effect.flatMap(Clock.currentTimeMillis, (at) =>
                ask({ _tag: 'Released', ...where, holder, at }),
              ),
          );
          const { live } = yield* Deferred.await(waiting(nameOf(replica, key)));
          if (action) yield* live.track(holder);
          return live;
        });

      return Context.make(Link, {
        linger: Duration.toMillis(Duration.fromInputUnsafe(options.linger)),
        keep: (options.keep ?? []).map(({ name }) => name),
        shown,
        asked,
        replicas,
      }).pipe(
        Context.add(Replicas, {
          state: SubscriptionRef.changes(shown),
          current: SubscriptionRef.get(shown),
          hold,
        }),
        Context.add(Hosting, {
          up: (opened) =>
            Effect.asVoid(Deferred.succeed(waiting(opened.live.name), opened)),
          down: (name) => Effect.sync(() => up.delete(name)),
          opened: (name) => Effect.suspend(() => Deferred.await(waiting(name))),
          report: (name, status) =>
            ask({ _tag: 'Reported', ...partsOf(name), ...status }),
          removed: (name) => ask({ _tag: 'Dropped', ...partsOf(name) }),
        }),
      );
    }),
  );

type NeedsOf<B> = B extends Build<any, infer R> ? R : never;

/** The actor Replicas places, written out: the type `Actor.build` infers names Kabuki's internals. */
type ReplicasActor<B extends Build> = ActorType<
  'Replicas',
  void,
  void,
  Model,
  { readonly _tag: 'Single' },
  Message,
  { readonly Single: {} },
  Store | Hosting | Link | NeedsOf<B>
>;

const child = <const B extends ReadonlyArray<Build>>(
  builds: B,
): { readonly actor: ReplicasActor<B[number]> } => {
  const names = new Set(builds.map(({ definition }) => definition.name));
  const actor = Actor.build(
    Actor.define('Replicas', {
      requires: [Link],
      model: Model,
      message: Message,
    }),
    {
      init: () => ({ model: { linger: 0, keep: [], instances: [] } }),
      children: Object.fromEntries(
        builds.map(({ definition, actor }) => [
          definition.name,
          {
            actor,
            each: ({ model }: { readonly model: Model }) =>
              model.instances
                .filter((running) => running.replica === definition.name)
                .map((running) => running.key),
            input: (_: unknown, key: string) => ({ key }),
          },
        ]),
      ),
      workers: {
        // What is asked comes in as this Instance's own Messages, after
        // how it is set up.
        requests: {
          run: (self) =>
            Effect.gen(function* () {
              const link = yield* Link;
              yield* self.send({
                _tag: 'Configured',
                linger: link.linger,
                keep: link.keep,
              });
              yield* Deferred.succeed(link.replicas, names);
              yield* Stream.runForEach(Stream.fromQueue(link.asked), self.send);
            }),
        },
        // 3. Show
        publish: {
          run: (self) =>
            Effect.flatMap(Link, ({ shown }) =>
              self.changes.pipe(
                Stream.map(({ model }) => model.instances),
                Stream.changes,
                Stream.runForEach((now) => SubscriptionRef.set(shown, now)),
              ),
            ),
        },
        // 2. Linger
        linger: {
          each: ({ model }) =>
            model.instances.flatMap((running) =>
              running.lingeringUntil === null
                ? []
                : [nameOf(running.replica, running.key)],
            ),
          run: (self, name) =>
            Effect.gen(function* () {
              const where = partsOf(name);
              const { model } = yield* self.get;
              const until = model.instances.find(
                (running) =>
                  running.replica === where.replica &&
                  running.key === where.key,
              )?.lingeringUntil;
              if (until == null) return;
              const now = yield* Clock.currentTimeMillis;
              yield* Effect.sleep(Math.max(0, until - now));
              yield* self.send({ _tag: 'Lingered', ...where, until });
            }),
        },
      },
      on: {
        Configured: ({ linger, keep }, { model }) => ({
          model: { ...model, linger, keep },
        }),
        Held: ({ replica, key, holder }, { model }) => ({
          model: held(model, { replica, key }, holder),
        }),
        Released: ({ replica, key, holder, at }, { model }) => ({
          model: released(model, { replica, key }, holder, at),
        }),
        Lingered: ({ replica, key, until }, { model }) => ({
          model: lingered(model, { replica, key }, until),
        }),
        Reported: ({ replica, key, role, gate }, { model }) => ({
          model: reported(model, { replica, key }, { role, gate }),
        }),
        Dropped: ({ replica, key }, { model }) => ({
          model: dropped(model, { replica, key }),
        }),
      },
    },
  );
  return { actor: actor as ReplicasActor<B[number]> };
};

/**
 * The Instances in use here: `state` for a panel or a test to show them;
 * `Replica.get` is how code gets one. A page Provides `Replicas.layer` and
 * places `Replicas.child([...])` among its children, once, near the root.
 */
export class Replicas extends Context.Service<
  Replicas,
  {
    /** Every running Instance now, then after each change. */
    readonly state: Stream.Stream<ReadonlyArray<Running>>;
    readonly current: Effect.Effect<ReadonlyArray<Running>>;
    /** Holds the Instance until the Scope closes, starting it first. Use `Replica.get`, which types it. */
    readonly hold: (
      replica: string,
      key: string,
    ) => Effect.Effect<Live, ReplicaError, Scope.Scope>;
  }
>()('@kestack/std-toolkit/replica/Replicas') {
  /** The Capability a page Provides, with how long an Instance lingers and which Replicas are kept. */
  static readonly layer = layer;
  /** The actor the same page places among its children, once, running these Builds. */
  static readonly child = child;
}

export type { LayerOptions as ReplicasOptions, Running };
