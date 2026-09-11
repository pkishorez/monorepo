import { Context, Effect, Layer, Option } from 'effect';
import * as Provider from 'alchemy/Provider';
import { Resource } from 'alchemy/Resource';

export type Forgotten = readonly { id: string; type: string }[];

// Console has no provider for these types. A forget-only provider lets Alchemy
// drop the state row through its normal delete path while leaving whatever the
// resource created untouched.
export const providers = (types: readonly string[]) =>
  [...new Set(types)].reduce<Layer.Layer<never>>(
    (layer, type) =>
      Layer.merge(
        layer,
        Provider.succeed(Resource<Resource<string>>(type), {
          reconcile: () =>
            Effect.die(`Console cannot create or update ${type}.`),
          delete: () => Effect.void,
          read: () => Effect.succeed(undefined),
        }) as Layer.Layer<never>,
      ),
    Layer.empty,
  );

// The user chose to forget specific resources of a type Console can delete.
// Shadow that type's real provider: forgotten rows skip the cloud call and
// only lose their state; every other row of the type still deletes for real.
// The shadow is mode-agnostic, so a row stamped `local` resolves to it too.
export const shadows = (forgotten: Forgotten) => {
  const byType = new Map<string, Set<string>>();
  for (const entry of forgotten) {
    const fqns = byType.get(entry.type) ?? new Set<string>();
    fqns.add(entry.id);
    byType.set(entry.type, fqns);
  }
  return [...byType].reduce<Layer.Layer<never>>(
    (layer, [type, fqns]) =>
      Layer.merge(
        layer,
        Layer.effect(
          Provider.Provider<Resource<string>>(
            type,
          ) as unknown as Context.Service<
            unknown,
            Provider.ProviderService<Resource<string>>
          >,
          Effect.gen(function* () {
            const live = yield* Provider.tryFindProviderByType(type, 'live');
            const real = Option.getOrUndefined(live);
            return {
              ...real,
              mode: undefined,
              modes: undefined,
              reconcile: (input) =>
                real
                  ? real.reconcile(input)
                  : Effect.die(`Console cannot create or update ${type}.`),
              read: (input) =>
                real?.read ? real.read(input) : Effect.succeed(undefined),
              delete: (input) =>
                fqns.has(input.fqn) || !real ? Effect.void : real.delete(input),
            } as Provider.ProviderService<Resource<string>>;
          }),
        ) as Layer.Layer<never>,
      ),
    Layer.empty,
  );
};
