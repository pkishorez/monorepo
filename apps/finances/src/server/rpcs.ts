import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import { Schema } from 'effect';
import { makeEntityRpcGroup, StdToolkitError } from '@std-toolkit/core/rpc';
import { EntitySchema, SingleEntitySchema } from '@std-toolkit/core';
import {
  OverrideSchema,
  ProjectionOutputSchema,
  SettingsSchema,
  TransactionSchema,
} from '../domain/index.js';

const [getOverride, insertOverride, updateOverride, deleteOverride] =
  makeEntityRpcGroup(OverrideSchema);

const saveOverride = Rpc.make('saveOverride', {
  payload: Schema.Struct({
    transactionId: Schema.String,
    category: Schema.String,
    subcategory: Schema.String,
    notes: Schema.optional(Schema.String),
    verified: Schema.Boolean,
    ignore: Schema.Boolean,
    cancelled_by: Schema.NullOr(Schema.String),
  }),
  success: EntitySchema(OverrideSchema),
  error: StdToolkitError,
});

const replaceTransactions = Rpc.make('replaceTransactions', {
  payload: ProjectionOutputSchema,
  success: Schema.Array(EntitySchema(TransactionSchema)),
  error: StdToolkitError,
});

const SubscribePayloadSchema = Schema.Struct({
  cursor: Schema.NullOr(Schema.String),
  limit: Schema.optional(Schema.Number),
});

const makeSyncEventSchema = <S extends Parameters<typeof EntitySchema>[0]>(
  schema: S,
) =>
  Schema.Union([
    Schema.Struct({
      _tag: Schema.Literal('batch'),
      items: Schema.Array(EntitySchema(schema)),
    }),
    Schema.Struct({ _tag: Schema.Literal('initial-sync-done') }),
    Schema.Struct({ _tag: Schema.Literal('heartbeat') }),
  ]);

const subscribeTransactions = Rpc.make('subscribeTransactions', {
  payload: SubscribePayloadSchema,
  success: makeSyncEventSchema(TransactionSchema),
  error: StdToolkitError,
  stream: true,
});

const subscribeOverrides = Rpc.make('subscribeOverrides', {
  payload: SubscribePayloadSchema,
  success: makeSyncEventSchema(OverrideSchema),
  error: StdToolkitError,
  stream: true,
});

const getSettings = Rpc.make('getSettings', {
  payload: Schema.Struct({}),
  success: SingleEntitySchema(SettingsSchema),
  error: StdToolkitError,
});

const putSettings = Rpc.make('putSettings', {
  payload: SettingsSchema.schema,
  success: SingleEntitySchema(SettingsSchema),
  error: StdToolkitError,
});

export const AppRpcs = RpcGroup.make(
  getOverride,
  insertOverride,
  updateOverride,
  deleteOverride,
  saveOverride,
  replaceTransactions,
  subscribeTransactions,
  subscribeOverrides,
  getSettings,
  putSettings,
);
