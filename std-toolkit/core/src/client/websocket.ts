import { RpcSerialization, RpcClient } from 'effect/unstable/rpc';
import { Socket } from 'effect/unstable/socket';
import { Schedule, Effect, Scope, Cause, Result, Ref } from 'effect';
import { constVoid } from 'effect/Function';
import {
  RpcClientError,
  RpcClientDefect,
} from 'effect/unstable/rpc/RpcClientError';
import { isRpcServerMessage } from './utils.js';
import { makePinger } from './pinger.js';
import { constPing } from 'effect/unstable/rpc/RpcMessage';

const { Protocol } = RpcClient;

export const makeProtocolSocket = ({
  retryTransientErrors = true,
  retrySchedule = Schedule.spaced(1000),
  onConnect,
  onOtherMessage,
}: {
  readonly retryTransientErrors?: boolean | undefined;
  readonly retrySchedule?:
    | Schedule.Schedule<any, Socket.SocketError>
    | undefined;
  onConnect?: Ref.Ref<ReadonlyArray<Effect.Effect<any>>>;
  onOtherMessage?: (message: unknown) => void;
}): Effect.Effect<
  RpcClient.Protocol['Service'],
  never,
  Scope.Scope | RpcSerialization.RpcSerialization | Socket.Socket
> =>
  Protocol.make(
    Effect.fnUntraced(function* (writeResponse, clientIds) {
      const socket = yield* Socket.Socket;
      const serialization = yield* RpcSerialization.RpcSerialization;
      const write = yield* socket.writer;
      let parser = serialization.makeUnsafe();
      const pinger = yield* makePinger(write(parser.encode(constPing)!));
      const requestClientMap = new Map<string, number>();

      let currentError: RpcClientError | undefined;

      const broadcast = (response: any) =>
        Effect.forEach(clientIds, (clientId) =>
          writeResponse(clientId, response),
        );

      const handleMessage = (message: string | Uint8Array) => {
        try {
          const responses = parser.decode(message);
          if (responses.length === 0) return;
          let i = 0;

          return Effect.whileLoop({
            while: () => i < responses.length,
            body: () => {
              const response = responses[i++]!;
              if (isRpcServerMessage(response)) {
                if (response._tag === 'Pong') {
                  pinger.onPong();
                  return Effect.void;
                }
                if ('requestId' in response) {
                  const clientId = requestClientMap.get(response.requestId);
                  if (clientId !== undefined) {
                    if (response._tag === 'Exit') {
                      requestClientMap.delete(response.requestId);
                    }
                    return writeResponse(clientId, response);
                  }
                }
                return broadcast(response);
              }
              onOtherMessage?.(response);
              return Effect.void;
            },
            step: constVoid,
          });
        } catch (defect) {
          return broadcast({
            _tag: 'ClientProtocolError',
            error: new RpcClientError({
              reason: new RpcClientDefect({
                message: 'Error decoding message',
                cause: defect,
              }),
            }),
          });
        }
      };

      const isTransientError = (cause: Cause.Cause<Socket.SocketError>) => {
        if (!retryTransientErrors) return false;
        const error = Cause.findError(cause);
        return (
          Result.isSuccess(error) &&
          error.success.reason._tag === 'SocketOpenError'
        );
      };

      const pingTimeout = Effect.andThen(
        pinger.timeout,
        Effect.fail(
          new Socket.SocketError({
            reason: new Socket.SocketOpenError({
              kind: 'Timeout',
              cause: new Error('ping timeout'),
            }),
          }),
        ),
      );

      const connectAndRun = Effect.gen(function* () {
        parser = serialization.makeUnsafe();
        currentError = undefined;
        pinger.reset();

        yield* Effect.raceFirst(
          socket.runRaw(handleMessage, {
            onOpen: onConnect
              ? Ref.get(onConnect).pipe(Effect.flatMap(Effect.all))
              : Effect.void,
          }),
          pingTimeout,
        );

        return yield* Effect.fail(
          new Socket.SocketError({
            reason: new Socket.SocketCloseError({ code: 1000 }),
          }),
        );
      }).pipe(
        Effect.tapCause((cause) => {
          if (isTransientError(cause)) return Effect.void;
          const error = Cause.findError(cause);
          currentError = new RpcClientError({
            reason: Result.isSuccess(error)
              ? error.success.reason
              : new RpcClientDefect({
                  message: 'Error in socket',
                  cause: Cause.squash(cause),
                }),
          });
          return broadcast({
            _tag: 'ClientProtocolError',
            error: currentError,
          });
        }),
        Effect.retry(retrySchedule),
        Effect.annotateLogs({
          module: 'RpcClient',
          method: 'makeProtocolSocket',
        }),
        Effect.interruptible,
        Effect.forkScoped,
      );

      yield* connectAndRun;

      return {
        send(clientId, request) {
          if (currentError) return Effect.fail(currentError);
          if (request._tag === 'Request') {
            requestClientMap.set(request.id, clientId);
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
