import { createFileRoute } from '@tanstack/react-router';
import { Button } from '@kstackz/ui-toolkit/components/ui/button';
import { cn } from '@kstackz/ui-toolkit/utils';
import {
  useDisplayMode,
  useOnline,
  useStoragePersistence,
} from '@kstackz/pwa-toolkit/extras';
import { usePwa } from '@kstackz/pwa-toolkit/react';
import { useCallback, useEffect, useState } from 'react';
import {
  Actions,
  BuiltAt,
  Checklist,
  Code,
  Controls,
  Page,
  Playground,
  Section,
  Stage,
  Value,
  Values,
} from '../components/index.ts';
import { buildLabel, pageBuildId } from '../lib/build.ts';
import { readWorkers, type WorkerSnapshot } from '../lib/workers.ts';
import { usePageRefresh } from '../shell/index.ts';

export const Route = createFileRoute('/status')({ component: Status });

interface CacheSummary {
  readonly name: string;
  readonly entries: number;
}

// caches.open() recreates a cache the worker just deleted, so check first.
const countEntries = async (name: string): Promise<number | null> =>
  (await caches.has(name))
    ? (await (await caches.open(name)).keys()).length
    : null;

const readCaches = async (): Promise<ReadonlyArray<CacheSummary>> => {
  if (typeof caches === 'undefined') return [];
  const counted = await Promise.all(
    (await caches.keys()).map(async (name) => ({
      name,
      entries: await countEntries(name),
    })),
  );
  return counted.flatMap(({ name, entries }) =>
    entries === null ? [] : [{ name, entries }],
  );
};

const formatBytes = (bytes: number) =>
  `${(bytes / 1024 / 1024).toFixed(2)} MiB`;

/** The worker's lifecycle as four slots, each holding a worker or nothing. */
function Lifecycle(props: { readonly workers: WorkerSnapshot | null }) {
  const w = props.workers;
  const slots = [
    ['Installing', w?.installing, 'status-installing'],
    ['Waiting', w?.waiting, 'status-waiting'],
    ['Active', w?.active, 'status-active'],
    ['Controls this tab', w?.controller, 'status-controller'],
  ] as const;
  return (
    <ol
      aria-label="Service worker lifecycle"
      className="grid w-full max-w-xl grid-cols-2 gap-2 sm:grid-cols-4"
    >
      {slots.map(([label, value, testId]) => {
        const on = value !== undefined && value !== 'none';
        return (
          <li
            key={label}
            className={cn(
              'flex min-h-20 flex-col justify-between gap-2 rounded-xl p-3 transition-colors duration-150',
              on
                ? 'bg-background ring-1 ring-foreground/25'
                : 'border border-dashed border-foreground/15',
            )}
          >
            <span className="text-xs text-muted-foreground">{label}</span>
            <span
              data-testid={testId}
              className={cn(
                'font-mono text-xs [overflow-wrap:anywhere]',
                !on && 'text-muted-foreground',
              )}
            >
              {value ?? '…'}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

const CODE = `import { usePwa } from '@kstackz/pwa-toolkit/react';
import { useStoragePersistence } from '@kstackz/pwa-toolkit/extras';

const pwa = usePwa();
pwa.version; // { buildId, builtAt, commit }
pwa.status;  // { _tag: 'Ready' | 'UpdateReady' | … }

const storage = useStoragePersistence();
await storage.persist();   // ask the browser not to evict
await storage.estimate();  // { usage, quota }`;

function Status() {
  const pwa = usePwa();
  const online = useOnline();
  const displayMode = useDisplayMode();
  const storage = useStoragePersistence();
  const [buildId, setBuildId] = useState<string | null>(null);
  const [workers, setWorkers] = useState<WorkerSnapshot | null>(null);
  const [cacheList, setCacheList] = useState<ReadonlyArray<CacheSummary>>([]);
  const [estimate, setEstimate] = useState<string>('unknown');

  const refresh = useCallback(async () => {
    setBuildId(pageBuildId());
    setWorkers(await readWorkers());
    setCacheList(await readCaches());
    const usage = await storage.estimate();
    setEstimate(
      usage === null
        ? 'unsupported'
        : `${formatBytes(usage.usage)} of ${formatBytes(usage.quota)}`,
    );
  }, [storage]);
  usePageRefresh(refresh);

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    navigator.serviceWorker?.addEventListener('controllerchange', refresh);
    return () => {
      clearInterval(timer);
      navigator.serviceWorker?.removeEventListener('controllerchange', refresh);
    };
  }, [refresh]);

  return (
    <Page
      path="/status"
      testId="scenario-status"
      lede={
        <p>
          Everything this tab knows about its build and its worker, read again
          every two seconds. Watch a worker move from slot to slot as a new
          build arrives.
        </p>
      }
    >
      <Playground>
        <Stage className="py-8">
          <Lifecycle workers={workers} />
          <p
            data-testid="status-worker-outcome"
            className="text-sm text-muted-foreground"
          >
            {workers === null
              ? 'Reading the worker…'
              : !workers.supported
                ? 'This browser has no service workers.'
                : workers.controller === 'none'
                  ? 'No worker controls this tab yet.'
                  : 'A worker controls this tab.'}
          </p>
        </Stage>
        <Controls>
          <Actions>
            <Button data-testid="status-refresh" onClick={() => void refresh()}>
              Refresh now
            </Button>
            <Button
              variant="outline"
              data-testid="status-persist"
              onClick={() => void storage.persist()}
            >
              Request persistent storage
            </Button>
          </Actions>
        </Controls>
        <Values>
          <Value label="Label" testId="status-build-label">
            {buildLabel}
          </Value>
          <Value label="Build ID" testId="status-build-id">
            {buildId ?? 'none'}
          </Value>
          <Value label="Built" testId="status-built-at">
            <BuiltAt iso={pwa.version.builtAt} />
          </Value>
          <Value label="Commit" testId="status-commit">
            {pwa.version.commit?.slice(0, 7) ?? 'unknown'}
          </Value>
          <Value label="Status" testId="status-update-state">
            {pwa.status._tag}
          </Value>
        </Values>
      </Playground>

      <div className="grid gap-8 md:grid-cols-2">
        <Section title="This device">
          <dl className="flex flex-col gap-1.5 rounded-xl p-4 ring-1 ring-edge">
            <Value label="Service workers" testId="status-sw-supported">
              {workers === null ? '…' : workers.supported ? 'yes' : 'no'}
            </Value>
            <Value label="Display mode" testId="status-display-mode">
              {displayMode}
            </Value>
            <Value label="Online" testId="status-online">
              {String(online)}
            </Value>
            <Value label="Persisted" testId="status-persisted">
              {storage.persisted === null
                ? 'unknown'
                : String(storage.persisted)}
            </Value>
            <Value label="Storage" testId="status-estimate">
              {estimate}
            </Value>
          </dl>
        </Section>
        <Section title="Cache storage">
          <ul
            data-testid="status-caches"
            className="flex flex-col divide-y divide-border rounded-xl px-4 py-1.5 font-mono text-[13px] ring-1 ring-edge"
          >
            {cacheList.length === 0 ? (
              <li className="py-2 text-muted-foreground">no caches</li>
            ) : null}
            {cacheList.map((cache) => (
              <li
                key={cache.name}
                data-testid="status-cache"
                data-cache-name={cache.name}
                className="flex justify-between gap-3 py-2"
              >
                <span className="min-w-0 [overflow-wrap:anywhere]">
                  {cache.name}
                </span>
                <span className="shrink-0 text-muted-foreground tabular-nums">
                  {cache.entries}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
      <Code title="Reading it yourself" code={CODE} />
      <Checklist
        steps={[
          'In a fresh profile, open this page: Controls this tab fills in without the page reloading.',
          'The precache is named after the Build ID. Match the two in Cache storage.',
          'Deploy a new build and focus this tab: Waiting fills in and Status turns UpdateReady.',
        ]}
      />
    </Page>
  );
}
