import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import {
  readStageTarget,
  StoreDetailsError,
} from '../../contracts/state-address/index.ts';
import {
  resourceTarget,
  resourceSummariesView,
  resourceStateView,
} from '../../contracts/resource-browser/index.ts';

export const ResourceBrowser = RpcGroup.make(
  Rpc.make('AlchemyStateStore.ListResourceSummaries', {
    payload: readStageTarget,
    success: resourceSummariesView,
    error: StoreDetailsError,
  }),
  Rpc.make('AlchemyStateStore.GetResourceState', {
    payload: resourceTarget,
    success: resourceStateView,
    error: StoreDetailsError,
  }),
);
