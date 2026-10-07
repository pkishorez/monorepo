import { Effect, Layer } from 'effect';
import {
  FetchHttpClient,
  Headers,
  HttpClient,
  HttpClientRequest,
  HttpEffect,
  type HttpServerRequest,
  type HttpServerResponse,
} from 'effect/http';
import {
  type Rpc,
  RpcClient,
  type RpcGroup,
  RpcSerialization,
  RpcServer,
} from 'effect/rpc';
import type { Scope } from 'effect/Scope';

/**
 * The `RpcClient.Protocol` for `group` over HTTP: each batch of calls is one
 * POST to `url`, answered as NDJSON, with `fetch` underneath. Build the client
 * on top with `RpcClient.make(group)`.
 *
 * `credentials` is the `fetch` option (`'omit'` keeps the browser's cookies
 * off a call that carries its own token); `headers` go on every request.
 */
export const client = <Rpcs extends Rpc.Any>(
  _group: RpcGroup.RpcGroup<Rpcs>,
  options: {
    readonly url: string;
    readonly credentials?: RequestCredentials | undefined;
    readonly headers?: Headers.Input | undefined;
  },
): Layer.Layer<RpcClient.Protocol> => {
  const headers = options.headers;
  return RpcClient.layerProtocolHttp({
    url: options.url,
    ...(headers !== undefined && {
      transformClient: HttpClient.mapRequest(
        HttpClientRequest.setHeaders(Headers.fromInput(headers)),
      ),
    }),
  }).pipe(
    Layer.provide([
      options.credentials === undefined
        ? FetchHttpClient.layer
        : FetchHttpClient.layer.pipe(
            Layer.provide(
              Layer.succeed(FetchHttpClient.RequestInit, {
                credentials: options.credentials,
              }),
            ),
          ),
      RpcSerialization.layerNdjson,
    ]),
  );
};

/** What answering one request takes: the response, needing the request. */
type App = Effect.Effect<
  HttpServerResponse.HttpServerResponse,
  never,
  HttpServerRequest.HttpServerRequest | Scope
>;

interface ServerOptions<R> {
  /**
   * What `handlers` stand on, built for this request alone, such as a
   * database binding from the request's environment.
   */
  readonly services?: (request: Request) => Layer.Layer<R, unknown>;
  /**
   * Wraps the answering of every request, such as reading a sign-in cookie
   * into the request before handlers run and writing a refreshed one after.
   */
  readonly wrap?: (app: App) => App;
}

/**
 * Answers one request with `group` over HTTP, the way {@link client} calls
 * it: a POST, NDJSON, batched. Any other method is a 405.
 *
 * `handlers` (the group's handlers and server middleware) and `services` are
 * built fresh for the request and live as long as its response, which a
 * streamed body outlives; so whatever a request opens ends with it. Runs on
 * any platform that speaks `Request` and `Response`.
 */
export const server =
  <Rpcs extends Rpc.Any, R = never>(
    group: RpcGroup.RpcGroup<Rpcs>,
    handlers: Layer.Layer<
      Rpc.ToHandler<Rpcs> | Rpc.Middleware<Rpcs> | Rpc.ServicesServer<Rpcs>,
      unknown,
      R
    >,
    ...[options]: [R] extends [never]
      ? [options?: ServerOptions<never>]
      : [options: ServerOptions<R> & { readonly services: unknown }]
  ) =>
  (request: Request): Promise<Response> => {
    if (request.method !== 'POST') {
      return Promise.resolve(
        new Response('Method not allowed', {
          status: 405,
          headers: { Allow: 'POST' },
        }),
      );
    }

    const services = options?.services;
    const wrap = options?.wrap ?? ((app: App) => app);
    const dependencies = Layer.mergeAll(
      services === undefined
        ? (handlers as Layer.Layer<Rpc.ToHandler<Rpcs>, unknown>)
        : handlers.pipe(Layer.provide(services(request) as Layer.Layer<R>)),
      RpcSerialization.layerNdjson,
    );

    let dispose!: () => Promise<void>;
    const app = Effect.gen(function* () {
      const scope = yield* Effect.scope;
      yield* Effect.addFinalizer(() =>
        Effect.yieldNow.pipe(Effect.andThen(Effect.promise(() => dispose()))),
      );
      const context = yield* Layer.buildWithScope(
        Layer.fresh(dependencies),
        scope,
      ).pipe(Effect.orDie);
      const served = Effect.gen(function* () {
        const rpc = yield* RpcServer.toHttpEffect(group);
        return yield* wrap(rpc).pipe(Effect.interruptible);
      }).pipe(Effect.provide(context));
      // `context` holds every service `group` needs; TypeScript can't see it
      // through the generic `Rpcs`.
      return yield* served as Effect.Effect<
        HttpServerResponse.HttpServerResponse,
        never,
        never
      >;
    });
    const web = HttpEffect.toWebHandlerLayer(app, Layer.empty);
    dispose = web.dispose;
    return web.handler(request).catch(async (error) => {
      await web.dispose();
      throw error;
    });
  };
