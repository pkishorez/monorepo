import {
  Cause,
  Context,
  Deferred,
  Effect,
  Exit,
  Layer,
  Pull,
  Scope,
  SubscriptionRef,
} from 'effect';
import type { Fiber } from 'effect';
import type {
  Data,
  Definition,
  Self,
  Tagged,
  WorkerDefinition,
} from '../actor/index.ts';
import { isMany } from '../snapshot/index.ts';
import type { Instance, Source } from '../snapshot/index.ts';

/** The work running now, which `self.send` stamps as the Message's Source. */
const Sending = Context.Reference<Source | undefined>('effect-oak/Sending', {
  defaultValue: () => undefined,
});

/*
 * The work of every live Instance, in nested Scopes: the live app's Scope
 * holds the root's, an Instance's holds its State's and the Children written
 * at its top, and a State's holds that State's own Children. Closing a Scope stops everything below it, children first.
 * Workers hang on the Instance's Scope and follow its data: after every
 * change, each Worker's Condition names the keys that should run.
 *
 * 1. Start   an Instance: its Scope, its `self`, the Layer its top Provides,
 *            its Workers, the Children written at its top, and its State.
 * 2. Enter   a State: its Scope, the Layer it Provides, and its own Children.
 *            Work waits for the Capabilities from above, so starting never
 *            blocks.
 * 3. Change  tells the Instance's own work its new data or Props, and syncs its
 *            Workers: a key that appeared starts one, a key that went stops
 *            one, a key that stayed is left alone.
 * 4. Command runs an errand an Update asked for, in the Instance's Scope,
 *            and Sends the Message it ends with.
 * 5. Stop    an Instance, or leave its State: close the Scope.
 */

/** Where an Instance hangs: the Scope it lives in and the Capabilities it gets. */
interface Parent {
  readonly scope: Scope.Scope;
  readonly capabilities: Deferred.Deferred<Context.Context<never>>;
}

/** What a Worker is doing, live. */
export type WorkerStatus = {
  readonly name: string;
  /** The key it runs for; `''` for the one Worker of a kind other than `each`. */
  readonly key: string;
  readonly status: 'running' | 'finished' | 'failed';
};

/** One live Worker. `closing` is set before its finalizers run, so a Send from one dies. */
interface Live {
  fiber: Fiber.Fiber<unknown, unknown>;
  closing: boolean;
  status: WorkerStatus['status'];
}

/** One live Instance's work. */
interface Work {
  readonly definition: Definition;
  readonly scope: Scope.Closeable;
  readonly above: Deferred.Deferred<Context.Context<never>>;
  readonly data: SubscriptionRef.SubscriptionRef<
    Data<unknown, Tagged, unknown>
  >;
  readonly self: Self<unknown, Tagged, Tagged, unknown>;
  /** By Worker name, then by key. */
  readonly workers: Map<string, Map<string, Live>>;
  /** What the Children written at its top get: the top Provides over what is above. */
  readonly own: Parent;
  /** The current State's Scope, and what its own Children get. */
  state: Parent & { readonly scope: Scope.Closeable };
}

export type Works = ReturnType<typeof makeWorks>;

/**
 * The work of one live run of the app. `services` are the Layer's, `send`
 * hands a Message to the mailbox, `now` is the app's Time.
 */
export const makeWorks = (
  services: Context.Context<never>,
  send: (instance: string, message: Tagged, source: Source) => void,
  now: () => number,
) => {
  const works = new Map<string, Work>();
  const run = Effect.runSyncWith(services);

  /** Run an Effect in a Scope, reporting any failure other than being stopped. */
  const fork = (
    scope: Scope.Scope,
    path: string,
    effect: Effect.Effect<unknown, never, never>,
  ) => {
    const fiber = run(Effect.forkIn(effect, scope));
    fiber.addObserver((exit) => {
      if (Exit.isFailure(exit) && !stopped(exit.cause))
        console.error(
          `[effect-oak] ${path} failed:\n${Cause.pretty(exit.cause)}`,
        );
    });
    return fiber;
  };

  /**
   * Run work with the Capabilities from above once they exist, a Scope, and
   * the Source of what it Sends.
   */
  const withAbove = (
    above: Deferred.Deferred<Context.Context<never>>,
    scope: Scope.Scope,
    source: Source,
    effect: Effect.Effect<unknown, never, any>,
  ) =>
    Deferred.await(above).pipe(
      Effect.flatMap((capabilities) =>
        effect.pipe(
          Effect.provideService(Sending, source),
          Effect.provideService(Scope.Scope, scope),
          Effect.provideContext(capabilities),
        ),
      ),
    ) as Effect.Effect<unknown, never, never>;

  // 1. Start
  const start = (
    instance: Instance,
    definition: Definition,
    parent: Parent,
  ): void => {
    const scope = Scope.forkUnsafe(parent.scope);
    const data = run(
      SubscriptionRef.make<Data<unknown, Tagged, unknown>>(dataOf(instance)),
    );
    const self: Work['self'] = {
      id: instance.id,
      // A Request runs in another Instance's work, which is its Source;
      // outside any Command or Worker, the Instance's own Provide Sent it.
      send: (message) =>
        Effect.flatMap(Effect.service(Sending), (source) =>
          Effect.sync(() =>
            send(
              instance.id,
              message,
              source ?? { kind: 'provide', instance: instance.id },
            ),
          ),
        ),
      get: SubscriptionRef.get(data),
      changes: SubscriptionRef.changes(data),
      now: Effect.sync(now),
    };
    const own = Deferred.makeUnsafe<Context.Context<never>>();
    const work: Work = {
      definition,
      scope,
      above: parent.capabilities,
      data,
      self,
      workers: new Map(),
      own: { scope, capabilities: own },
      state: undefined!,
    };
    works.set(instance.id, work);
    provideInto(scope, instance.id, work.above, definition.provides, self, own);
    sync(work, instance);
    const slots = definition.children[instance.state._tag] ?? {};
    for (const slot of definition.lasting)
      startHeld(instance, slot, slots, work.own);
    enter(work, instance);
  };

  /** Build a Provide over the Capabilities from above, once they exist, and hand the result on. */
  const provideInto = (
    scope: Scope.Scope,
    path: string,
    above: Deferred.Deferred<Context.Context<never>>,
    provide: Function | undefined,
    self: Work['self'],
    into: Deferred.Deferred<Context.Context<never>>,
  ) =>
    fork(
      scope,
      path,
      Deferred.await(above).pipe(
        Effect.flatMap((context) =>
          provide
            ? Layer.buildWithScope(
                provide(self) as Layer.Layer<never, never, any>,
                scope,
              ).pipe(
                Effect.provideContext(context),
                Effect.map((provided) => Context.merge(context, provided)),
              )
            : Effect.succeed(context),
        ),
        Effect.flatMap((below) => Deferred.succeed(into, below)),
      ) as Effect.Effect<unknown, never, never>,
    );

  /** Start the Instances held in one slot. */
  const startHeld = (
    instance: Instance,
    slot: string,
    slots: Readonly<Record<string, { readonly definition: Definition }>>,
    parent: Parent,
  ) => {
    const held = instance.children[slot];
    if (!held) return;
    const child = slots[slot]!.definition;
    for (const kid of isMany(held) ? held : [held]) start(kid, child, parent);
  };

  // 2. Enter
  const enter = (work: Work, instance: Instance): void => {
    const { definition } = work;
    const tag = instance.state._tag;
    const scope = Scope.forkUnsafe(work.scope);
    const capabilities = Deferred.makeUnsafe<Context.Context<never>>();
    work.state = { scope, capabilities };
    provideInto(
      scope,
      instance.id,
      work.own.capabilities,
      definition.stateProvides[tag],
      work.self,
      capabilities,
    );
    const slots = definition.children[tag] ?? {};
    for (const slot of Object.keys(instance.children))
      if (!definition.lasting.includes(slot))
        startHeld(instance, slot, slots, work.state);
  };

  // 3. Change
  const change = (instance: Instance): void => {
    const work = works.get(instance.id);
    if (!work) return;
    run(SubscriptionRef.set(work.data, dataOf(instance)));
    sync(work, instance);
  };

  /** Start the Workers whose keys appeared, and stop those whose keys went. */
  const sync = (work: Work, instance: Instance): void => {
    const data = dataOf(instance);
    for (const [name, worker] of Object.entries(work.definition.workers)) {
      const keys = new Set(worker.keys(data));
      let live = work.workers.get(name);
      if (!live) work.workers.set(name, (live = new Map()));
      for (const [key, entry] of live)
        if (!keys.has(key)) {
          live.delete(key);
          entry.closing = true;
          entry.fiber.interruptUnsafe();
        }
      for (const key of keys)
        if (!live.has(key))
          live.set(key, launch(work, instance.id, name, worker, key));
    }
  };

  /**
   * One Worker: its own Scope inside its fiber, so that whichever way it ends,
   * `closing` is set before its finalizers run and a Send from one dies.
   */
  const launch = (
    work: Work,
    id: string,
    name: string,
    worker: WorkerDefinition,
    key: string,
  ): Live => {
    const label = key === '' ? name : `${name}#${key}`;
    const entry: Live = {
      fiber: undefined!,
      closing: false,
      status: 'running',
    };
    const self: Work['self'] = {
      ...work.self,
      send: (message) =>
        Effect.suspend(() =>
          entry.closing
            ? Effect.die(
                new Error(
                  `[effect-oak] Worker ${label} of ${id} sent a Message after it stopped. Finalizers may not send.`,
                ),
              )
            : work.self.send(message),
        ),
    };
    const source: Source = {
      kind: 'worker',
      instance: id,
      name,
      ...(key === '' ? {} : { key }),
    };
    const scoped = Effect.suspend(() => {
      const scope = Scope.makeUnsafe();
      return (worker.run(self, key) as Effect.Effect<unknown, never, any>).pipe(
        Effect.provideService(Scope.Scope, scope),
        Effect.onExit((exit) => {
          entry.closing = true;
          entry.status =
            Exit.isFailure(exit) && !stopped(exit.cause)
              ? 'failed'
              : 'finished';
          return Scope.close(scope, exit);
        }),
      );
    });
    entry.fiber = fork(
      work.scope,
      `${id} worker ${label}`,
      withAbove(work.above, work.scope, source, scoped),
    );
    return entry;
  };

  // 4. Command
  const command = (
    instance: Instance,
    planned: ReadonlyArray<unknown>,
  ): void => {
    const work = works.get(instance.id);
    if (!work) return;
    for (const each of planned) {
      const { name, run: task } = each as {
        name: string;
        run: Effect.Effect<unknown, never, any>;
      };
      const effect = task.pipe(
        Effect.flatMap((result) =>
          isMessage(result) ? work.self.send(result) : Effect.void,
        ),
      );
      fork(
        work.scope,
        `${instance.id} command ${name}`,
        withAbove(
          work.above,
          work.scope,
          { kind: 'command', instance: instance.id, name },
          effect,
        ),
      );
    }
  };

  // 5. Stop
  const stop = (instance: Instance): void => {
    const work = works.get(instance.id);
    if (!work) return;
    forget(instance);
    close(work.scope);
  };

  /** Leave the current State: its Provides and its own Children stop. */
  const leave = (instance: Instance): void => {
    const work = works.get(instance.id);
    if (!work) return;
    forgetChildren(instance, work.definition.lasting);
    close(work.state.scope);
  };

  const forget = (instance: Instance) => {
    const work = works.get(instance.id);
    if (work)
      for (const live of work.workers.values())
        for (const entry of live.values()) entry.closing = true;
    works.delete(instance.id);
    forgetChildren(instance);
  };
  const forgetChildren = (
    instance: Instance,
    keep: ReadonlyArray<string> = [],
  ) => {
    for (const [slot, held] of Object.entries(instance.children))
      if (!keep.includes(slot))
        for (const kid of isMany(held) ? held : [held]) forget(kid);
  };
  const close = (scope: Scope.Closeable) => {
    Effect.runFork(Scope.close(scope, Exit.void));
  };

  return {
    start,
    enter: (instance: Instance) => {
      const work = works.get(instance.id);
      if (work) enter(work, instance);
    },
    change,
    command,
    stop,
    leave,
    /** Where the Children in a slot hang: at the top, or in the current State. */
    parentOf: (instance: Instance, slot: string): Parent | undefined => {
      const work = works.get(instance.id);
      return work?.definition.lasting.includes(slot) ? work.own : work?.state;
    },
    /** What an Instance's Workers are doing, by name and key. */
    workers: (instance: string): ReadonlyArray<WorkerStatus> => {
      const work = works.get(instance);
      if (!work) return [];
      const all: Array<WorkerStatus> = [];
      for (const [name, live] of work.workers)
        for (const [key, { status }] of live) all.push({ name, key, status });
      return all;
    },
  };
};

/**
 * Being stopped. In effect 4.0.0 an interrupted Stream of a SubscriptionRef's
 * changes ends in `Done` instead of an interrupt.
 */
const stopped = (cause: Cause.Cause<unknown>) =>
  Cause.hasInterruptsOnly(cause) || Pull.isDoneCause(cause);

const dataOf = (instance: Instance): Data<unknown, Tagged, unknown> => ({
  model: instance.model,
  state: instance.state,
  props: instance.props,
});

const isMessage = (value: unknown): value is Tagged =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Tagged)._tag === 'string';
