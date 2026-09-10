import type { Effect } from 'effect';
import type { QueryClient, QueryKey } from 'use-effect-ts/query';
import type { Rpc } from '../../../connections/rpc/index.ts';
import {
  useRpcQuery as useQuery,
  useRpcAction as useAction,
} from '../../../session/rpc-session/index.ts';

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

function message(error: unknown): string {
  if (typeof error !== 'object' || error === null)
    return 'The request failed before it reached the server. Retry.';
  if ('_tag' in error && error._tag === 'Unauthenticated')
    return 'Your session expired. Sign in again to continue.';
  if (
    '_tag' in error &&
    ['StateStoreError', 'StoreDetailsError', 'DeleteStageError'].includes(
      String(error._tag),
    ) &&
    'reason' in error &&
    typeof error.reason === 'string' &&
    error.reason.trim()
  )
    return error.reason;
  if ('code' in error) {
    switch (error.code) {
      case 'cloudflare-permission':
        return 'The Cloudflare token needs access to Workers and Secrets Store.';
      case 'state-store-missing':
        return 'No Alchemy state store was found. Deploy it in this Cloudflare account first.';
      case 'discovery-failed':
        return 'Could not discover the state store. Check the account ID and API token, then retry.';
      case 'not-found':
        return 'This store is no longer available.';
      case 'remote-error':
        return 'Could not read this store. Check its URL and token, then try again.';
      case 'invalid-state':
        return 'This store returned state we could not read.';
      case 'unsupported-endpoint':
        return 'Use the Cloudflare Worker’s HTTPS workers.dev URL for this store.';
      case 'timeout':
        return 'The store took too long to respond. Retry in a moment.';
    }
  }
  return 'The request didn’t complete. Retry.';
}

export function useRpcQuery<A, E>(
  query: Effect.Effect<A, E, Rpc>,
  key: QueryKey,
  options: { enabled?: boolean } = {},
) {
  return useQuery(query, key, { ...options, errorMessage: message });
}
export function useRpcAction<Input, A, E>(
  action: (input: Input) => Effect.Effect<A, E, Rpc>,
  onSuccess: (value: A) => void,
) {
  return useAction(action, onSuccess, { errorMessage: message });
}
