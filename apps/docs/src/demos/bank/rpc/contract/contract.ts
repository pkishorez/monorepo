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

export class BankRpcs extends RpcGroup.make(
  Rpc.make('listAccounts', {
    payload: { cursor: Schema.NullOr(AccountEntity) },
    success: Schema.Array(AccountEntity),
  }),
  Rpc.make('openAccount', {
    payload: {
      id: Schema.String,
      name: Schema.String,
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
  Rpc.make('listTransfers', {
    payload: {
      account: Schema.String,
      direction: TransferDirectionSchema,
      cursor: Schema.NullOr(TransferEntity),
    },
    success: Schema.Array(TransferEntity),
  }),
  Rpc.make('listAllTransfers', {
    payload: { cursor: Schema.NullOr(TransferEntity) },
    success: Schema.Array(TransferEntity),
  }),
  Rpc.make('seed', {
    success: Schema.Boolean,
  }),
) {}

export const BankRpcSerializationLayer = RpcSerialization.layerNdjson;

export const BANK_RPC_PATH = '/api/bank/rpc';
