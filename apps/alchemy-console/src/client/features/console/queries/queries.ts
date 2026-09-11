import type { QueryClient } from 'use-effect-ts/query';

export const rpcQueryKeys = {
  stores: ['stores'] as const,
  stacks: (storeId: string) => ['stores', storeId, 'stacks'] as const,
  stages: (storeId: string, stack: string) =>
    [...rpcQueryKeys.stacks(storeId), stack, 'stages'] as const,
  resources: (storeId: string, stack: string, stage: string) =>
    [...rpcQueryKeys.stages(storeId, stack), stage, 'resources'] as const,
  stageView: (storeId: string, stack: string, stage: string) =>
    [...rpcQueryKeys.stages(storeId, stack), stage, 'view'] as const,
  resource: (storeId: string, stack: string, stage: string, resource: string) =>
    [...rpcQueryKeys.resources(storeId, stack, stage), resource] as const,
};

export const refreshStoreState = (client: QueryClient, storeId: string) =>
  client.invalidateQueries({ queryKey: rpcQueryKeys.stacks(storeId) });
