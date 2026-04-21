import { RpcSerialization } from '@effect/rpc';
import { Protocol } from '@effect/rpc/RpcClient';
import { Socket } from '@effect/platform';
import { Schedule, Option, Effect, Scope, Cause, Ref } from 'effect';
import { constVoid } from 'effect/Function';
import { RpcClientError } from '@effect/rpc/RpcClientError';
import { isRpcServerMessage } from './utils.js';
import { makePinger } from './pinger.js';
import { constPing } from '@effect/rpc/RpcMessage';

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
  Protocol['Type'],
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
                if (response._tag === 'Pong') pinger.onPong();
                return writeResponse(response);
              }
              onOtherMessage?.(response);
              return Effect.void;
            },
            step: constVoid,
          });
        } catch (defect) {
          return writeResponse({
            _tag: 'ClientProtocolError',
            error: new RpcClientError({
              reason: 'Protocol',
              message: 'Error decoding message',
              cause: Cause.fail(defect),
            }),
          });
        }
      };

      const isTransientError = (cause: Cause.Cause<Socket.SocketError>) => {
        if (!retryTransientErrors) return false;
        const error = Cause.failureOption(cause);
        return (
          Option.isSome(error) &&
          (error.value.reason === 'Open' ||
            error.value.reason === 'OpenTimeout')
        );
      };

      const pingTimeout = Effect.andThen(
        pinger.timeout,
        Effect.fail(
          new Socket.SocketGenericError({
            reason: 'OpenTimeout',
            cause: new Error('ping timeout'),
          }),
        ),
      );

      const connectAndRun = Effect.gen(function* () {
        parser = serialization.unsafeMake();
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
          new Socket.SocketCloseError({ reason: 'Close', code: 1000 }),
        );
      }).pipe(
        Effect.tapErrorCause((cause) => {
          if (isTransientError(cause)) return Effect.void;
          currentError = new RpcClientError({
            reason: 'Protocol',
            message: 'Error in socket',
            cause: Cause.squash(cause),
          });
          return writeResponse({
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
        send(request) {
          if (currentError) return Effect.fail(currentError);
          const encoded = parser.encode(request);
          if (encoded === undefined) return Effect.void;
          return Effect.orDie(write(encoded));
        },
        supportsAck: true,
        supportsTransferables: false,
      };
    }),
  );
