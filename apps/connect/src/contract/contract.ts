import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { Authz, type Guarded } from '@kestack/auth-toolkit';
import { PluginState } from '@kestack/cli-platform/plugins/contract';
import { ESchema, ValueESchema } from '@kestack/std-toolkit/eschema';
import { belowMinimum } from './releases.js';

/*
 * What all three parts of Connect agree on: Connect Cloud, the Connect CLI and
 * every App. Connect Cloud's RPC is here: every call is the signed-in caller's
 * own, so nothing names a User. A Connection reports itself on every Heartbeat;
 * an App lists the caller's Connections, renames one and forgets one. A
 * Connection forgotten stays forgotten: its Sign-in may never report it again
 * (ADR 0004).
 *
 * Besides the RPC, Connect Cloud answers `GET /auth` with how a Connection signs
 * in, so `serve` needs Connect Cloud's address alone. Both servers, Connect
 * Cloud and a Connection's, let in the same origin patterns. Every RPC of
 * Connect's, Connect Cloud's and each Plugin's, is called through
 * `versionedClient`, so a call between an older side and a newer one fails with
 * `VersionGap`.
 *
 * Every Connection is told the same two things: the latest Release of each
 * Plugin, which Connect Cloud alone decides (ADR 0006), and the Minimum Connect.
 * A Plugin's address, its Release File, how a Connection says it runs another
 * Release, and who is Outdated are in releases.ts.
 */

export { allowsOrigin } from './origins.js';
export {
  belowMinimum,
  fromReleaseKey,
  mismatchOf,
  mismatchReason,
  PLUGIN_MISMATCH,
  pluginOfPath,
  pluginPath,
  PluginMismatch,
  RELEASE_PATH,
  releaseKey,
} from './releases.js';
export { VersionGap, versionedClient } from './version-gap.js';

/** The RPC's path on Connect Cloud. */
export const RPC_PATH = '/rpc';

/** The path that answers how a Connection signs in: `AuthInfo`. */
export const AUTH_PATH = '/auth';

/** How a Connection signs in to reach Connect Cloud: through the Auth Worker at `url`. */
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

/** One Release of a Plugin: its file's sha256, and where to read that file. */
export const Release = Schema.Struct({
  hash: Schema.String,
  url: Schema.String,
});
export type Release = typeof Release.Type;

/** The latest Release of each Plugin, by name, which every Connection should run. */
const Wanted = Schema.Record(Schema.String, Release);

/** The Minimum Connect: the oldest `ke-connect` let run the Plugins; null when Connect Cloud names none. */
const MinConnect = Schema.NullOr(Version);

/** Where each Plugin stood, in what a Connection reported at v1. It stays on the computer now. */
const PluginStates = Schema.Record(Schema.String, PluginState.schema);

/** What a Connection says of itself. */
const reportFields = {
  id: Bounded(64),
  name: Bounded(64),
  /** Its Connection Key (ADR 0003). */
  key: Bounded(128),
  /** The version of Connect it runs. */
  version: Version,
  status: ConnectionStatus.schema,
};

/** A Connection as v1 of `Connection` and of `ReportAnswer` carried it. */
const reportedFields = {
  ...reportFields,
  plugins: PluginStates,
  /** Its Last Seen: when it last reported, epoch ms, by Connect Cloud's clock. */
  lastSeen: Schema.Finite,
  wanted: Wanted,
  minConnect: MinConnect,
};

/**
 * What a Connection says of itself on each Heartbeat. Every field is bounded,
 * and its address is `https://` alone: the app dials it with the Connection
 * Key, which must never cross in clear. v2 dropped each Plugin's state.
 */
export const ConnectionReport = ESchema.make('ConnectionReport', {
  ...reportFields,
  plugins: PluginStates,
})
  .evolve('v2', { plugins: null }, ({ plugins: _, ...v1 }) => v1)
  .build();
export type ConnectionReport = typeof ConnectionReport.Type;

/**
 * The answer to a Report. v2 is only which Release of each Plugin to run, and
 * the Minimum Connect. A `ke-connect` from before v2 cannot read it, which it
 * takes as a Report not sent: it must be installed again.
 */
export const ReportAnswer = ESchema.make('ReportAnswer', reportedFields)
  .evolve(
    'v2',
    {
      id: null,
      name: null,
      key: null,
      version: null,
      status: null,
      plugins: null,
      lastSeen: null,
    },
    ({ wanted, minConnect }) => ({ wanted, minConnect }),
  )
  .build();
export type ReportAnswer = typeof ReportAnswer.Type;

/**
 * A Connection as its User sees it: what it last reported, its Last Seen, and
 * what every Connection is told. An App keeps these on its device, so its
 * earlier versions still read: v2 added its Display Name, the name its User
 * gave it, null until one is given, and v3 dropped each Plugin's state. Its
 * `name` is its Computer Name, which the Connection reports.
 */
export const Connection = ESchema.make('Connection', reportedFields)
  .evolve('v2', { displayName: Schema.NullOr(Schema.String) }, (v1) => ({
    ...v1,
    displayName: null,
  }))
  .evolve('v3', { plugins: null }, ({ plugins: _, ...v2 }) => v2)
  .build();
export type Connection = typeof Connection.Type;

/** Whether a Connection is Outdated: it runs a `ke-connect` older than the Minimum Connect. */
export const isOutdated = (connection: {
  readonly version: string;
  readonly minConnect: string | null;
}) => belowMinimum(connection.version, connection.minConnect);

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

/** The longest Display Name, as long as the longest Computer Name. */
export const DISPLAY_NAME_MAX = 64;

/**
 * What `Rename` takes: the Connection, and its Display Name, or null to
 * go back to its Computer Name. Connect Cloud trims it, and keeps one left
 * empty as null.
 */
const RenamePayload = ESchema.make('RenamePayload', {
  id: Schema.NonEmptyString,
  displayName: Schema.NullOr(
    Schema.String.check(Schema.isMaxLength(DISPLAY_NAME_MAX)),
  ),
}).build();

const Rpcs = RpcGroup.make(
  Rpc.make('Report', {
    payload: ConnectionReport.schema,
    success: ReportAnswer.schema,
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
  Rpc.make('Rename', {
    payload: RenamePayload.schema,
    success: Schema.Void,
  }),
);

/** Every call needs a Sign-in; named so its type is published as is. */
export const CloudApi: Guarded<typeof Rpcs> = Authz.required(Rpcs);
