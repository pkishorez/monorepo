import { Console, Effect } from 'effect';
import type { RpcClientError } from 'effect/rpc';
import type {
  InstanceNotFound,
  PathNotFound,
  StepNotFound,
} from '@kestack/devtools-kabuki/api';
import type { KabukiSessionNotFound } from '@kestack/devtools-kabuki/server';

export type ClientError =
  | { readonly _tag: 'TraceNotFound'; readonly traceId: string }
  | { readonly _tag: 'LotelRpcError'; readonly message: string }
  | KabukiSessionNotFound
  | { readonly _tag: 'KabukiSessionDisconnected'; readonly name: string }
  | StepNotFound
  | PathNotFound
  | InstanceNotFound
  | RpcClientError.RpcClientError;

const unreachable = (baseUrl: string, kind: string) =>
  `Could not reach a DevTools Server at ${baseUrl} (${kind}). Start one with \`devtools\` or pass --url.`;

const keptRange = (error: StepNotFound) =>
  error.oldest === null
    ? 'The History keeps no entries.'
    : `The History keeps entries ${error.oldest} to ${error.newest}.`;

/** Formats lookup and transport failures for stderr. */
export function describeClientError(error: ClientError, baseUrl: string) {
  switch (error._tag) {
    case 'TraceNotFound':
      return `Trace not found: ${error.traceId}`;
    case 'LotelRpcError':
      return error.message;
    case 'KabukiSessionNotFound':
      return error.available.length === 0
        ? `No Kabuki Session named ${error.name}: none is connected. Open the app with ?kabuki-session=<name>.`
        : `No Kabuki Session named ${error.name}. Live: ${error.available.join(', ')}.`;
    case 'KabukiSessionDisconnected':
      return `The Kabuki Session ${error.name} disconnected.`;
    case 'StepNotFound':
      return `Step ${error.step} is not kept. ${keptRange(error)}`;
    case 'PathNotFound':
      return `No ${error.path} in the Snapshot. ${error.found || '(the root)'} has: ${error.available.join(', ') || '(nothing)'}.`;
    case 'InstanceNotFound':
      return `No Instance ${error.instance} at Step ${error.at}. There are: ${error.available.join(', ')}.`;
    case 'RpcClientError':
      switch (error.reason._tag) {
        case 'HttpError':
          return unreachable(baseUrl, error.reason.kind);
        case 'SocketOpenError':
          return unreachable(baseUrl, error.reason.kind);
        default:
          return `RPC request failed: ${error.reason.message}`;
      }
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
