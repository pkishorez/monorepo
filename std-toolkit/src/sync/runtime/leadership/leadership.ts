import { Context, Effect, Layer, ManagedRuntime } from 'effect';

declare const LeadershipIdentityTypeId: unique symbol;

export type LeadershipIdentity = string & {
  readonly [LeadershipIdentityTypeId]: typeof LeadershipIdentityTypeId;
};

export type LeadershipRole =
  | { readonly _tag: 'Strategy'; readonly name: string }
  | { readonly _tag: 'CadenceRepair' };

type LeadershipServiceShape = {
  run: <A, E, R>(
    identity: LeadershipIdentity,
    effect: Effect.Effect<A, E, R>,
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
  readonly collectionName: string;
  readonly partitionKey: string;
  readonly role: LeadershipRole;
}): LeadershipIdentity =>
  `std-sync/leadership/v1/${JSON.stringify([
    input.collectionName,
    input.partitionKey,
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
    run: (identity, effect) =>
      runtime.contextEffect.pipe(
        Effect.flatMap((context) =>
          Context.get(context, LeadershipService).run(identity, effect),
        ),
      ),
    dispose: () => runtime.dispose(),
  };
};
