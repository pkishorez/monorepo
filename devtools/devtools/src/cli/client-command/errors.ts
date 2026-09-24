import { Console, Effect } from 'effect';
import type { RpcClientError } from 'effect/unstable/rpc';

export type ClientError =
  | { readonly _tag: 'TraceNotFound'; readonly traceId: string }
  | { readonly _tag: 'FlowNotFound'; readonly flowId: string }
  | { readonly _tag: 'FlowRpcError'; readonly message: string }
  | { readonly _tag: 'LotelRpcError'; readonly message: string }
  | RpcClientError.RpcClientError;

/** Formats lookup and transport failures for stderr. */
function describeClientError(error: ClientError, baseUrl: string) {
  switch (error._tag) {
    case 'TraceNotFound':
      return `Trace not found: ${error.traceId}`;
    case 'FlowNotFound':
      return `Flow not found: ${error.flowId}`;
    case 'FlowRpcError':
    case 'LotelRpcError':
      return error.message;
    case 'RpcClientError':
      return error.reason._tag === 'HttpError'
        ? `Could not reach a DevTools Server at ${baseUrl} (${error.reason.kind}). Start one with \`devtools\` or pass --url.`
        : `RPC request failed: ${error.reason.message}`;
  }
}

/** Prints a Client Command failure to stderr and marks the process as failed. */
export const reportClientError = (error: ClientError, baseUrl: string) =>
  Console.error(describeClientError(error, baseUrl)).pipe(
    Effect.andThen(
      Effect.sync(() => {
        process.exitCode = 1;
      }),
    ),
  );
