import { useQuery } from '@tanstack/react-query';

export type ServerHealth = 'checking' | 'online' | 'offline';

const HEALTH_INTERVAL_MS = 5000;

/**
 * Poll the DevTools server on a loop (via react-query `refetchInterval`) to
 * track reachability. Any HTTP response counts as online; a connection failure
 * reads as offline. Empty `url` is always offline.
 */
export function useServerHealth(url: string): ServerHealth {
  const query = useQuery({
    queryKey: ['devtools-health', url],
    enabled: !!url,
    retry: false,
    refetchInterval: HEALTH_INTERVAL_MS,
    refetchIntervalInBackground: true,
    queryFn: async () => {
      await fetch(url, { method: 'GET' });
      return true;
    },
  });

  if (!url) return 'offline';
  if (query.isSuccess) return 'online';
  if (query.isError) return 'offline';
  return 'checking';
}
