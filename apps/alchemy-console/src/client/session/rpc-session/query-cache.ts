import { Cause, Effect, Exit } from 'effect';
import { QueryClient, queryOptions } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';

export const rpcQueryKeys = {
  stores: ['stores'] as const,
  stacks: (storeId: string) => ['stores', storeId, 'stacks'] as const,
  stages: (storeId: string, stack: string) =>
    [...rpcQueryKeys.stacks(storeId), stack, 'stages'] as const,
  resources: (storeId: string, stack: string, stage: string) =>
    [...rpcQueryKeys.stages(storeId, stack), stage, 'resources'] as const,
  summaries: (storeId: string, stack: string, stage: string) =>
    [...rpcQueryKeys.stages(storeId, stack), stage, 'summaries'] as const,
  outputs: (storeId: string, stack: string, stage: string) =>
    [...rpcQueryKeys.stages(storeId, stack), stage, 'outputs'] as const,
  resource: (storeId: string, stack: string, stage: string, resource: string) =>
    [...rpcQueryKeys.resources(storeId, stack, stage), resource] as const,
};

export const makeQueryClient = () =>
  new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 0,
        gcTime: 30 * 60 * 1000,
        retry: false,
      },
    },
  });

export function effectQueryOptions<A, E>(
  queryKey: QueryKey,
  effect: Effect.Effect<A, E>,
) {
  return queryOptions({
    queryKey,
    queryFn: async ({ signal }) => {
      const exit = await Effect.runPromiseExit(effect, { signal });
      if (Exit.isFailure(exit)) throw Cause.squash(exit.cause);
      return exit.value;
    },
  });
}
