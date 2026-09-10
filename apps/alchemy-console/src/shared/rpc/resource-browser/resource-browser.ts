import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import {
  readStageTarget,
  StoreDetailsError,
} from '../../contracts/state-address/index.ts';
import {
  resourceTarget,
  resourceStateView,
  stageView,
} from '../../contracts/resource-browser/index.ts';

export const ResourceBrowser = RpcGroup.make(
  Rpc.make('AlchemyStateStore.GetStageView', {
    payload: readStageTarget,
    success: stageView,
    error: StoreDetailsError,
  }),
  Rpc.make('AlchemyStateStore.GetResourceState', {
    payload: resourceTarget,
    success: resourceStateView,
    error: StoreDetailsError,
  }),
);
