import {
  Context,
  Effect,
  Layer,
  Option,
  type Schema,
  type Scope,
} from 'effect';
import { Rpc, RpcGroup, RpcMiddleware } from 'effect/unstable/rpc';

type Identifier<K> = K extends { readonly Identifier: infer I } ? I : never;
type Shape<K> = K extends { readonly Service: infer S } ? S : never;
type Provided<P> = [P] extends [never] ? void : Shape<P>;
type AnyKey = Context.Key<any, any>;

export interface Options<
  Provides extends AnyKey,
  Requires extends AnyKey,
  E extends Schema.Top,
  Client extends boolean,
> {
  readonly provides?: Provides;
  readonly requires?: Requires;
  readonly error?: E;
  readonly client?: Client;
}

export type Id<
  Name extends string,
  Provides extends AnyKey,
  Requires extends AnyKey,
  E extends Schema.Top,
  Client extends boolean,
> = Instance<
  RpcMiddleware.ServiceClass<
    unknown,
    Name,
    Identifier<Provides>,
    E,
    never,
    Identifier<Requires>,
    Client
  >
>;

type Instance<C> = C extends { new (_: never): infer I } ? I : never;

export type Middleware<
  Name extends string,
  Provides extends AnyKey,
  Requires extends AnyKey,
  E extends Schema.Top,
  Client extends boolean,
> = RpcMiddleware.ServiceClass<
  Id<Name, Provides, Requires, E, Client>,
  Name,
  Identifier<Provides>,
  E,
  never,
  Identifier<Requires>,
  Client
>;

export interface ValueId<Name extends string> {
  readonly cannotation: Name;
}

type Native = Parameters<RpcMiddleware.RpcMiddleware<never, never, never>>[1];

export interface ServerOptions<V> extends Native {
  readonly value: Option.Option<V>;
}

export type ServerImpl<
  V,
  Provides extends AnyKey,
  Requires extends AnyKey,
  E extends Schema.Top,
> = (
  options: ServerOptions<V>,
) => Effect.Effect<
  Provided<Provides>,
  E['Type'],
  Identifier<Requires> | Scope.Scope
>;

export type ClientImpl<
  E extends Schema.Top,
  R,
> = RpcMiddleware.RpcMiddlewareClient<E['Type'], never, R>;

export type Target = Rpc.Any | RpcGroup.Any;

export type With<T, M extends RpcMiddleware.AnyService> =
  T extends RpcGroup.RpcGroup<infer A>
    ? RpcGroup.RpcGroup<Rpc.AddMiddleware<A, M>>
    : T extends Rpc.Any
      ? Rpc.AddMiddleware<T, M>
      : never;

export interface Cannotation<
  Name extends string,
  V,
  Provides extends AnyKey,
  Requires extends AnyKey,
  E extends Schema.Top,
  Client extends boolean,
> {
  readonly middleware: Middleware<Name, Provides, Requires, E, Client>;
  readonly value: Context.Key<ValueId<Name>, V>;
  readonly with: (
    value?: V,
  ) => <T extends Target>(
    target: T,
  ) => With<T, Middleware<Name, Provides, Requires, E, Client>>;
  readonly get: (target: Annotated) => Option.Option<V>;
  readonly layer: <EX = never, RX = never>(
    server:
      | ServerImpl<V, Provides, Requires, E>
      | Effect.Effect<ServerImpl<V, Provides, Requires, E>, EX, RX>,
  ) => Layer.Layer<Id<Name, Provides, Requires, E, Client>, EX, RX>;
  readonly clientLayer: <R = never, EX = never, RX = never>(
    client: ClientImpl<E, R> | Effect.Effect<ClientImpl<E, R>, EX, RX>,
  ) => Layer.Layer<
    RpcMiddleware.ForClient<Id<Name, Provides, Requires, E, Client>>,
    EX,
    R | Exclude<RX, Scope.Scope>
  >;
}

interface Annotated {
  readonly annotations: Context.Context<never>;
}

export const make =
  <V>() =>
  <
    const Name extends string,
    Provides extends AnyKey = never,
    Requires extends AnyKey = never,
    E extends Schema.Top = Schema.Never,
    const Client extends boolean = false,
  >(
    id: Name,
    options?: Options<Provides, Requires, E, Client>,
  ): Cannotation<Name, V, Provides, Requires, E, Client> => {
    type M = Middleware<Name, Provides, Requires, E, Client>;

    const middleware: M = RpcMiddleware.Service<
      Id<Name, Provides, Requires, E, Client>,
      { provides: Identifier<Provides>; requires: Identifier<Requires> }
    >()(id, {
      error: options?.error,
      requiredForClient: options?.client,
    });
    const value = Context.Service<ValueId<Name>, V>(`${id}/value`);
    const provides = options?.provides;

    const get = (target: Annotated) =>
      Context.getOption(target.annotations, value);

    const withValue =
      (v?: V) =>
      (target: Target): any => {
        if (Rpc.isRpc(target)) {
          const rpc = v === undefined ? target : target.annotate(value, v);
          return rpc.middleware(middleware);
        }

        const group = target as RpcGroup.RpcGroup<Rpc.Any>;
        if (v === undefined) {
          return group.middleware(middleware);
        }

        const rpcs = Array.from(group.requests.values(), (rpc) =>
          Option.isSome(get(rpc))
            ? rpc
            : (rpc as Rpc.Rpc<string>).annotate(value, v),
        );
        return RpcGroup.make(...rpcs)
          .annotateMerge(group.annotations)
          .middleware(middleware);
      };

    const layer = (
      server:
        | ServerImpl<V, Provides, Requires, E>
        | Effect.Effect<ServerImpl<V, Provides, Requires, E>, any, any>,
    ) =>
      Layer.effect(
        middleware,
        Effect.map(
          Effect.isEffect(server) ? server : Effect.succeed(server),
          (impl) =>
            middleware.of(((effect, native) =>
              Effect.flatMap(
                impl({ ...native, value: get(native.rpc) }),
                (provided) =>
                  provides === undefined
                    ? effect
                    : Effect.provideService(effect, provides, provided),
              )) as M['Service']),
        ),
      );

    const clientLayer = (
      client: ClientImpl<E, any> | Effect.Effect<ClientImpl<E, any>, any, any>,
    ) => RpcMiddleware.layerClient(middleware, client);

    return {
      middleware,
      value,
      with: withValue,
      get,
      layer,
      clientLayer,
    } as Cannotation<Name, V, Provides, Requires, E, Client>;
  };

export const Cannotation = { make };
