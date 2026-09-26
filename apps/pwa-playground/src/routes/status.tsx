import { createFileRoute } from '@tanstack/react-router';
import { Button } from 'kui-toolkit/components/ui/button';
import {
  useDisplayMode,
  useOnline,
  usePwaUpdate,
  useStoragePersistence,
} from 'pwa-toolkit/react';
import { useCallback, useEffect, useState } from 'react';
import {
  Actions,
  Panel,
  Readout,
  Readouts,
  ScenarioPage,
} from '../components/index.ts';
import { buildLabel, pageBuildId } from '../lib/build.ts';

export const Route = createFileRoute('/status')({ component: Status });

interface WorkerSnapshot {
  readonly supported: boolean;
  readonly controller: string;
  readonly active: string;
  readonly waiting: string;
  readonly installing: string;
}

const describeWorker = (worker: ServiceWorker | null | undefined) =>
  worker ? `${worker.state} ${new URL(worker.scriptURL).pathname}` : 'none';

const readWorkers = async (): Promise<WorkerSnapshot> => {
  const container = navigator.serviceWorker;
  if (container === undefined) {
    return {
      supported: false,
      controller: 'none',
      active: 'none',
      waiting: 'none',
      installing: 'none',
    };
  }
  const registration = await container.getRegistration();
  return {
    supported: true,
    controller: describeWorker(container.controller),
    active: describeWorker(registration?.active),
    waiting: describeWorker(registration?.waiting),
    installing: describeWorker(registration?.installing),
  };
};

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

function Status() {
  const update = usePwaUpdate();
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
    <ScenarioPage
      id="status"
      title="Status"
      explanation={
        <p>
          Everything the tab knows about this build and its service worker.
          Refreshes every two seconds. The first visit installs the worker and
          it takes control at once; later builds wait for the Update Prompt.
        </p>
      }
    >
      <Panel title="Build">
        <Readouts>
          <Readout
            label="Build Label"
            testId="status-build-label"
            value={buildLabel}
          />
          <Readout
            label="Build ID (meta)"
            testId="status-build-id"
            value={buildId ?? 'none'}
          />
          <Readout
            label="Update state"
            testId="status-update-state"
            value={update.state._tag}
          />
        </Readouts>
      </Panel>

      <Panel title="Service worker">
        <Readouts>
          <Readout
            label="Supported"
            testId="status-sw-supported"
            value={workers === null ? '…' : String(workers.supported)}
          />
          <Readout
            label="Controller"
            testId="status-controller"
            value={workers?.controller ?? '…'}
          />
          <Readout
            label="Active"
            testId="status-active"
            value={workers?.active ?? '…'}
          />
          <Readout
            label="Waiting"
            testId="status-waiting"
            value={workers?.waiting ?? '…'}
          />
          <Readout
            label="Installing"
            testId="status-installing"
            value={workers?.installing ?? '…'}
          />
        </Readouts>
      </Panel>

      <Panel title="Device">
        <Readouts>
          <Readout
            label="Display mode"
            testId="status-display-mode"
            value={displayMode}
          />
          <Readout
            label="Online"
            testId="status-online"
            value={String(online)}
          />
          <Readout
            label="Storage persisted"
            testId="status-persisted"
            value={
              storage.persisted === null ? 'unknown' : String(storage.persisted)
            }
          />
          <Readout
            label="Storage estimate"
            testId="status-estimate"
            value={estimate}
          />
        </Readouts>
        <Actions>
          <Button
            variant="outline"
            data-testid="status-persist"
            onClick={() => void storage.persist()}
          >
            Request persistent storage
          </Button>
        </Actions>
      </Panel>

      <Panel title="Cache Storage" description="Every cache this origin holds.">
        <ul
          data-testid="status-caches"
          className="flex flex-col gap-1 font-mono text-sm"
        >
          {cacheList.length === 0 ? <li>no caches</li> : null}
          {cacheList.map((cache) => (
            <li
              key={cache.name}
              data-testid="status-cache"
              data-cache-name={cache.name}
            >
              {cache.name}: {cache.entries} entries
            </li>
          ))}
        </ul>
        <Actions>
          <Button
            variant="outline"
            data-testid="status-refresh"
            onClick={() => void refresh()}
          >
            Refresh now
          </Button>
        </Actions>
      </Panel>
    </ScenarioPage>
  );
}
