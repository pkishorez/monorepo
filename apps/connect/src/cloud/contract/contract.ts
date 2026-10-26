import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { Authz, type Guarded } from '@kestack/auth-toolkit';

/*
 * What Cloud Connect answers, shared by Cloud Connect, `ke-connect serve`
 * and every App. Every call is the signed-in caller's own: nothing
 * names a User. A Connection reports itself on every Heartbeat; an App lists
 * the caller's Connections and forgets one. A Connection forgotten stays
 * forgotten: its Sign-in may never report it again (ADR 0016).
 *
 * Besides the RPC, Cloud Connect answers `GET /auth` with how a Connection signs
 * in, so `serve` needs Cloud Connect's address alone. Both servers, Cloud
 * Connect and a Connection's, let in the same origin patterns.
 */

export { allowsOrigin } from './origins.js';

/** The RPC's path on Cloud Connect. */
export const RPC_PATH = '/rpc';

/** The path that answers how a Connection signs in: `AuthInfo`. */
export const AUTH_PATH = '/auth';

/** How a Connection signs in to reach Cloud Connect: through the Auth Worker at `url`. */
export const AuthInfo = Schema.Struct({ url: Schema.String });
export type AuthInfo = typeof AuthInfo.Type;

/** Whether a Connection could reach itself at its public address: a Tunnel Check. */
export const TunnelCheck = Schema.Struct({
  ok: Schema.Boolean,
  /** When it was checked, epoch ms. */
  at: Schema.Finite,
  /** Why it failed, when it did. */
  problem: Schema.NullOr(Schema.String),
});
export type TunnelCheck = typeof TunnelCheck.Type;

/** A non-empty string of at most `max` characters. */
const Bounded = (max: number) =>
  Schema.NonEmptyString.check(Schema.isMaxLength(max));

/** A Connection's public address, `https://…` alone. */
const Address = Bounded(256).check(Schema.isPattern(/^https:\/\/[^/?#\s]+/));

/**
 * Where a Connection's tunnel stands, as its last Heartbeat said: on its way
 * (Installing, then Opening), failed to open and about to try again, or up
 * at an address, with what its last Tunnel Check found there.
 */
export const ConnectionStatus = Schema.TaggedUnion({
  /** Downloading cloudflared, once per computer. */
  Installing: {},
  /** cloudflared is starting and connecting to Cloudflare. */
  Opening: {},
  /** The tunnel could not open; another is tried shortly. */
  OpenFailed: { at: Schema.Finite, problem: Schema.String },
  /** Up at `url`, not checked yet. */
  Unchecked: { url: Address },
  /** Up at `url`, and the last Tunnel Check reached it. */
  Reachable: { url: Address, at: Schema.Finite },
  /** Up at `url`, but the last Tunnel Check did not reach it. */
  Unreachable: { url: Address, at: Schema.Finite, problem: Schema.String },
});
export type ConnectionStatus = typeof ConnectionStatus.Type;

/** The address a status is up at; null while there is none. */
export const addressOf = (status: ConnectionStatus) =>
  'url' in status ? status.url : null;

/**
 * What a Connection says of itself on each Heartbeat. Every field is bounded,
 * and its address is `https://` alone: the app dials it with the Connection
 * Key, which must never cross in clear.
 */
export const ConnectionReport = Schema.Struct({
  id: Bounded(64),
  name: Bounded(64),
  /** Its Connection Key (ADR 0015). */
  key: Bounded(128),
  /** The version of Connect it runs. */
  version: Schema.String.check(Schema.isMaxLength(32)),
  status: ConnectionStatus,
});
export type ConnectionReport = typeof ConnectionReport.Type;

/** A Connection as its User sees it: what it last reported, and its Last Seen. */
export const Connection = Schema.Struct({
  ...ConnectionReport.fields,
  /** Its Last Seen: when it last reported, epoch ms, by Cloud Connect's clock. */
  lastSeen: Schema.Number,
});
export type Connection = typeof Connection.Type;

/** The Connection was forgotten by its User; it must sign out and stop. */
export class ConnectionForgotten extends Schema.TaggedError<ConnectionForgotten>()(
  'ConnectionForgotten',
  { id: Schema.String },
) {}

/** A Connection id taken by another User. */
export class ConnectionTaken extends Schema.TaggedError<ConnectionTaken>()(
  'ConnectionTaken',
  { id: Schema.String },
) {}

const Rpcs = RpcGroup.make(
  Rpc.make('Report', {
    payload: ConnectionReport,
    success: Connection,
    error: Schema.Union([ConnectionForgotten, ConnectionTaken]),
  }),
  Rpc.make('List', {
    payload: Schema.Struct({}),
    success: Schema.Array(Connection),
  }),
  Rpc.make('Forget', {
    payload: Schema.Struct({ id: Schema.NonEmptyString }),
    success: Schema.Void,
  }),
);

/** Every call needs a Sign-in; named so its type is published as is. */
export const CloudApi: Guarded<typeof Rpcs> = Authz.required(Rpcs);
