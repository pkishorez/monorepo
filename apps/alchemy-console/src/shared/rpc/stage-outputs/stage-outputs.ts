import { Rpc, RpcGroup } from 'effect/unstable/rpc';
import {
  readStageTarget,
  StoreDetailsError,
} from '../../contracts/state-address/index.ts';
import { stageOutputsView } from '../../contracts/stage-outputs/index.ts';
export const StageOutputs = RpcGroup.make(
  Rpc.make('AlchemyStateStore.GetStageOutputs', {
    payload: readStageTarget,
    success: stageOutputsView,
    error: StoreDetailsError,
  }),
);
