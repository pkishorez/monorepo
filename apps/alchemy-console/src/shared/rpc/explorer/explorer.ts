import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import {
  storeTarget,
  stackTarget,
  stageTarget,
  namesView,
  BrowseError,
} from '../../contracts/targets/index.ts';
import {
  resourceTarget,
  resourceStateView,
  stageView,
} from '../../contracts/resources/index.ts';

export const Explorer = RpcGroup.make(
  Rpc.make('Explorer.ListStacks', {
    payload: storeTarget,
    success: namesView,
    error: BrowseError,
  }),
  Rpc.make('Explorer.ListStages', {
    payload: stackTarget,
    success: namesView,
    error: BrowseError,
  }),
  Rpc.make('Explorer.ListResources', {
    payload: stageTarget,
    success: namesView,
    error: BrowseError,
  }),
  Rpc.make('Explorer.GetStageView', {
    payload: stageTarget,
    success: stageView,
    error: BrowseError,
  }),
  Rpc.make('Explorer.GetResourceState', {
    payload: resourceTarget,
    success: resourceStateView,
    error: BrowseError,
  }),
);
