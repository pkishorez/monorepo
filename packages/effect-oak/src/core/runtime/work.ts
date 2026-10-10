import {
  Cause,
  Context,
  Deferred,
  Effect,
  Exit,
  Layer,
  Scope,
  SubscriptionRef,
} from 'effect';
import type { Fiber } from 'effect';
import type { Data, Definition, Self, Tagged } from '../actor/index.ts';
import { isMany } from '../snapshot/index.ts';
import type { Instance } from '../snapshot/index.ts';

/*
 * The work of every live Instance, in nested Scopes: the live app's Scope
 * holds the root's, an Instance's holds its State's, and a State's holds its
 * Children's. Closing a Scope stops everything below it, children first.
 *
 * 1. Start   an Instance: its Scope, its `self`, its `'*'` Lifetime, and its
 *            State.
 * 2. Enter   a State: its Scope, the Layer it Provides, its Lifetime, and its
 *            Children. Work waits for the Capabilities from above, so starting
 *            never blocks.
 * 3. Change  tells the Instance's own work its new data.
 * 4. Command runs work an Update asked for, in the Instance's Scope, under a
 *            key if it has one.
 * 5. Stop    an Instance, or leave its State: close the Scope.
 */

/** Where an Instance hangs: the Scope it lives in and the Capabilities it gets. */
interface Parent {
  readonly scope: Scope.Scope;
  readonly capabilities: Deferred.Deferred<Context.Context<never>>;
}

/** One live Instance's work. */
interface Work {
  readonly definition: Definition;
  readonly scope: Scope.Closeable;
  readonly above: Deferred.Deferred<Context.Context<never>>;
  readonly data: SubscriptionRef.SubscriptionRef<Data<unknown, Tagged>>;
  readonly self: Self<unknown, Tagged, Tagged>;
  readonly commands: Map<string, Fiber.Fiber<unknown, unknown>>;
  /** The current State's Scope, and what its Children get. */
  state: Parent & { readonly scope: Scope.Closeable };
}

export type Works = ReturnType<typeof makeWorks>;

/**
 * The work of one live run of the app. `services` are the Layer's, `send`
 * hands a Message to the mailbox.
 */
export const makeWorks = (
  services: Context.Context<never>,
  send: (instance: string, message: Tagged) => void,
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
      if (Exit.isFailure(exit) && !Cause.hasInterruptsOnly(exit.cause))
        console.error(
          `[effect-oak] ${path} failed:\n${Cause.pretty(exit.cause)}`,
        );
    });
    return fiber;
  };

  /** Run work with the Capabilities from above once they exist, and a Scope. */
  const withAbove = (
    above: Deferred.Deferred<Context.Context<never>>,
    scope: Scope.Scope,
    effect: Effect.Effect<unknown, never, any>,
  ) =>
    Deferred.await(above).pipe(
      Effect.flatMap((capabilities) =>
        effect.pipe(
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
      SubscriptionRef.make<Data<unknown, Tagged>>({
        model: instance.model,
        state: instance.state,
      }),
    );
    const self: Work['self'] = {
      id: instance.id,
      send: (message) => Effect.sync(() => send(instance.id, message)),
      get: SubscriptionRef.get(data),
      changes: SubscriptionRef.changes(data),
    };
    const work: Work = {
      definition,
      scope,
      above: parent.capabilities,
      data,
      self,
      commands: new Map(),
      state: undefined!,
    };
    works.set(instance.id, work);
    const always = definition.lifetime['*'];
    if (always)
      fork(scope, instance.id, withAbove(work.above, scope, always(self)));
    enter(work, instance);
  };

  // 2. Enter
  const enter = (work: Work, instance: Instance): void => {
    const { definition } = work;
    const tag = instance.state._tag;
    const scope = Scope.forkUnsafe(work.scope);
    const capabilities = Deferred.makeUnsafe<Context.Context<never>>();
    work.state = { scope, capabilities };

    const provide = definition.provides[tag];
    fork(
      scope,
      instance.id,
      Deferred.await(work.above).pipe(
        Effect.flatMap((above) =>
          provide
            ? Layer.buildWithScope(
                provide(work.self) as Layer.Layer<never, never, any>,
                scope,
              ).pipe(
                Effect.provideContext(above),
                Effect.map((provided) => Context.merge(above, provided)),
              )
            : Effect.succeed(above),
        ),
        Effect.flatMap((below) => Deferred.succeed(capabilities, below)),
      ) as Effect.Effect<unknown, never, never>,
    );
    const lifetime = definition.lifetime[tag];
    if (lifetime)
      fork(
        scope,
        instance.id,
        withAbove(work.above, scope, lifetime(work.self)),
      );

    const slots = definition.children[tag] ?? {};
    for (const [slot, held] of Object.entries(instance.children)) {
      const child = slots[slot]!.definition;
      for (const kid of isMany(held) ? held : [held])
        start(kid, child, work.state);
    }
  };

  // 3. Change
  const change = (instance: Instance): void => {
    const work = works.get(instance.id);
    if (work)
      run(
        SubscriptionRef.set(work.data, {
          model: instance.model,
          state: instance.state,
        }),
      );
  };

  // 4. Command
  const command = (
    instance: Instance,
    planned: unknown,
    cancel: ReadonlyArray<string>,
  ): void => {
    const work = works.get(instance.id);
    if (!work) return;
    for (const key of cancel) {
      work.commands.get(key)?.interruptUnsafe();
      work.commands.delete(key);
    }
    if (planned === undefined) return;
    const { key, run: task } = keyed(planned);
    const effect = (
      (Effect.isEffect(task)
        ? task
        : Effect.scoped(
            (
              task as (self: Work['self']) => Effect.Effect<unknown, never, any>
            )(work.self),
          )) as Effect.Effect<unknown, never, any>
    ).pipe(
      Effect.flatMap((result) =>
        isMessage(result) ? work.self.send(result) : Effect.void,
      ),
    );
    const fiber = fork(
      work.scope,
      instance.id,
      withAbove(work.above, work.scope, effect),
    );
    if (key === undefined) return;
    work.commands.get(key)?.interruptUnsafe();
    work.commands.set(key, fiber);
    fiber.addObserver(() => {
      if (work.commands.get(key) === fiber) work.commands.delete(key);
    });
  };

  // 5. Stop
  const stop = (instance: Instance): void => {
    const work = works.get(instance.id);
    if (!work) return;
    forget(instance);
    close(work.scope);
  };

  /** Leave the current State: its Lifetime, Provides and Children stop. */
  const leave = (instance: Instance): void => {
    const work = works.get(instance.id);
    if (!work) return;
    forgetChildren(instance);
    close(work.state.scope);
  };

  const forget = (instance: Instance) => {
    works.delete(instance.id);
    forgetChildren(instance);
  };
  const forgetChildren = (instance: Instance) => {
    for (const held of Object.values(instance.children))
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
    /** Where the Children of an Instance's current State hang. */
    parentOf: (instance: Instance): Parent | undefined =>
      works.get(instance.id)?.state,
  };
};

const keyed = (
  planned: unknown,
): { readonly key: string | undefined; readonly run: unknown } =>
  !Effect.isEffect(planned) &&
  typeof planned === 'object' &&
  planned !== null &&
  'run' in planned
    ? (planned as { key: string; run: unknown })
    : { key: undefined, run: planned };

const isMessage = (value: unknown): value is Tagged =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as Tagged)._tag === 'string';
