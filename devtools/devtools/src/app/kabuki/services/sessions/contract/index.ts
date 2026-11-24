import { Context } from 'effect';
import type { Effect, Scope, Stream } from 'effect';
import type { RpcClientError } from 'effect/rpc';
import type { KabukiSessionClient } from '@kestack/devtools-kabuki/api';
import type { KabukiSessionSummary } from '@kestack/devtools-kabuki/server';

/*
 * The Kabuki Sessions this DevTools Server holds, as the Kabuki Tool asks
 * for them: the live list, and one Kabuki Session's Api. Each is one socket
 * to the server that is never dialed again: a list that ends or fails means
 * the socket closed, and whoever watches it dials again.
 */

export interface SessionsService {
  /** The live Kabuki Sessions now, then again after every change, until the socket closes. */
  readonly watch: Stream.Stream<
    ReadonlyArray<KabukiSessionSummary>,
    RpcClientError.RpcClientError
  >;
  /** One Kabuki Session's Api, for as long as the Scope lasts. */
  readonly dial: (
    name: string,
  ) => Effect.Effect<KabukiSessionClient, never, Scope.Scope>;
}

export class Sessions extends Context.Service<Sessions, SessionsService>()(
  'Kabuki/service/Sessions',
) {}
