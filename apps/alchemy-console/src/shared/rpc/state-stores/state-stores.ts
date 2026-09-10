import { Schema } from 'effect';
import { Rpc, RpcGroup } from 'effect/unstable/rpc';

import {
  createStateStoreInput,
  stateStoreView,
  StateStoreError,
} from '../../contracts/state-stores/index.ts';

const nonEmpty = Schema.String.check(
  Schema.makeFilter((value) => value.trim().length > 0),
);

export const StateStores = RpcGroup.make(
  Rpc.make('AlchemyStateStore.UpdateCredentials', {
    payload: {
      id: nonEmpty,
      accountId: createStateStoreInput.fields.connection.fields.accountId,
      apiToken: nonEmpty,
    },
    success: stateStoreView,
    error: StateStoreError,
  }),
  Rpc.make('AlchemyStateStore.Create', {
    payload: createStateStoreInput,
    success: stateStoreView,
    error: StateStoreError,
  }),
  Rpc.make('AlchemyStateStore.List', {
    payload: {},
    success: Schema.Array(stateStoreView),
    error: StateStoreError,
  }),
  Rpc.make('AlchemyStateStore.Rename', {
    payload: { id: nonEmpty, name: nonEmpty },
    success: stateStoreView,
    error: StateStoreError,
  }),
  Rpc.make('AlchemyStateStore.Delete', {
    payload: { id: nonEmpty },
    success: Schema.Void,
    error: StateStoreError,
  }),
);
