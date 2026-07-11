import { useEffect } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Effect } from 'effect';
import { createStdSync } from 'std-toolkit/tanstack-sync';
import { TanStackSyncDevtools } from './tanstack-sync-devtools';
import { mockCollections, mockPartitions } from './mock-data';

const queryClient = new QueryClient();
const { inspector } = createStdSync();

for (const collection of mockCollections) {
  inspector.collections.insert(collection);
}
for (const partition of mockPartitions) {
  inspector.partitions.insert(partition);
}

function Fixture() {
  useEffect(() => {
    window.dispatchEvent(new Event('open-devtools'));
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <TanStackSyncDevtools
        inspector={inspector}
        runPromise={Effect.runPromise}
      />
    </QueryClientProvider>
  );
}

export default <Fixture />;
