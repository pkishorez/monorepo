import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { Authz, type Guarded } from '@kestack/auth-toolkit';
import { PluginState } from '@kestack/cli-platform/plugins/contract';
import { ESchema, ValueESchema } from '@kestack/std-toolkit/eschema';
import { belowMinimum } from './plugins.js';

/*
 * What Cloud Connect answers, shared by Cloud Connect, `ke-connect serve`
 * and every App. Every call is the signed-in caller's own: nothing
 * names a User. A Connection reports itself on every Heartbeat; an App lists
 * the caller's Connections and forgets one. A Connection forgotten stays
 * forgotten: its Sign-in may never report it again (ADR 0016).
 *
 * Besides the RPC, Cloud Connect answers `GET /auth` with how a Connection signs
 * in, so `serve` needs Cloud Connect's address alone. Both servers, Cloud
 * Connect and a Connection's, let in the same origin patterns. Every RPC
 * of Connect's, Cloud Connect's and each Plugin's, is called through
 * `versionedClient`, so a call between an older side and a newer one fails
 * with `VersionGap`.
 *
 * Every Connection is told the same two things: the latest Release of each
 * Plugin, which Cloud Connect alone decides (ADR 0006), and the Minimum
 * Connect. A Plugin's address, its file on the Shelf, how a Connection
 * says it runs another Release, and who is Outdated are in plugins.ts.
 */

export { allowsOrigin } from './origins.js';
export {
  belowMinimum,
  fromShelfKey,
  mismatchOf,
  mismatchReason,
  PLUGIN_MISMATCH,
  pluginOfPath,
  pluginPath,
  PluginMismatch,
  SHELF_PATH,
  shelfKey,
} from './plugins.js';
export { VersionGap, versionedClient } from './version-gap.js';

/** The RPC's path on Cloud Connect. */
export const RPC_PATH = '/rpc';

/** The path that answers how a Connection signs in: `AuthInfo`. */
export const AUTH_PATH = '/auth';

/** How a Connection signs in to reach Cloud Connect: through the Auth Worker at `url`. */
export const AuthInfo = ESchema.make('AuthInfo', {
  url: Schema.String,
}).build();
export type AuthInfo = typeof AuthInfo.Type;

/** Whether a Connection could reach itself at its public address: a Tunnel Check. */
export const TunnelCheck = ESchema.make('TunnelCheck', {
  ok: Schema.Boolean,
  /** When it was checked, epoch ms. */
  at: Schema.Finite,
  /** Why it failed, when it did. */
  problem: Schema.NullOr(Schema.String),
}).build();
export type TunnelCheck = typeof TunnelCheck.Type;

/** A non-empty string of at most `max` characters. */
const Bounded = (max: number) =>
  Schema.NonEmptyString.check(Schema.isMaxLength(max));

/**
 * One case of a union, tagged by `_tag`. An ESchema stores no constructor
 * default, so the tag is a plain literal, not `Schema.tag`.
 */
const tagged = <const Tag extends string, Fields extends Schema.Struct.Fields>(
  tag: Tag,
  fields: Fields,
) => Schema.Struct({ _tag: Schema.Literal(tag), ...fields });

/** A Connection's public address, `https://…` alone. */
const Address = Bounded(256).check(Schema.isPattern(/^https:\/\/[^/?#\s]+/));

/**
 * Where a Connection's tunnel stands, as its last Heartbeat said: on its way
 * (Installing, then Opening), failed to open and about to try again, or up
 * at an address, with what its last Tunnel Check found there.
 */
export const ConnectionStatus = ValueESchema.make(
  'ConnectionStatus',
  Schema.Union([
    /** Downloading cloudflared, once per computer. */
    tagged('Installing', {}),
    /** cloudflared is starting and connecting to Cloudflare. */
    tagged('Opening', {}),
    /** The tunnel could not open; another is tried shortly. */
    tagged('OpenFailed', { at: Schema.Finite, problem: Schema.String }),
    /** Up at `url`, not checked yet. */
    tagged('Unchecked', { url: Address }),
    /** Up at `url`, and the last Tunnel Check reached it. */
    tagged('Reachable', { url: Address, at: Schema.Finite }),
    /** Up at `url`, but the last Tunnel Check did not reach it. */
    tagged('Unreachable', {
      url: Address,
      at: Schema.Finite,
      problem: Schema.String,
    }),
  ]),
).build();
export type ConnectionStatus = typeof ConnectionStatus.Type;

/** The address a status is up at; null while there is none. */
export const addressOf = (status: ConnectionStatus) =>
  'url' in status ? status.url : null;

/** A version of Connect, as a Report names it. */
const Version = Schema.String.check(Schema.isMaxLength(32));

/** Where each of a Connection's Plugins stands, by the Plugin's name. */
const PluginStates = Schema.Record(Schema.String, PluginState.schema);

/** Which Release of a Plugin to run: its file's sha256, and where on the Shelf to read it. */
const PluginVersion = Schema.Struct({
  hash: Schema.String,
  url: Schema.String,
});
export type PluginVersion = typeof PluginVersion.Type;

/** What a Connection says of itself, in its Report and in the Connection it is answered with. */
const reportFields = {
  id: Bounded(64),
  name: Bounded(64),
  /** Its Connection Key (ADR 0015). */
  key: Bounded(128),
  /** The version of Connect it runs. */
  version: Version,
  status: ConnectionStatus.schema,
  /** Where each of its Plugins stands. */
  plugins: PluginStates,
};

/**
 * What a Connection says of itself on each Heartbeat. Every field is bounded,
 * and its address is `https://` alone: the app dials it with the Connection
 * Key, which must never cross in clear.
 */
export const ConnectionReport = ESchema.make(
  'ConnectionReport',
  reportFields,
).build();
export type ConnectionReport = typeof ConnectionReport.Type;

/**
 * A Connection as its User sees it, and as Cloud Connect answers its
 * Report: what it last reported, its Last Seen, `wanted`: the latest
 * Release of each Plugin, which the Connection should run, and
 * `minConnect`, the Minimum Connect: the oldest `ke-connect` let run the
 * Plugins, null when Cloud Connect names none.
 */
export const Connection = ESchema.make('Connection', {
  ...reportFields,
  /** Its Last Seen: when it last reported, epoch ms, by Cloud Connect's clock. */
  lastSeen: Schema.Finite,
  wanted: Schema.Record(Schema.String, PluginVersion),
  minConnect: Schema.NullOr(Version),
}).build();
export type Connection = typeof Connection.Type;

/** Whether a Connection is Outdated: it runs a `ke-connect` older than the Minimum Connect. */
export const isOutdated = (connection: Connection) =>
  belowMinimum(connection.version, connection.minConnect);

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

/** What `List` takes: nothing yet. */
const ListPayload = ESchema.make('ListPayload', {}).build();

/** What `Forget` takes: the Connection to forget. */
const ForgetPayload = ESchema.make('ForgetPayload', {
  id: Schema.NonEmptyString,
}).build();

const Rpcs = RpcGroup.make(
  Rpc.make('Report', {
    payload: ConnectionReport.schema,
    success: Connection.schema,
    error: Schema.Union([ConnectionForgotten, ConnectionTaken]),
  }),
  Rpc.make('List', {
    payload: ListPayload.schema,
    success: Schema.Array(Connection.schema),
  }),
  Rpc.make('Forget', {
    payload: ForgetPayload.schema,
    success: Schema.Void,
  }),
);

/** Every call needs a Sign-in; named so its type is published as is. */
export const CloudApi: Guarded<typeof Rpcs> = Authz.required(Rpcs);
