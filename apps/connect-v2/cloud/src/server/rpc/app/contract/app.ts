import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/rpc';
import { Authz, type Guarded } from '@kestack/auth-toolkit';
import { ESchema } from '@kestack/std-toolkit/eschema';
import {
  Address,
  PluginHash,
  PluginName,
} from '../../heartbeat/contract/index.js';

export const RPC_PATH = '/rpc';

export const DISPLAY_NAME_MAX = 64;

export const Connection = ESchema.make('Connection', {
  id: Schema.String,
  name: Schema.String,
  displayName: Schema.NullOr(Schema.String),
  version: Schema.String,
  url: Schema.NullOr(Address),
  key: Schema.String,
  lastSeen: Schema.Finite,
  outdated: Schema.Boolean,
  plugins: Schema.Record(Schema.String, PluginHash),
}).build();
export type Connection = typeof Connection.Type;

export const Plugin = ESchema.make('Plugin', {
  name: PluginName,
  enabledByDefault: Schema.Boolean,
  enabled: Schema.Boolean,
}).build();
export type Plugin = typeof Plugin.Type;

export class ConnectionNotFound extends Schema.TaggedError<ConnectionNotFound>()(
  'ConnectionNotFound',
  { id: Schema.String },
) {}

export class PluginNotFound extends Schema.TaggedError<PluginNotFound>()(
  'PluginNotFound',
  { name: Schema.String },
) {}

const ById = ESchema.make('ById', { id: Schema.NonEmptyString }).build();

const RenamePayload = ESchema.make('RenamePayload', {
  id: Schema.NonEmptyString,
  displayName: Schema.NullOr(
    Schema.String.check(Schema.isMaxLength(DISPLAY_NAME_MAX)),
  ),
}).build();

const PluginPayload = ESchema.make('PluginPayload', {
  id: Schema.NonEmptyString,
  plugin: PluginName,
}).build();

const Rpcs = RpcGroup.make(
  Rpc.make('List', {
    success: Schema.Array(Connection.schema),
  }),
  Rpc.make('Rename', {
    payload: RenamePayload.schema,
    success: Schema.Void,
    error: ConnectionNotFound,
  }),
  Rpc.make('Remove', {
    payload: ById.schema,
    success: Schema.Void,
  }),
  Rpc.make('Plugins', {
    payload: ById.schema,
    success: Schema.Array(Plugin.schema),
    error: ConnectionNotFound,
  }),
  Rpc.make('EnablePlugin', {
    payload: PluginPayload.schema,
    success: Schema.Void,
    error: Schema.Union([ConnectionNotFound, PluginNotFound]),
  }),
  Rpc.make('DisablePlugin', {
    payload: PluginPayload.schema,
    success: Schema.Void,
    error: Schema.Union([ConnectionNotFound, PluginNotFound]),
  }),
);

export const AppApi: Guarded<typeof Rpcs> = Authz.required(Rpcs);
