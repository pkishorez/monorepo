import { QueryClient } from 'use-effect-ts/query';

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
