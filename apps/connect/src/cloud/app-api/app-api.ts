import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { Authz, type Guarded } from '@kestack/auth-toolkit';
import { PluginState } from '@kestack/cli-platform/plugins/contract';
import { ESchema, ValueESchema } from '@kestack/std-toolkit/eschema';
import {
  belowMinimum,
  ConnectionStatus,
  Release,
} from '../../heartbeat/index.js';

/*
 * What Connect Cloud and an App say to each other: an App lists the caller's
 * Connections, renames one and forgets one, and asks where a Release stands,
 * its Release Standing (ADR 0006). Every call is the signed-in caller's own,
 * so nothing names a User. Both sides update themselves, so this changes
 * freely (ADR 0011); a Connection carries the Connection Status its last
 * Heartbeat said.
 */

/** The RPC's path on Connect Cloud. */
export const RPC_PATH = '/rpc';

/** A non-empty string of at most `max` characters. */
const Bounded = (max: number) =>
  Schema.NonEmptyString.check(Schema.isMaxLength(max));

/** A version of Connect, as a Report names it. */
const Version = Schema.String.check(Schema.isMaxLength(32));

/** A Connection as v1 carried it: what it last reported, and what every Connection is told. */
const v1Fields = {
  id: Bounded(64),
  name: Bounded(64),
  /** Its Connection Key now (ADR 0009). */
  key: Bounded(128),
  /** The version of Connect it runs. */
  version: Version,
  status: ConnectionStatus.schema,
  /** Where each Plugin stood; v3 dropped it. */
  plugins: Schema.Record(Schema.String, PluginState.schema),
  /** Its Last Seen: when it last reported, epoch ms, by Connect Cloud's clock. */
  lastSeen: Schema.Finite,
  /** The latest Release of each Plugin, by name. */
  wanted: Schema.Record(Schema.String, Release),
  /** The Minimum Connect, null when Connect Cloud names none. */
  minConnect: Schema.NullOr(Version),
};

/**
 * A Connection as its User sees it: what it last reported, its Last Seen, and
 * what every Connection is told. An App keeps these on its device, so its
 * earlier versions still read: v2 added its Display Name, the name its User
 * gave it, null until one is given, and v3 dropped each Plugin's state. Its
 * `name` is its Computer Name, which the Connection reports.
 */
export const Connection = ESchema.make('Connection', v1Fields)
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

/**
 * Where one Release of a Plugin stands, as Connect Cloud answers it: the one it
 * names now (`Latest`), one whose Release File it keeps though it names another
 * (`Older`), or one it has never heard of (`Unknown`), so newer than what it
 * runs: its deploy is pending, or failed.
 */
export const ReleaseStanding = ValueESchema.make(
  'ReleaseStanding',
  Schema.Union([
    Schema.Struct({ _tag: Schema.Literal('Latest') }),
    Schema.Struct({ _tag: Schema.Literal('Older') }),
    Schema.Struct({ _tag: Schema.Literal('Unknown') }),
  ]),
).build();
export type ReleaseStanding = typeof ReleaseStanding.Type;

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

/** What `Standing` takes: a Plugin, and the hash of one of its Releases. */
const StandingPayload = ESchema.make('StandingPayload', {
  plugin: Bounded(64),
  hash: Bounded(64),
}).build();

const Rpcs = RpcGroup.make(
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
  Rpc.make('Standing', {
    payload: StandingPayload.schema,
    success: ReleaseStanding.schema,
  }),
);

/** Every call needs a Sign-in; named so its type is published as is. */
export const AppApi: Guarded<typeof Rpcs> = Authz.required(Rpcs);
