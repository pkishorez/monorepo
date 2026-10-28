import { Context, Effect, Layer, Stream } from 'effect';
import type { Scope } from 'effect';
import type { RpcClientError } from 'effect/rpc';
import type { KabukiSessionClient } from '@kestack/devtools-kabuki/api';
import { dialSession, dialSessions } from '@kestack/devtools-kabuki/server';
import type { KabukiSessionSummary } from '@kestack/devtools-kabuki/server';

/*
 * The Kabuki Sessions this DevTools Server holds, as the /kabuki page asks
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
  '@kestack/devtools/kabuki/Sessions',
) {}

/** The Kabuki Sessions of the DevTools Server at `origin`, the page's own. */
export const devtools = (origin: string) =>
  Layer.succeed(Sessions)({
    watch: Stream.unwrap(
      Effect.map(dialSessions(origin), (client) => client.watch()),
    ),
    dial: (name) => dialSession(origin, name),
  });
