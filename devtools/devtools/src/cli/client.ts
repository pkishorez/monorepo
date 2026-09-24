import { Config, Console, Effect, Layer } from 'effect';
import { Flag } from 'effect/unstable/cli';
import {
  RpcClient,
  RpcSerialization,
  type RpcClientError,
  type RpcGroup,
} from 'effect/unstable/rpc';
import { NodeHttpClient } from '@effect/platform-node';
import { DevtoolsRpc } from '../rpc/index.js';

const DEFAULT_PORT = 14400;
const urlForPort = (port: number) => `http://127.0.0.1:${port}`;

/**
 * Where the DevTools Server lives. `--url` wins, then `DEVTOOLS_URL`, then the
 * port the server itself reads from `DEVTOOLS_PORT`.
 */
export const urlFlag = Flag.string('url').pipe(
  Flag.withDescription('Base URL of the running DevTools Server'),
  Flag.withFallbackConfig(
    Config.string('DEVTOOLS_URL').pipe(
      Config.orElse(() =>
        Config.int('DEVTOOLS_PORT').pipe(Config.map(urlForPort)),
      ),
    ),
  ),
  Flag.withDefault(urlForPort(DEFAULT_PORT)),
);

const rpcUrl = (baseUrl: string) => `${baseUrl.replace(/\/+$/, '')}/rpc`;

export type DevtoolsClient = RpcClient.RpcClient<
  RpcGroup.Rpcs<typeof DevtoolsRpc>,
  RpcClientError.RpcClientError
>;

/** Runs `use` against the DevTools Server at `baseUrl` over Effect RPC. */
export const withDevtoolsClient = <A, E>(
  baseUrl: string,
  use: (client: DevtoolsClient) => Effect.Effect<A, E>,
) =>
  Effect.scoped(
    Effect.gen(function* () {
      const client = yield* RpcClient.make(DevtoolsRpc);
      return yield* use(client);
    }),
  ).pipe(
    Effect.provide(
      RpcClient.layerProtocolHttp({ url: rpcUrl(baseUrl) }).pipe(
        Layer.provide(RpcSerialization.layerNdjson),
        Layer.provide(NodeHttpClient.layerUndici),
      ),
    ),
  );

type KnownError =
  | { readonly _tag: 'TraceNotFound'; readonly traceId: string }
  | { readonly _tag: 'FlowRpcError'; readonly message: string }
  | { readonly _tag: 'LotelRpcError'; readonly message: string }
  | RpcClientError.RpcClientError;

/** Formats lookup and transport failures for stderr. */
export const formatClientError = (error: KnownError, baseUrl: string) => {
  switch (error._tag) {
    case 'TraceNotFound':
      return `Trace not found: ${error.traceId}`;
    case 'FlowRpcError':
    case 'LotelRpcError':
      return error.message;
    case 'RpcClientError':
      return error.reason._tag === 'HttpError'
        ? `Could not reach a DevTools Server at ${baseUrl} (${error.reason.kind}). Start one with \`devtools\` or pass --url.`
        : `RPC request failed: ${error.reason.message}`;
  }
};

/** Prints a Client Command failure to stderr and marks the process as failed. */
export const reportClientError = (error: KnownError, baseUrl: string) =>
  Console.error(formatClientError(error, baseUrl)).pipe(
    Effect.andThen(
      Effect.sync(() => {
        process.exitCode = 1;
      }),
    ),
  );
