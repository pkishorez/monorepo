import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import {
  storeTarget,
  stackTarget,
  readStageTarget,
  namesView,
  StoreDetailsError,
} from '../../contracts/state-address/index.ts';
export const StateBrowser = RpcGroup.make(
  Rpc.make('AlchemyStateStore.ListStacks', {
    payload: storeTarget,
    success: namesView,
    error: StoreDetailsError,
  }),
  Rpc.make('AlchemyStateStore.ListStages', {
    payload: stackTarget,
    success: namesView,
    error: StoreDetailsError,
  }),
  Rpc.make('AlchemyStateStore.ListResources', {
    payload: readStageTarget,
    success: namesView,
    error: StoreDetailsError,
  }),
);
