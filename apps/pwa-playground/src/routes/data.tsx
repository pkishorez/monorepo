import { createFileRoute, useRouter } from '@tanstack/react-router';
import { createIsomorphicFn } from '@tanstack/react-start';
import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { Skeleton } from '@kstackz/ui-toolkit/components/ui/skeleton';
import type { ReactNode } from 'react';
import {
  Actions,
  Checklist,
  Code,
  Controls,
  Notice,
  Page,
  Playground,
  Stage,
  Value,
  Values,
} from '../components/index.ts';
import { makeData, type RouteData } from '../lib/data.ts';

type Loaded = RouteData & { readonly source: string };

// The server renders fresh data; in the browser the loader fetches
// /api/data, which the worker caches network-first ('data').
const loadData = createIsomorphicFn()
  .server(async (): Promise<Loaded> => ({
    ...makeData(),
    source: 'server render',
  }))
  .client(async (): Promise<Loaded> => {
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

const CODE = `// vite.config.ts: the loader's endpoint, network first
{ match: { origin: 'same-origin', pathPrefix: '/api/data' },
  strategy: 'network-first', cacheName: 'data', networkTimeoutMs: 2000 }

// routes/data.tsx: nothing offline-specific in the route itself
export const Route = createFileRoute('/data')({
  loader: () => fetch('/api/data').then((r) => r.json()),
  staleTime: 0,
});`;

/** The page around the loader's three states: loading, loaded, failed. */
function DataPage(props: {
  readonly stage: ReactNode;
  readonly source: string;
  readonly generatedAt: string;
  readonly retry?: boolean;
}) {
  const router = useRouter();
  return (
    <Page
      path="/data"
      testId="scenario-data"
      lede={
        <p>
          This page’s loader fetches its data. The worker saves every answer, so
          with the network gone the loader still gets the last one, and the
          route renders as if nothing happened.
        </p>
      }
    >
      <Playground>
        <Stage>{props.stage}</Stage>
        <Controls>
          <Actions>
            <Button
              data-testid={props.retry === true ? 'data-retry' : 'data-reload'}
              onClick={() => void router.invalidate()}
            >
              {props.retry === true ? 'Try again' : 'Reload data'}
            </Button>
          </Actions>
          <p className="text-sm text-pretty text-muted-foreground">
            Reloading reruns the loader. On a phone, pull down to do the same.
          </p>
        </Controls>
        <Values>
          <Value label="Source" testId="data-source">
            {props.source}
          </Value>
          <Value label="Generated" testId="data-generated-at">
            {props.generatedAt}
          </Value>
        </Values>
      </Playground>
      <Code title="Route data" code={CODE} />
      <Notice
        items={[
          'The first page load renders on the server and never calls /api/data, so reload once to fill the cache.',
          'Offline, the same generatedAt comes back: that is the saved answer, not a new one.',
          'Hard-reload offline and the app shell boots from the precache, then the loader runs in the browser, from cache.',
        ]}
      />
      <Checklist
        steps={[
          'Press Reload data once while online. The server render never calls /api/data, so this fills the cache.',
          'Go offline, then come back here from another page or press Reload data: the same generatedAt comes back.',
          'Hard-reload offline: the app shell boots and the loader runs in the browser, from cache.',
        ]}
      />
    </Page>
  );
}

function Card(props: { readonly children: ReactNode }) {
  return (
    <div className="flex w-full max-w-sm flex-col gap-4 rounded-2xl bg-background p-5 shadow-sm ring-1 ring-foreground/10">
      {props.children}
    </div>
  );
}

function DataPending() {
  return (
    <DataPage
      source="loading…"
      generatedAt="—"
      stage={
        <Card>
          <div aria-hidden="true" className="flex flex-col gap-3">
            <Skeleton className="h-3 w-1/3" />
            <Skeleton className="h-6 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
            <Skeleton className="h-4 w-3/5" />
          </div>
        </Card>
      }
    />
  );
}

function DataError(props: { readonly error: Error }) {
  return (
    <DataPage
      source="failed"
      generatedAt="—"
      retry
      stage={
        <Card>
          <div role="alert" className="flex flex-col gap-1.5 text-sm">
            <p
              data-testid="data-error"
              className="font-medium text-destructive"
            >
              Loader failed: {props.error.message}
            </p>
            <p className="text-pretty text-muted-foreground">
              Nothing for /api/data is saved yet. Load it once online, then try
              again offline.
            </p>
          </div>
        </Card>
      }
    />
  );
}

function Data() {
  const data = Route.useLoaderData();
  const server = data.source === 'server render';
  return (
    <DataPage
      source={server ? 'server render' : 'fetch'}
      generatedAt={data.generatedAt.slice(11, 19)}
      stage={
        <Card>
          <div className="flex flex-col gap-1">
            <span
              data-testid="data-outcome"
              className="text-xs text-muted-foreground"
            >
              {server ? 'Rendered on the server' : 'Loaded in the browser'}
            </span>
            <span className="font-mono text-lg tabular-nums">
              {data.generatedAt.slice(11, 23)}
            </span>
          </div>
          <ul
            data-testid="data-items"
            className="flex flex-col divide-y divide-border font-mono text-[13px]"
          >
            {data.items.map((item) => (
              <li key={item.id} className="py-2">
                {item.label}
              </li>
            ))}
          </ul>
          <p className="truncate font-mono text-[11px] text-muted-foreground">
            {data.source}
          </p>
        </Card>
      }
    />
  );
}
