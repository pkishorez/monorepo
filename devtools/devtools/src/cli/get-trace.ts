import { Console, Effect, Layer } from 'effect';
import { Argument, Command, Flag } from 'effect/unstable/cli';
import {
  RpcClient,
  RpcSerialization,
  type RpcClientError,
} from 'effect/unstable/rpc';
import { NodeHttpClient } from '@effect/platform-node';
import {
  DevtoolsRpc,
  type DevtoolsRpcError,
  type TraceNotFound,
} from '../rpc/index.js';

const DEFAULT_DEVTOOLS_URL = 'http://localhost:14400';

const traceId = Argument.string('trace-id').pipe(
  Argument.withDescription('Trace id to retrieve'),
);

const url = Flag.string('url').pipe(
  Flag.withDescription('Base URL of the running DevTools server'),
  Flag.withDefault(DEFAULT_DEVTOOLS_URL),
);

/** Resolves the RPC endpoint below a DevTools base URL. */
const rpcUrl = (baseUrl: string) => `${baseUrl.replace(/\/+$/, '')}/rpc`;

/** Formats known lookup and transport failures for stderr. */
const formatError = (
  error: TraceNotFound | DevtoolsRpcError | RpcClientError.RpcClientError,
) => {
  switch (error._tag) {
    case 'TraceNotFound':
      return `Trace not found: ${error.traceId}`;
    case 'DevtoolsRpcError':
      return error.message;
    case 'RpcClientError':
      return error.reason._tag === 'HttpError'
        ? `RPC request failed: ${error.reason.kind}`
        : `RPC request failed: ${error.reason.message}`;
  }
};

/** Calls the running DevTools server and returns a trace through Effect RPC. */
const getTrace = (traceId: string, baseUrl: string) =>
  Effect.scoped(
    Effect.gen(function* () {
      const client = yield* RpcClient.make(DevtoolsRpc);
      return yield* client.GetTrace({ traceId });
    }),
  ).pipe(
    Effect.provide(
      RpcClient.layerProtocolHttp({ url: rpcUrl(baseUrl) }).pipe(
        Layer.provide(RpcSerialization.layerNdjson),
        Layer.provide(NodeHttpClient.layerUndici),
      ),
    ),
  );

export const getTraceCommand = Command.make(
  'get-trace',
  { traceId, url },
  ({ traceId, url }) =>
    getTrace(traceId, url).pipe(
      Effect.flatMap((trace) => Console.log(JSON.stringify(trace, null, 2))),
      Effect.catch((error) =>
        Console.error(formatError(error)).pipe(
          Effect.andThen(
            Effect.sync(() => {
              process.exitCode = 1;
            }),
          ),
        ),
      ),
    ),
).pipe(Command.withDescription('Return all stored spans for a trace'));
