import type { Effect } from 'effect';
import { queryOptions, useQuery } from '@tanstack/react-query';
import type { QueryKey, UseQueryOptions } from '@tanstack/react-query';
import { executeQuery } from './execution.js';

export {
  QueryClient,
  QueryClientProvider,
  useQueryClient,
} from '@tanstack/react-query';
export type { QueryKey } from '@tanstack/react-query';

type EffectQueryOptions<A, Data = A, Key extends QueryKey = QueryKey> = Omit<
  UseQueryOptions<A, unknown, Data, Key>,
  'queryKey' | 'queryFn'
>;

/** Build options for the same Effect boundary used by useEffectQuery. */
export function effectQueryOptions<
  A,
  E,
  Data = A,
  Key extends QueryKey = QueryKey,
>(
  key: Key,
  effect: Effect.Effect<A, E>,
  options: EffectQueryOptions<A, Data, Key> = {},
) {
  return queryOptions({
    ...options,
    queryKey: key,
    queryFn: ({ signal }) => executeQuery(effect, signal),
  });
}

/** Cached Effect execution using the nearest QueryClientProvider. */
export function useEffectQuery<A, E, Data = A, Key extends QueryKey = QueryKey>(
  key: Key,
  effect: Effect.Effect<A, E>,
  options: EffectQueryOptions<A, Data, Key> = {},
) {
  return useQuery(effectQueryOptions(key, effect, options));
}
