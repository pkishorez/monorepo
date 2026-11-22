import { Context, Effect, Layer } from 'effect';
import { FetchHttpClient, HttpClient, HttpClientRequest } from 'effect/http';
import { RpcClient, RpcSerialization } from 'effect/rpc';

import { MonoverseRpc } from '../contract/index.js';

/*
 * The Capability every Monoverse Actor that asks the server Requires: the
 * typed client of /rpc/monoverse. Tests Provide their own.
 */

const make = RpcClient.make(MonoverseRpc);

export type MonoverseClientService = Effect.Success<typeof make>;

export class MonoverseClient extends Context.Service<
  MonoverseClient,
  MonoverseClientService
>()('@kestack/devtools/monoverse/MonoverseClient') {}

/** The client of the DevTools Server at `origin`. */
export const monoverseClient = (origin: string) =>
  Layer.effect(MonoverseClient, make).pipe(
    Layer.provide(
      RpcClient.layerProtocolHttp({
        url: origin,
        transformClient: HttpClient.mapRequest(
          HttpClientRequest.appendUrl('/rpc/monoverse'),
        ),
      }),
    ),
    Layer.provide(RpcSerialization.layerNdjson),
    Layer.provide(FetchHttpClient.layer),
  );

/** What went wrong, in words, whatever the server or the wire failed with. */
export function problemOf(error: unknown): string {
  if (typeof error === 'object' && error !== null) {
    if (
      'message' in error &&
      typeof error.message === 'string' &&
      error.message !== ''
    )
      return error.message;
    if ('_tag' in error) {
      const { _tag, ...rest } = error as { _tag: string };
      const detail = Object.values(rest).filter(
        (value) => typeof value === 'string',
      );
      return [String(_tag), ...detail].join(': ');
    }
  }
  return String(error);
}
