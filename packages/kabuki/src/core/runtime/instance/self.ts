import {
  Cause,
  Context,
  Deferred,
  Effect,
  Exit,
  Pull,
  Scope,
  SubscriptionRef,
} from 'effect';
import type { Data, Self, Tagged } from '../../actor/index.ts';
import type { Instance, Source } from '../../snapshot/index.ts';

/** What the Runtime gives the Instances it runs. */
export interface Host {
  /** Hand a Message to any Instance, through the one Mailbox. */
  readonly send: (instance: string, message: Tagged, source: Source) => void;
  /** The app's Time. */
  readonly now: () => number;
  /** The Capabilities of the app's Layer. */
  readonly services: Context.Context<never>;
}

/** Capabilities that may still be building: the ones from above, or the ones handed below. */
export type Services = Deferred.Deferred<Context.Context<never>>;

export type AnySelf = Self<unknown, Tagged, Tagged, unknown>;

/** The work running now, which `self.send` stamps as the Message's Source. */
const Sending = Context.Reference<Source | undefined>(
  '@kestack/kabuki/Sending',
  {
    defaultValue: () => undefined,
  },
);

/**
 * An Instance's own code: its Self, always reading its current data, and a
 * way to run its Workers, Commands and Provides as that Instance, once the
 * Capabilities from above are built.
 */
export const makeOwn = (instance: Instance, host: Host, above: Services) => {
  const data = Effect.runSyncWith(host.services)(
    SubscriptionRef.make(dataOf(instance)),
  );

  const self: AnySelf = {
    id: instance.id,
    // Outside any Worker or Command, what the Instance Provides Sent it.
    send: (message) =>
      Effect.flatMap(Effect.service(Sending), (source) =>
        Effect.sync(() =>
          host.send(
            instance.id,
            message,
            source ?? { kind: 'provide', instance: instance.id },
          ),
        ),
      ),
    get: SubscriptionRef.get(data),
    changes: SubscriptionRef.changes(data),
    now: Effect.sync(host.now),
  };

  const fork = (
    scope: Scope.Scope,
    label: string,
    source: Source,
    effect: Effect.Effect<unknown, never, any>,
  ) =>
    forkIn(
      host,
      scope,
      `${instance.id} ${label}`,
      Effect.flatMap(Deferred.await(above), (services) =>
        effect.pipe(
          Effect.provideService(Sending, source),
          Effect.provideService(Scope.Scope, scope),
          Effect.provideContext(services),
        ),
      ) as Effect.Effect<unknown>,
    );

  return {
    self,
    /** The Capabilities from above, once built: what Workers, Commands and Queries run with. */
    above,
    set: (next: Instance) =>
      Effect.runSyncWith(host.services)(
        SubscriptionRef.set(data, dataOf(next)),
      ),
    fork,
  };
};

export type Own = ReturnType<typeof makeOwn>;

/** Run an Effect in a Scope, reporting any failure but being stopped. */
export const forkIn = (
  host: Host,
  scope: Scope.Scope,
  label: string,
  effect: Effect.Effect<unknown>,
) => {
  const fiber = Effect.runSyncWith(host.services)(Effect.forkIn(effect, scope));
  fiber.addObserver((exit) => {
    if (Exit.isFailure(exit) && !stopped(exit.cause))
      console.error(
        `[@kestack/kabuki] ${label} failed:\n${Cause.pretty(exit.cause)}`,
      );
  });
  return fiber;
};

/**
 * Being stopped. In effect 4.0.0 an interrupted Stream of a SubscriptionRef's
 * changes ends in `Done` instead of an interrupt.
 */
export const stopped = (cause: Cause.Cause<unknown>) =>
  Cause.hasInterruptsOnly(cause) || Pull.isDoneCause(cause);

export const dataOf = ({
  model,
  state,
  props,
}: Instance): Data<unknown, Tagged, unknown> => ({ model, state, props });
