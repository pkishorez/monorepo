import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import type { RpcClient, RpcClientError } from 'effect/rpc';

/*
 * What DevTools answers its own page and CLI about Kabuki Sessions: which
 * are live, over one socket, and one Kabuki Session's Api, over a socket
 * of its own.
 */

/** A live Kabuki Session, as listed. */
export const KabukiSessionSummary = Schema.Struct({
  name: Schema.String,
  app: Schema.String,
  url: Schema.String,
  /** The page's origin; `null` when its socket said none, as outside a browser. */
  origin: Schema.NullOr(Schema.String),
  /** When it connected, in milliseconds. */
  connectedAt: Schema.Number,
});
export type KabukiSessionSummary = typeof KabukiSessionSummary.Type;

/** No live Kabuki Session has the name; `available` lists those that are. */
export class KabukiSessionNotFound extends Schema.TaggedError<KabukiSessionNotFound>()(
  'KabukiSessionNotFound',
  { name: Schema.String, available: Schema.Array(Schema.String) },
) {}

export const KabukiSessionsApi = RpcGroup.make(
  /** The live Kabuki Sessions, oldest first. */
  Rpc.make('list', { success: Schema.Array(KabukiSessionSummary) }),
  /** The live Kabuki Sessions now, then again after every change. */
  Rpc.make('watch', {
    success: Schema.Array(KabukiSessionSummary),
    stream: true,
  }),
);

export type KabukiSessionsClient = RpcClient.RpcClient<
  RpcGroup.Rpcs<typeof KabukiSessionsApi>,
  RpcClientError.RpcClientError
>;

/** Where on the DevTools Server the live Kabuki Sessions are listed. */
export const SESSIONS_PATH = '/kabuki/sessions';

/** Where on the DevTools Server one Kabuki Session's Api is answered. */
export const sessionPath = (name: string) =>
  `/kabuki/session/${encodeURIComponent(name)}`;
