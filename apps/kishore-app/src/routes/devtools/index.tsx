import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ClientOnly, createFileRoute } from '@tanstack/react-router';
import { DevtoolsShell } from './internal';
import type { DevtoolsTool } from './internal/store';

const queryClient = new QueryClient();

/**
 * Search params driving the workbench: which tool is active, plus the optional
 * one-shot `?url=` handed in by the CLI.
 */
type DevtoolsSearch = {
  tool: DevtoolsTool;
  url?: string;
};

export const Route = createFileRoute('/devtools/')({
  validateSearch: (search: Record<string, unknown>): DevtoolsSearch => ({
    tool: search.tool === 'depcruise' ? 'depcruise' : 'otel',
    url: typeof search.url === 'string' ? search.url : undefined,
  }),
  component: () => (
    <ClientOnly fallback={<div className="min-h-dvh" />}>
      <QueryClientProvider client={queryClient}>
        <DevtoolsShell />
      </QueryClientProvider>
    </ClientOnly>
  ),
});
