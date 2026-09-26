import { createFileRoute, useRouter } from '@tanstack/react-router';
import { createIsomorphicFn } from '@tanstack/react-start';
import { Button } from 'kui-toolkit/components/ui/button';
import {
  Actions,
  Panel,
  Readout,
  Readouts,
  ScenarioPage,
} from '../components/index.ts';
import { makeData, type RouteData } from '../lib/data.ts';

// The server renders fresh data; in the browser the loader fetches
// /api/data, which the worker caches network-first ('data').
const loadData = createIsomorphicFn()
  .server(async (): Promise<RouteData & { source: string }> => ({
    ...makeData(),
    source: 'server render',
  }))
  .client(async (): Promise<RouteData & { source: string }> => {
    const response = await fetch('/api/data');
    if (!response.ok) throw new Error(`/api/data answered ${response.status}`);
    const data = (await response.json()) as RouteData;
    return { ...data, source: `fetch ${response.headers.get('x-served-at')}` };
  });

export const Route = createFileRoute('/data')({
  loader: () => loadData(),
  // Always rerun the loader, so offline behaviour shows on every visit.
  staleTime: 0,
  component: Data,
  errorComponent: ({ error }) => (
    <main className="mx-auto max-w-3xl px-4 py-8">
      <p data-testid="data-error">Loader failed: {error.message}</p>
    </main>
  ),
});

function Data() {
  const data = Route.useLoaderData();
  const router = useRouter();
  return (
    <ScenarioPage
      id="data"
      title="Route data offline"
      explanation={
        <>
          <p>
            This route&apos;s loader runs on the server for the first page load
            and in the browser for client navigations, where it fetches
            /api/data. That endpoint has a network-first Runtime Cache rule.
          </p>
          <p>
            Visit once online, go offline, then navigate here again or press
            Reload: the loader gets the last cached answer (same generatedAt). A
            hard reload offline opens the App Shell, which runs the loader in
            the browser too.
          </p>
        </>
      }
    >
      <Panel title="Loader data">
        <Readouts>
          <Readout label="Source" testId="data-source" value={data.source} />
          <Readout
            label="Generated at"
            testId="data-generated-at"
            value={data.generatedAt}
          />
        </Readouts>
        <ul data-testid="data-items" className="font-mono text-sm">
          {data.items.map((item) => (
            <li key={item.id}>{item.label}</li>
          ))}
        </ul>
        <Actions>
          <Button
            data-testid="data-reload"
            onClick={() => void router.invalidate()}
          >
            Reload data
          </Button>
        </Actions>
      </Panel>
    </ScenarioPage>
  );
}
