import {
  Context,
  Effect,
  Layer,
  Option,
  type Schema,
  type Scope,
} from 'effect';
import { HttpServerRequest, type HttpRouter } from 'effect/unstable/http';
import {
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  type HttpApiSecurity,
} from 'effect/unstable/httpapi';

type Identifier<K> = K extends { readonly Identifier: infer I } ? I : never;
type Shape<K> = K extends { readonly Service: infer S } ? S : never;
type Provided<P> = [P] extends [never] ? void : Shape<P>;
type AnyKey = Context.Key<any, any>;
type AnyError = Schema.Top | ReadonlyArray<Schema.Top>;
type AnySecurity = Record<string, HttpApiSecurity.HttpApiSecurity>;
type ErrorType<E> =
  E extends ReadonlyArray<Schema.Top>
    ? E[number]['Type']
    : E extends Schema.Top
      ? E['Type']
      : never;

export interface Options<
  Provides extends AnyKey,
  Requires extends AnyKey,
  E extends AnyError,
  Client extends boolean,
  Security extends AnySecurity,
> {
  readonly provides?: Provides;
  readonly requires?: Requires;
  readonly error?: E;
  readonly client?: Client;
  readonly security?: Security;
}

interface Config<
  Provides extends AnyKey,
  Requires extends AnyKey,
  E extends AnyError,
  Client extends boolean,
  Security extends AnySecurity,
> {
  requires: Identifier<Requires>;
  provides: Identifier<Provides>;
  error: E;
  clientError: never;
  requiredForClient: Client;
  security: Security;
}

export type Id<
  Name extends string,
  Provides extends AnyKey,
  Requires extends AnyKey,
  E extends AnyError,
  Client extends boolean,
  Security extends AnySecurity,
> = Instance<
  HttpApiMiddleware.ServiceClass<
    unknown,
    Name,
    Config<Provides, Requires, E, Client, Security>
  >
>;

type Instance<C> = C extends { new (_: never): infer I } ? I : never;

export type Middleware<
  Name extends string,
  Provides extends AnyKey,
  Requires extends AnyKey,
  E extends AnyError,
  Client extends boolean,
  Security extends AnySecurity,
> = HttpApiMiddleware.ServiceClass<
  Id<Name, Provides, Requires, E, Client, Security>,
  Name,
  Config<Provides, Requires, E, Client, Security>
>;

export interface ValueId<Name extends string> {
  readonly cannotation: Name;
}

type Credential<Security extends AnySecurity> = [Security] extends [never]
  ? {}
  : {
      readonly credential: HttpApiSecurity.HttpApiSecurity.Type<
        Security[keyof Security]
      >;
    };

export type ServerOptions<V, Security extends AnySecurity> = {
  readonly value: Option.Option<V>;
  readonly endpoint: HttpApiEndpoint.Top;
  readonly group: HttpApiGroup.Top;
  readonly request: HttpServerRequest.HttpServerRequest;
} & Credential<Security>;

export type ServerImpl<
  V,
  Provides extends AnyKey,
  Requires extends AnyKey,
  E extends AnyError,
  Security extends AnySecurity,
> = (
  options: ServerOptions<V, Security>,
) => Effect.Effect<
  Provided<Provides>,
  ErrorType<E>,
  Identifier<Requires> | HttpRouter.Provided
>;

export type ClientImpl<
  E extends AnyError,
  R,
> = HttpApiMiddleware.HttpApiMiddlewareClient<ErrorType<E>, never, R>;

export type Target = HttpApiEndpoint.Constraint | HttpApiGroup.Constraint;

export type With<
  T,
  I extends HttpApiMiddleware.AnyId,
> = T extends HttpApiGroup.Constraint
  ? HttpApiGroup.AddMiddleware<T, I>
  : T extends HttpApiEndpoint.Constraint
    ? HttpApiEndpoint.AddMiddleware<T, I>
    : never;

export interface Cannotation<
  Name extends string,
  V,
  Provides extends AnyKey,
  Requires extends AnyKey,
  E extends AnyError,
  Client extends boolean,
  Security extends AnySecurity,
> {
  readonly middleware: Middleware<
    Name,
    Provides,
    Requires,
    E,
    Client,
    Security
  >;
  readonly value: Context.Key<ValueId<Name>, V>;
  readonly with: (
    value?: V,
  ) => <T extends Target>(
    target: T,
  ) => With<T, Id<Name, Provides, Requires, E, Client, Security>>;
  readonly get: (target: Annotated) => Option.Option<V>;
  readonly layer: <EX = never, RX = never>(
    server:
      | ServerImpl<V, Provides, Requires, E, Security>
      | Effect.Effect<ServerImpl<V, Provides, Requires, E, Security>, EX, RX>,
  ) => Layer.Layer<Id<Name, Provides, Requires, E, Client, Security>, EX, RX>;
  readonly clientLayer: <R = never, EX = never, RX = never>(
    client: ClientImpl<E, R> | Effect.Effect<ClientImpl<E, R>, EX, RX>,
  ) => Layer.Layer<
    HttpApiMiddleware.ForClient<
      Id<Name, Provides, Requires, E, Client, Security>
    >,
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
    const E extends AnyError = never,
    const Client extends boolean = false,
    const Security extends AnySecurity = never,
  >(
    id: Name,
    options?: Options<Provides, Requires, E, Client, Security>,
  ): Cannotation<Name, V, Provides, Requires, E, Client, Security> => {
    type M = Middleware<Name, Provides, Requires, E, Client, Security>;

    const middleware = HttpApiMiddleware.Service<
      Id<Name, Provides, Requires, E, Client, Security>,
      { provides: Identifier<Provides>; requires: Identifier<Requires> }
    >()(id, {
      error: options?.error,
      security: options?.security,
      requiredForClient: options?.client,
    }) as M;
    const value = Context.Service<ValueId<Name>, V>(`${id}/value`);
    const provides = options?.provides;
    const security = options?.security;

    const get = (target: Annotated) =>
      Context.getOption(target.annotations, value);

    const withValue =
      (v?: V) =>
      (target: Target): any => {
        if (HttpApiEndpoint.isHttpApiEndpoint(target)) {
          const endpoint = v === undefined ? target : target.annotate(value, v);
          return endpoint.middleware(middleware);
        }

        const group = target as HttpApiGroup.Top;
        const endpoints = Object.values(group.endpoints).map((endpoint) =>
          v === undefined || Option.isSome(get(endpoint))
            ? endpoint
            : endpoint.annotate(value, v),
        );
        return HttpApiGroup.make(group.identifier, { topLevel: group.topLevel })
          .add(
            ...(endpoints as [HttpApiEndpoint.Top, ...HttpApiEndpoint.Top[]]),
          )
          .annotateMerge(group.annotations)
          .middleware(middleware);
      };

    const layer = (
      server:
        | ServerImpl<V, Provides, Requires, E, Security>
        | Effect.Effect<
            ServerImpl<V, Provides, Requires, E, Security>,
            any,
            any
          >,
    ) =>
      Layer.effect(
        middleware,
        Effect.map(
          Effect.isEffect(server) ? server : Effect.succeed(server),
          (impl) => {
            const wrap =
              (credential?: unknown) =>
              (
                httpEffect: Effect.Effect<any, any, any>,
                native: {
                  readonly endpoint: HttpApiEndpoint.Top;
                  readonly group: HttpApiGroup.Top;
                },
              ) =>
                Effect.gen(function* () {
                  const request = yield* HttpServerRequest.HttpServerRequest;
                  const provided = yield* impl({
                    ...native,
                    request,
                    credential,
                    value: get(native.endpoint),
                  } as ServerOptions<V, Security>);
                  return yield* provides === undefined
                    ? httpEffect
                    : Effect.provideService(httpEffect, provides, provided);
                });

            const service =
              security === undefined
                ? wrap()
                : Object.fromEntries(
                    Object.keys(security).map((scheme) => [
                      scheme,
                      (httpEffect: Effect.Effect<any, any, any>, native: any) =>
                        wrap(native.credential)(httpEffect, native),
                    ]),
                  );
            return middleware.of(service as M['Service']);
          },
        ),
      );

    const clientLayer = (
      client: ClientImpl<E, any> | Effect.Effect<ClientImpl<E, any>, any, any>,
    ) => HttpApiMiddleware.layerClient(middleware, client);

    return {
      middleware,
      value,
      with: withValue,
      get,
      layer,
      clientLayer,
    } as Cannotation<Name, V, Provides, Requires, E, Client, Security>;
  };

export const Cannotation = { make };
