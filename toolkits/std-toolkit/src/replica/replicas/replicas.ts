import { Actor } from '@kestack/kabuki';
import type { ActorType } from '@kestack/kabuki';
import { Clock, Context, Deferred, Effect, Layer, Queue, Stream } from 'effect';
import type { Scope } from 'effect';
import { nameOf, partsOf, ReplicaError } from '../shape/index.js';
import {
  Hosting,
  type Build,
  type Live,
  type Opened,
} from './instance/index.js';
import type { Store } from '../store/contract/index.js';
import {
  collected,
  dropped,
  held,
  Message,
  Model,
  released,
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
 * 2. Collect  once no one holds it, it runs on for its Replica's GC Time,
 *             then stops; with `Infinity` it never does. The Store removing
 *             one stops it at once.
 *
 * Its Model, and each Instance's own, are the whole record of what runs:
 * a View or a test reads them there.
 */

/** Who holds an Instance: named in Replicas' Model, and whether it is an Action. */
export const Holding = Context.Reference<{
  readonly holder: string;
  readonly action: boolean;
}>('@kestack/std-toolkit/replica/Holding', {
  defaultValue: () => ({ holder: 'anonymous', action: false }),
});

type Request = Message;

/** Between `Replicas.layer` and the actor under it: what is asked of it, and the Replicas it runs. */
class Link extends Context.Service<
  Link,
  {
    readonly asked: Queue.Queue<Request>;
    /** The Replicas the actor runs, once it has started. */
    readonly replicas: Deferred.Deferred<ReadonlySet<string>>;
  }
>()('@kestack/std-toolkit/replica/Link') {}

// The Capability: built once with the page that Provides it.
const layer: Layer.Layer<Replicas | Hosting | Link> = Layer.effectContext(
  Effect.gen(function* () {
    const asked = yield* Queue.unbounded<Request>();
    const replicas = yield* Deferred.make<ReadonlySet<string>>();
    const up = new Map<string, Deferred.Deferred<Opened, ReplicaError>>();
    const ask = (request: Request) =>
      Effect.asVoid(Queue.offer(asked, request));
    const waiting = (name: string) => {
      let found = up.get(name);
      if (found === undefined) {
        found = Deferred.makeUnsafe<Opened, ReplicaError>();
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

    return Context.make(Link, { asked, replicas }).pipe(
      Context.add(Replicas, { hold }),
      Context.add(Hosting, {
        up: (opened) =>
          Effect.asVoid(Deferred.succeed(waiting(opened.live.name), opened)),
        failed: (name, error) =>
          Effect.asVoid(Deferred.fail(waiting(name), error)),
        down: (name) => Effect.sync(() => up.delete(name)),
        opened: (name) => Effect.suspend(() => Deferred.await(waiting(name))),
        removed: (name) => ask({ _tag: 'Dropped', ...partsOf(name) }),
      }),
    );
  }),
);

type NeedsOf<B> = B extends Build<any, infer R> ? R : never;

/** Each Replica's Instances, as a View finds them: one Child per Key, under the Replica's name. */
type KidsOf<B extends Build> = {
  readonly [N in B['shape']['name']]: {
    readonly actor: Extract<
      B,
      { readonly shape: { readonly name: N } }
    >['actor'];
    readonly each: (...args: never) => ReadonlyArray<string>;
  };
};

/** The actor Replicas places, written out: the type `Actor.build` infers names Kabuki's internals. */
type ReplicasActor<B extends Build> = ActorType<
  'Replicas',
  void,
  void,
  Model,
  { readonly _tag: 'Single' },
  Message,
  { readonly Single: KidsOf<B> },
  Store | Hosting | Link | NeedsOf<B>
>;

const child = <const B extends ReadonlyArray<Build>>(
  builds: B,
): { readonly actor: ReplicasActor<B[number]> } => {
  const names = new Set(builds.map(({ shape }) => shape.name));
  const gcTimes = new Map(
    builds.map(({ shape, gcTime }) => [shape.name, gcTime]),
  );
  const gcTimeOf = (replica: string) => gcTimes.get(replica) ?? 0;
  const actor = Actor.build(
    Actor.define('Replicas', {
      requires: [Link],
      model: Model,
      message: Message,
    }),
    {
      init: () => ({ model: { instances: [] } }),
      children: Object.fromEntries(
        builds.map(({ shape, actor }) => [
          shape.name,
          {
            actor,
            each: ({ model }: { readonly model: Model }) =>
              model.instances
                .filter((running) => running.replica === shape.name)
                .map((running) => running.key),
            input: (_: unknown, key: string) => ({ key }),
          },
        ]),
      ),
      workers: {
        // What is asked comes in as this actor's own Messages.
        requests: {
          run: (self) =>
            Effect.gen(function* () {
              const link = yield* Link;
              yield* Deferred.succeed(link.replicas, names);
              yield* Stream.runForEach(Stream.fromQueue(link.asked), self.send);
            }),
        },
        // 2. Collect
        collect: {
          each: ({ model }) =>
            model.instances.flatMap((running) =>
              running.gcAt === null
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
              )?.gcAt;
              if (until == null) return;
              const now = yield* Clock.currentTimeMillis;
              yield* Effect.sleep(Math.max(0, until - now));
              yield* self.send({ _tag: 'Collected', ...where, until });
            }),
        },
      },
      on: {
        Held: ({ replica, key, holder }, { model }) => ({
          model: held(model, { replica, key }, holder),
        }),
        Released: ({ replica, key, holder, at }, { model }) => ({
          model: released(
            model,
            { replica, key },
            holder,
            at,
            gcTimeOf(replica),
          ),
        }),
        Collected: ({ replica, key, until }, { model }) => ({
          model: collected(model, { replica, key }, until),
        }),
        Dropped: ({ replica, key }, { model }) => ({
          model: dropped(model, { replica, key }),
        }),
      },
    },
  );
  return { actor: actor as unknown as ReplicasActor<B[number]> };
};

/**
 * The Instances in use here, as code gets them: through `Replica.get`. A
 * page Provides `Replicas.layer` and places `Replicas.child([...])` among
 * its children, once, near the root; what runs is in that actor's Model.
 */
export class Replicas extends Context.Service<
  Replicas,
  {
    /** Holds the Instance until the Scope closes, starting it first. Use `Replica.get`, which types it. */
    readonly hold: (
      replica: string,
      key: string,
    ) => Effect.Effect<Live, ReplicaError, Scope.Scope>;
  }
>()('@kestack/std-toolkit/replica/Replicas') {
  /** The Capability a page Provides. */
  static readonly layer = layer;
  /** The actor the same page places among its children, once, running these Builds. */
  static readonly child = child;
}

export type { Running };
