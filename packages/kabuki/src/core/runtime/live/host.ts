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
import type { Address, From, Instance } from '../../snapshot/index.ts';
import type { WorkFailure } from './work.ts';

/*
 * The Host: what the Runtime gives the Instances it runs, and an Instance's
 * own code made from it: its Self, and a way to run its Workers, Commands
 * and Provides as that Instance.
 */

/** What the Runtime gives the Instances it runs. */
export interface Host {
  /** Hand a Message to any Instance, through the one Mailbox. */
  readonly send: (to: Address, message: Tagged, from: From) => void;
  /** The app's Time. */
  readonly now: () => number;
  /** The Capabilities of the app's Layer. */
  readonly services: Context.Context<never>;
  /** Told of every failure of a Worker, Command, Provide or the app's Layer, for the Work report. */
  readonly failed: (failure: WorkFailure) => void;
}

/** Capabilities that may still be building: the ones from above, or the ones handed below. */
export type Services = Deferred.Deferred<Context.Context<never>>;

export type AnySelf = Self<unknown, Tagged, Tagged, unknown>;

/** The work running now, which `self.send` stamps as who Sent the Message. */
const Sending = Context.Reference<From | undefined>('@kestack/kabuki/Sending', {
  defaultValue: () => undefined,
});

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
    id: instance.address,
    // Outside any Worker or Command, what the Instance Provides Sent it.
    send: (message) =>
      Effect.flatMap(Effect.service(Sending), (from) =>
        Effect.sync(() =>
          host.send(
            instance.address,
            message,
            from ?? { kind: 'provides', instance: instance.address },
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
    from: Forked,
    effect: Effect.Effect<unknown, never, any>,
  ) =>
    forkIn(
      host,
      scope,
      `${instance.address} ${label}`,
      Effect.flatMap(Deferred.await(above), (services) =>
        effect.pipe(
          Effect.provideService(Sending, from),
          Effect.provideService(Scope.Scope, scope),
          Effect.provideContext(services),
        ),
      ) as Effect.Effect<unknown>,
      (failure) =>
        host.failed({
          address: instance.address,
          kind: from.kind,
          name: from.name,
          ...('key' in from && from.key !== undefined ? { key: from.key } : {}),
          failure,
          at: host.now(),
        }),
    );

  return {
    address: instance.address,
    self,
    /** The Capabilities from above, once built: what Workers, Commands and Queries run with. */
    above,
    /** The app's Time now. */
    now: host.now,
    set: (next: Instance) =>
      Effect.runSyncWith(host.services)(
        SubscriptionRef.set(data, dataOf(next)),
      ),
    fork,
  };
};

export type Own = ReturnType<typeof makeOwn>;

/** The work an Instance forks as itself, which Sends as that work. */
type Forked = Extract<From, { readonly kind: 'worker' | 'command' }>;

/** Run an Effect in a Scope, reporting any failure but being stopped to the console, and to `failed`. */
export const forkIn = (
  host: Host,
  scope: Scope.Scope,
  label: string,
  effect: Effect.Effect<unknown>,
  failed: (failure: string) => void,
) => {
  const fiber = Effect.runSyncWith(host.services)(Effect.forkIn(effect, scope));
  fiber.addObserver((exit) => {
    if (Exit.isFailure(exit) && !stopped(exit.cause)) {
      const failure = Cause.pretty(exit.cause);
      console.error(`[@kestack/kabuki] ${label} failed:\n${failure}`);
      failed(failure);
    }
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
