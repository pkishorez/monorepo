import { createFileRoute } from '@tanstack/react-router';
import { Button } from '@kstackz/ui-toolkit/components/ui/button';
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
  type Outcome,
  Panel,
  Readout,
  Readouts,
  ScenarioPage,
} from '../components/index.ts';
import { buildLabel, pageBuildId } from '../lib/build.ts';
import { readWorkers, type WorkerSnapshot } from '../lib/workers.ts';

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

  useEffect(() => {
    void refresh();
    const timer = setInterval(() => void refresh(), 2000);
    navigator.serviceWorker?.addEventListener('controllerchange', refresh);
    return () => {
      clearInterval(timer);
      navigator.serviceWorker?.removeEventListener('controllerchange', refresh);
    };
  }, [refresh]);

  const workerOutcome: Outcome =
    workers === null
      ? 'running'
      : !workers.supported
        ? 'failure'
        : workers.controller === 'none'
          ? 'idle'
          : 'success';
  const workerLabel =
    workers === null
      ? 'Reading'
      : !workers.supported
        ? 'Unsupported'
        : workers.controller === 'none'
          ? 'Not in control'
          : 'In control';

  return (
    <ScenarioPage
      id="status"
      title="Status"
      proves={
        <p>
          Everything the tab knows about this build and its service worker,
          refreshed every two seconds. The first visit installs the worker and
          it takes control at once, with no reload; later builds wait for the
          Update Prompt.
        </p>
      }
      steps={[
        'In a fresh profile, open this page: Controller reads “activated /sw.js” without the page reloading.',
        'The Precache is named after the Build ID. Match the two in Cache Storage below.',
        'Deploy a new build and focus this tab: Waiting fills in and Status turns UpdateReady.',
      ]}
    >
      <Panel
        title="Build"
        outcome={buildId === null ? 'idle' : 'success'}
        outcomeLabel={buildId === null ? 'No Build ID' : 'Build ID present'}
      >
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
            label="Built"
            testId="status-built-at"
            value={<BuiltAt iso={pwa.version.builtAt} />}
          />
          <Readout
            label="Commit"
            testId="status-commit"
            value={pwa.version.commit ?? 'unknown'}
          />
          <Readout
            label="Status"
            testId="status-update-state"
            value={pwa.status._tag}
          />
        </Readouts>
      </Panel>

      <Panel
        title="Service worker"
        outcome={workerOutcome}
        outcomeLabel={workerLabel}
        outcomeTestId="status-worker-outcome"
      >
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

      <Panel
        title="Cache Storage"
        description="Every cache this origin holds."
        outcome={cacheList.length === 0 ? 'idle' : 'success'}
        outcomeLabel={
          cacheList.length === 0
            ? 'Empty'
            : `${cacheList.length} ${cacheList.length === 1 ? 'cache' : 'caches'}`
        }
      >
        <ul
          data-testid="status-caches"
          className="flex flex-col divide-y divide-border rounded-lg bg-muted/40 px-3.5 py-1 font-mono text-[13px] ring-1 ring-foreground/5"
        >
          {cacheList.length === 0 ? (
            <li className="py-2 text-muted-foreground">no caches</li>
          ) : null}
          {cacheList.map((cache) => (
            <li
              key={cache.name}
              data-testid="status-cache"
              data-cache-name={cache.name}
              className="py-2 [overflow-wrap:anywhere]"
            >
              {cache.name}: {cache.entries}{' '}
              {cache.entries === 1 ? 'entry' : 'entries'}
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
