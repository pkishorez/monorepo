import {
  Context,
  Effect,
  Layer,
  ManagedRuntime,
  type Schema,
  Stream,
} from 'effect';
import { type RpcClient, RpcClient as Client, RpcSchema } from 'effect/rpc';
import { Authz } from '@kstackz/auth-toolkit/guard';
import type { ApiClients, Apis } from '../apis/index.ts';
import type { Backend } from '../host/index.ts';

interface PublicClient {
  readonly '@kstackz/web-platform/PublicClient': unique symbol;
}

type AnyCall = (...args: ReadonlyArray<unknown>) => unknown;

/**
 * Every API's client signed as nobody, on whichever Backend runs when a
 * call is made: a public call goes out as it is, and a guarded one fails
 * Unauthenticated without being sent. For calls outside `SignedIn`.
 */
export const publicClients = <A extends Apis>(
  apis: A,
  options: {
    readonly backend: () => Backend;
    readonly protocol: (
      backend: Backend,
      name: string,
    ) => Promise<Layer.Layer<RpcClient.Protocol>>;
  },
): ApiClients<A> => {
  // One client per Backend and API, made on its first call.
  const made = new Map<string, Promise<Record<string, AnyCall>>>();
  const clientOf = (name: string) => {
    const backend = options.backend();
    const key = `${backend}/${name}`;
    let client = made.get(key);
    if (client === undefined) {
      client = options.protocol(backend, name).then((protocol) => {
        const Key = Context.Service<PublicClient, Record<string, AnyCall>>(
          `@kstackz/web-platform/PublicClient/${key}`,
        );
        const runtime = ManagedRuntime.make(
          Layer.effect(
            Key,
            Client.make(apis[name]!.group) as unknown as Effect.Effect<
              Record<string, AnyCall>
            >,
          ).pipe(Layer.provide([protocol, Authz.bearer(() => null)])),
        );
        return runtime.runPromise(
          Effect.gen(function* () {
            return yield* Key;
          }),
        );
      });
      made.set(key, client);
    }
    return client;
  };

  return Object.fromEntries(
    Object.entries(apis).map(([name, { group }]) => {
      const calls = Object.fromEntries(
        [...group.requests.values()].map((rpc) => {
          const client = Effect.promise(() => clientOf(name));
          const call = RpcSchema.isStreamSchema(
            (rpc as unknown as { readonly successSchema: Schema.Top })
              .successSchema,
          )
            ? (...args: ReadonlyArray<unknown>) =>
                Stream.unwrap(
                  Effect.map(
                    client,
                    (made) =>
                      made[rpc._tag]!(...args) as Stream.Stream<unknown>,
                  ),
                )
            : (...args: ReadonlyArray<unknown>) =>
                Effect.flatMap(
                  client,
                  (made) =>
                    made[rpc._tag]!(...args) as Effect.Effect<unknown, unknown>,
                );
          return [rpc._tag, call];
        }),
      );
      return [name, calls];
    }),
  ) as unknown as ApiClients<A>;
};
