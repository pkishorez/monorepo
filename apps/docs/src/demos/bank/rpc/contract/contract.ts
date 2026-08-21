import { Schema } from 'effect';
import { Rpc, RpcGroup, RpcSerialization } from 'effect/unstable/rpc';
import { EntitySchema } from 'std-toolkit/core';
import { AccountSchema } from '../../contract/account/index.ts';
import { InvalidName } from '../../contract/name/index.ts';
import { TransferRefused } from '../../contract/refusal/index.ts';
import { TransferSchema } from '../../contract/transfer/index.ts';

export const AccountEntity = EntitySchema(AccountSchema);
export const TransferEntity = EntitySchema(TransferSchema);

export const TransferDirectionSchema = Schema.Literals(['sent', 'received']);
export type TransferDirection = typeof TransferDirectionSchema.Type;

export class BankMutations extends RpcGroup.make(
  Rpc.make('openAccount', {
    payload: {
      id: Schema.String,
      name: Schema.String,
      balance: Schema.Int,
    },
    success: AccountEntity,
    error: InvalidName,
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
  Rpc.make('seed', {
    success: Schema.Boolean,
  }),
) {}

export class BankSubscriptions extends RpcGroup.make(
  Rpc.make('subscribeAccounts', {
    payload: { '>': Schema.NullOr(AccountEntity) },
    success: AccountEntity,
    stream: true,
  }),
  Rpc.make('subscribeTransfers', {
    payload: {
      account: Schema.String,
      direction: TransferDirectionSchema,
      '>': Schema.NullOr(TransferEntity),
    },
    success: TransferEntity,
    stream: true,
  }),
  Rpc.make('subscribeAllTransfers', {
    payload: { '>': Schema.NullOr(TransferEntity) },
    success: TransferEntity,
    stream: true,
  }),
) {}

export const BankRpcs = BankMutations.merge(BankSubscriptions);

export const BankRpcSerializationLayer = RpcSerialization.layerNdjson;
