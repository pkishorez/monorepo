import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import {
  createStoreInput,
  updateStoreInput,
  storeView,
  StoreError,
} from '../../contracts/stores/index.ts';
import { stackTarget } from '../../contracts/targets/index.ts';

const nonEmpty = Schema.String.check(
  Schema.makeFilter((value) => value.trim().length > 0),
);

export const Stores = RpcGroup.make(
  Rpc.make('Stores.Create', {
    payload: createStoreInput,
    success: storeView,
    error: StoreError,
  }),
  Rpc.make('Stores.List', {
    payload: {},
    success: Schema.Array(storeView),
    error: StoreError,
  }),
  Rpc.make('Stores.Update', {
    payload: updateStoreInput,
    success: storeView,
    error: StoreError,
  }),
  Rpc.make('Stores.Delete', {
    payload: { id: nonEmpty },
    success: Schema.Void,
    error: StoreError,
  }),
  Rpc.make('Stores.DeleteStack', {
    payload: stackTarget,
    success: Schema.Void,
    error: StoreError,
  }),
);
