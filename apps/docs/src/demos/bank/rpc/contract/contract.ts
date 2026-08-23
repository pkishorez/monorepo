import { Context, Schema } from 'effect';
import { Rpc, RpcGroup, RpcSerialization } from 'effect/unstable/rpc';
import { EntitySchema } from 'std-toolkit/core';
import { AccountSchema } from '../../contract/account/index.ts';
import { InvalidName } from '../../contract/name/index.ts';
import { TransferRefused } from '../../contract/refusal/index.ts';
import { TransferSchema } from '../../contract/transfer/index.ts';

export const AccountEntity = EntitySchema(AccountSchema);
export const TransferEntity = EntitySchema(TransferSchema);
export const AccountBatch = Schema.Array(AccountEntity);
export const TransferBatch = Schema.Array(TransferEntity);

export const RoleSchema = Schema.Literals(['admin', 'guest']);
export type Role = typeof RoleSchema.Type;
export const Role = Context.Reference<Role>('bank/Role', {
  defaultValue: () => 'guest',
});

export class Forbidden extends Schema.TaggedError<Forbidden>()(
  'Forbidden',
  {},
) {}

export class BankMutations extends RpcGroup.make(
  Rpc.make('openAccount', {
    payload: {
      id: Schema.String,
      name: Schema.String,
      balance: Schema.Int,
    },
    success: AccountEntity,
    error: Schema.Union([InvalidName, Forbidden]),
  }),
  Rpc.make('transfer', {
    payload: {
      id: Schema.String,
      from: Schema.String,
      to: Schema.String,
      amount: Schema.Number,
    },
    success: Schema.Struct({
      transfer: TransferEntity,
      accounts: Schema.Array(AccountEntity),
    }),
    error: TransferRefused,
  }),
  Rpc.make('clear', {
    success: Schema.Void,
    error: Forbidden,
  }),
  Rpc.make('session', {
    success: Schema.Struct({ role: RoleSchema }),
  }),
) {}

export class BankSubscriptions extends RpcGroup.make(
  Rpc.make('subscribeAccounts', {
    payload: { '>': Schema.NullOr(AccountEntity) },
    success: AccountBatch,
    stream: true,
  }),
  Rpc.make('subscribeTransfersFrom', {
    payload: { from: Schema.String, '>': Schema.NullOr(TransferEntity) },
    success: TransferBatch,
    stream: true,
  }),
  Rpc.make('subscribeTransfersTo', {
    payload: { to: Schema.String, '>': Schema.NullOr(TransferEntity) },
    success: TransferBatch,
    stream: true,
  }),
) {}

export const BankRpcs = BankMutations.merge(BankSubscriptions);

export const BankRpcSerializationLayer = RpcSerialization.layerNdjson;
