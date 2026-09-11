import { Effect, Layer } from 'effect';
import * as Provider from 'alchemy/Provider';
import { Resource } from 'alchemy/Resource';

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
