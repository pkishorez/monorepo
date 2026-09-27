import { createFileRoute, useRouter } from '@tanstack/react-router';
import { createIsomorphicFn } from '@tanstack/react-start';
import { Button } from 'kui-toolkit/components/ui/button';
import { Skeleton } from 'kui-toolkit/components/ui/skeleton';
import type { ReactNode } from 'react';
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
  pendingComponent: DataPending,
  errorComponent: DataError,
});

const PROVES = (
  <p>
    This route&apos;s loader runs on the server for the first page load and in
    the browser for client navigations, where it fetches /api/data. That
    endpoint has a network-first Runtime Cache rule, so offline the loader gets
    the last answer the worker saved.
  </p>
);

const STEPS: ReadonlyArray<ReactNode> = [
  'Press Reload data once while online. The server render never calls /api/data, so this fills the cache.',
  'Go offline, then come back here from another page or press Reload data: the same generatedAt comes back.',
  'Hard-reload offline: the App Shell boots and the loader runs in the browser, from cache.',
];

function DataPending() {
  return (
    <ScenarioPage
      id="data"
      title="Route data offline"
      proves={PROVES}
      steps={STEPS}
    >
      <Panel title="Loader data" outcome="running" outcomeLabel="Loading">
        <div
          aria-hidden="true"
          className="flex flex-col gap-3 rounded-lg bg-muted/40 p-3.5"
        >
          <Skeleton className="h-4 w-2/3" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-4 w-3/5" />
        </div>
      </Panel>
    </ScenarioPage>
  );
}

function DataError(props: { readonly error: Error }) {
  const router = useRouter();
  return (
    <ScenarioPage
      id="data"
      title="Route data offline"
      proves={PROVES}
      steps={STEPS}
    >
      <Panel
        title="Loader data"
        outcome="failure"
        outcomeLabel="Loader failed"
        outcomeTestId="data-outcome"
      >
        <div
          role="alert"
          className="flex flex-col gap-1 rounded-lg bg-destructive/10 p-3.5 text-sm ring-1 ring-destructive/20"
        >
          <p data-testid="data-error" className="font-medium text-destructive">
            Loader failed: {props.error.message}
          </p>
          <p className="text-muted-foreground">
            Nothing for /api/data is in the Runtime Cache yet. Load it once
            online, then try again offline.
          </p>
        </div>
        <Actions>
          <Button
            data-testid="data-retry"
            onClick={() => void router.invalidate()}
          >
            Try again
          </Button>
        </Actions>
      </Panel>
    </ScenarioPage>
  );
}

function Data() {
  const data = Route.useLoaderData();
  const router = useRouter();
  return (
    <ScenarioPage
      id="data"
      title="Route data offline"
      proves={PROVES}
      steps={STEPS}
    >
      <Panel
        title="Loader data"
        outcome="success"
        outcomeLabel={
          data.source === 'server render' ? 'Server render' : 'Loaded'
        }
        outcomeTestId="data-outcome"
      >
        <Readouts>
          <Readout label="Source" testId="data-source" value={data.source} />
          <Readout
            label="Generated at"
            testId="data-generated-at"
            value={data.generatedAt}
          />
        </Readouts>
        <ul
          data-testid="data-items"
          className="flex flex-col divide-y divide-border rounded-lg px-3.5 py-1 font-mono text-[13px] ring-1 ring-foreground/10"
        >
          {data.items.map((item) => (
            <li key={item.id} className="py-2">
              {item.label}
            </li>
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
