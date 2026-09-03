import { Context, Effect, Layer, ManagedRuntime } from 'effect';
import type { Brand } from '../../domain/identity/index.js';

export type LeadershipIdentity = string & Brand<'LeadershipIdentity'>;

export type LeadershipRole =
  | { readonly _tag: 'Strategy'; readonly name: string }
  | { readonly _tag: 'CadenceRepair' }
  | { readonly _tag: 'OutboxDrain' };

export type LeadershipObserver = {
  readonly requested: Effect.Effect<void>;
  readonly acquired: Effect.Effect<void>;
  readonly released: Effect.Effect<void>;
};

type LeadershipServiceShape = {
  run: <A, E, R>(
    identity: LeadershipIdentity,
    effect: Effect.Effect<A, E, R>,
    observer?: LeadershipObserver,
  ) => Effect.Effect<A, E, R>;
};

export class LeadershipService extends Context.Service<
  LeadershipService,
  LeadershipServiceShape
>()('std-toolkit/sync/Leadership') {}

export type LeadershipLayer = Layer.Layer<LeadershipService>;

export type Leadership = LeadershipServiceShape & {
  dispose: () => Promise<void>;
};

export const leadershipIdentity = (input: {
  readonly scope: readonly string[];
  readonly role: LeadershipRole;
}): LeadershipIdentity =>
  `std-sync/leadership/v1/${JSON.stringify([
    ...input.scope,
    input.role._tag,
    input.role._tag === 'Strategy' ? input.role.name : null,
  ])}` as LeadershipIdentity;

export const makeLeadership = (
  layer: LeadershipLayer | undefined,
): Leadership => {
  if (layer === undefined) {
    return {
      run: (_identity, effect) => effect,
      dispose: () => Promise.resolve(),
    };
  }

  const runtime = ManagedRuntime.make(layer);
  return {
    run: (identity, effect, observer) =>
      runtime.contextEffect.pipe(
        Effect.flatMap((context) =>
          Context.get(context, LeadershipService).run(
            identity,
            effect,
            observer,
          ),
        ),
      ),
    dispose: () => runtime.dispose(),
  };
};
