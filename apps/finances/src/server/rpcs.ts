import { Rpc, RpcGroup } from '@effect/rpc';
import { Schema } from 'effect';
import { makeEntityRpcGroup, StdToolkitError } from '@std-toolkit/core/rpc';
import { EntitySchema } from '@std-toolkit/core';
import { CategorySettingSchema, OverrideSchema } from '../domain/index.js';

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

const listOverrides = Rpc.make('listOverrides', {
  payload: Schema.Struct({}),
  success: Schema.Array(EntitySchema(OverrideSchema)),
  error: StdToolkitError,
});

const saveCategorySetting = Rpc.make('saveCategorySetting', {
  payload: Schema.Struct({
    category: Schema.String,
    type: Schema.Literal('income', 'spend', 'transfer', 'ignore'),
  }),
  success: EntitySchema(CategorySettingSchema),
  error: StdToolkitError,
});

const listCategorySettings = Rpc.make('listCategorySettings', {
  payload: Schema.Struct({}),
  success: Schema.Array(EntitySchema(CategorySettingSchema)),
  error: StdToolkitError,
});

const deleteCategorySetting = Rpc.make('deleteCategorySetting', {
  payload: Schema.Struct({
    category: Schema.String,
  }),
  success: Schema.Void,
  error: StdToolkitError,
});

export const AppRpcs = RpcGroup.make(
  getOverride,
  insertOverride,
  updateOverride,
  deleteOverride,
  saveOverride,
  listOverrides,
  saveCategorySetting,
  listCategorySettings,
  deleteCategorySetting,
);
