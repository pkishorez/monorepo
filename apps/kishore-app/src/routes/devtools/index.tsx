import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { DevtoolsShell } from './internal';

const queryClient = new QueryClient();

export const Route = createFileRoute('/devtools/')({
  component: () => (
    <ClientOnly fallback={<div className="min-h-dvh" />}>
      <QueryClientProvider client={queryClient}>
        <DevtoolsShell />
      </QueryClientProvider>
    </ClientOnly>
  ),
});
