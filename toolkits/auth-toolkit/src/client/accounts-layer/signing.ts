import { Rpc } from '@kestack/rpc-toolkit/rpc';
import { Effect, Exit, Layer, Option, Predicate } from 'effect';
import {
  FetchHttpClient,
  Headers,
  HttpClientRequest,
  HttpClientResponse,
} from 'effect/http';
import {
  httpMiddleware,
  rpcMiddleware,
  type Signature,
  type Unauthenticated,
} from '../../guard/index.js';

const statusOf = { AccountChanged: 409, Unauthenticated: 401 } as const;

export interface SigningOptions {
  /** The headers each guarded call is signed with. */
  readonly signature: Signature<never>;
  /** The failure meaning this client's idea of who is signed in is stale. */
  readonly refused: keyof typeof statusOf;
  /** Run before a refused call's failure reaches its caller. */
  readonly recheck: Effect.Effect<unknown, unknown>;
  /** Send the browser's cookies on every guarded call made with `fetch`. */
  readonly cookie?: boolean;
}

/** Gives a call `credentials: 'include'` over any other fetch options. */
const withCookie = <A, E, R>(send: Effect.Effect<A, E, R>) =>
  Effect.flatMap(Effect.serviceOption(FetchHttpClient.RequestInit), (init) =>
    Effect.provideService(send, FetchHttpClient.RequestInit, {
      ...Option.getOrUndefined(init),
      credentials: 'include',
    }),
  );

/** The answer to an HttpApi call that was not signed, given without
 * sending it: what the server answers a call nobody signed. */
const unsignedAnswer = (
  request: HttpClientRequest.HttpClientRequest,
  { reason }: Unauthenticated,
) =>
  HttpClientResponse.fromWeb(
    request,
    Response.json({ _tag: 'Unauthenticated', reason }, { status: 401 }),
  );

/** The Guard's client halves, for Effect RPC and Effect HttpApi: each guarded
 * call gets `signature`'s headers, and the cookie when `cookie` is set, so the
 * app's transport needs no fetch options of its own.
 *
 * A call failing `refused` runs `recheck` before its failure reaches the
 * caller: over RPC by the call's Exit, over HttpApi by its status. A call
 * `signature` refuses is never sent: over HttpApi, whose client middleware
 * cannot fail typed, it is answered here with the 401 the server would
 * give, so the caller fails Unauthenticated.
 *
 * `signature` and `recheck` run in the context this Layer was built in, not
 * the caller's, so the Auth Worker is reached the same way whoever calls. */
export const signing = ({
  signature,
  refused,
  recheck,
  cookie = false,
}: SigningOptions) =>
  Layer.unwrap(
    Effect.gen(function* () {
      const context = yield* Effect.context<never>();
      const signed = Effect.provideContext(signature, context);
      const check = Effect.ignore(Effect.provideContext(recheck, context));
      const send = cookie
        ? withCookie
        : <A, E, R>(effect: Effect.Effect<A, E, R>) => effect;

      const isRefused = (exit: Exit.Exit<unknown, unknown>) => {
        const error = Exit.findErrorOption(exit);
        return Option.isSome(error) && Predicate.isTagged(error.value, refused);
      };

      return Layer.mergeAll(
        rpcMiddleware.client(({ request, next }) =>
          Effect.flatMap(signed, (headers) =>
            send(
              next({
                ...request,
                headers: Headers.setAll(request.headers, headers),
              }),
            ).pipe(
              Rpc.onExit((exit) => (isRefused(exit) ? check : Effect.void)),
            ),
          ),
        ),
        httpMiddleware.client(({ request, next }) =>
          Effect.matchEffect(signed, {
            onFailure: (refusal) =>
              Effect.succeed(unsignedAnswer(request, refusal)),
            onSuccess: (headers) =>
              send(next(HttpClientRequest.setHeaders(request, headers))),
          }).pipe(
            Effect.tap((response) =>
              response.status === statusOf[refused] ? check : Effect.void,
            ),
          ),
        ),
      );
    }),
  );
