import { RpcSerialization } from "@effect/rpc";
import { Protocol } from "@effect/rpc/RpcClient";
import { Socket } from "@effect/platform";
import { Schedule, Option, Effect, Scope, Cause } from "effect";
import { constVoid } from "effect/Function";
import { RpcClientError } from "@effect/rpc/RpcClientError";
import { isRpcServerMessage } from "./utils";
import { makePinger } from "./pinger";
import { constPing } from "@effect/rpc/RpcMessage";

export const makeProtocolSocket = ({
  retryTransientErrors = true,
  retrySchedule = Schedule.spaced(1000),
  onOpenEffects = [],
  onOtherMessage,
}: {
  readonly retryTransientErrors?: boolean | undefined;
  readonly retrySchedule?:
    | Schedule.Schedule<any, Socket.SocketError>
    | undefined;
  onOpenEffects?: Effect.Effect<any>[];
  onOtherMessage?: (message: unknown) => void;
}): Effect.Effect<
  Protocol["Type"],
  never,
  Scope.Scope | RpcSerialization.RpcSerialization | Socket.Socket
> =>
  Protocol.make(
    Effect.fnUntraced(function* (writeResponse) {
      const socket = yield* Socket.Socket;
      const serialization = yield* RpcSerialization.RpcSerialization;
      const write = yield* socket.writer;
      let parser = serialization.unsafeMake();
      const pinger = yield* makePinger(write(parser.encode(constPing)!));

      let currentError: RpcClientError | undefined;
      const onOpen = Effect.all(onOpenEffects, { concurrency: "unbounded" });

      yield* Effect.suspend(() => {
        parser = serialization.unsafeMake();
        pinger.reset();
        return socket
          .runRaw(
            (message) => {
              try {
                const responses = parser.decode(message);
                if (responses.length === 0) return;
                let i = 0;

                return Effect.whileLoop({
                  while: () => i < responses.length,
                  body: () => {
                    const response = responses[i++]!;
                    if (isRpcServerMessage(response)) {
                      if (response._tag === "Pong") {
                        pinger.onPong();
                      }
                      return writeResponse(response);
                    }
                    onOtherMessage?.(response);
                    return Effect.void;
                  },
                  step: constVoid,
                });
              } catch (defect) {
                return writeResponse({
                  _tag: "ClientProtocolError",
                  error: new RpcClientError({
                    reason: "Protocol",
                    message: "Error decoding message",
                    cause: Cause.fail(defect),
                  }),
                });
              }
            },
            { onOpen },
          )
          .pipe(
            Effect.raceFirst(
              Effect.zipRight(
                pinger.timeout,
                Effect.fail(
                  new Socket.SocketGenericError({
                    reason: "OpenTimeout",
                    cause: new Error("ping timeout"),
                  }),
                ),
              ),
            ),
          );
      }).pipe(
        Effect.zipRight(
          Effect.fail(
            new Socket.SocketCloseError({
              reason: "Close",
              code: 1000,
            }),
          ),
        ),
        Effect.tapErrorCause((cause) => {
          const error = Cause.failureOption(cause);
          if (
            retryTransientErrors &&
            Option.isSome(error) &&
            (error.value.reason === "Open" ||
              error.value.reason === "OpenTimeout")
          ) {
            return Effect.void;
          }
          currentError = new RpcClientError({
            reason: "Protocol",
            message: "Error in socket",
            cause: Cause.squash(cause),
          });
          return writeResponse({
            _tag: "ClientProtocolError",
            error: currentError,
          });
        }),
        Effect.retry(retrySchedule),
        Effect.annotateLogs({
          module: "RpcClient",
          method: "makeProtocolSocket",
        }),
        Effect.interruptible,
        Effect.forkScoped,
      );

      return {
        send(request) {
          if (currentError) {
            return Effect.fail(currentError);
          }
          const encoded = parser.encode(request);
          if (encoded === undefined) return Effect.void;
          return Effect.orDie(write(encoded));
        },
        supportsAck: true,
        supportsTransferables: false,
      };
    }),
  );
