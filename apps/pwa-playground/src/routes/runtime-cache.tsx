import { createFileRoute } from '@tanstack/react-router';
import { Badge } from 'kui-toolkit/components/ui/badge';
import { Button } from 'kui-toolkit/components/ui/button';
import { clearRuntimeCache } from 'pwa-toolkit/react';
import { useState } from 'react';
import {
  Actions,
  Panel,
  Readout,
  Readouts,
  ScenarioPage,
} from '../components/index.ts';
import {
  TIME_STRATEGIES,
  type TimeStrategy,
  timeUrl,
} from '../lib/runtime-cache-rules.ts';
import { type Served, servedFetch } from '../lib/served.ts';

export const Route = createFileRoute('/runtime-cache')({
  component: RuntimeCache,
});

const EXPECTED: Record<TimeStrategy, string> = {
  'network-first':
    'Fresh while online. Offline (or slower than 2 s): the last cached answer.',
  'cache-first': 'The first answer, forever, until the cache is cleared.',
  'stale-while-revalidate':
    'The previous answer at once, while the network refreshes it for next time.',
  'network-only': 'Always fresh. Offline: an error.',
};

function StrategyPanel(props: { readonly strategy: TimeStrategy }) {
  const { strategy } = props;
  const [served, setServed] = useState<Served | null>(null);
  const [calls, setCalls] = useState(0);
  const source =
    served === null
      ? 'not fetched'
      : served.error !== null
        ? 'error'
        : served.fromCache
          ? 'cache'
          : 'network';
  return (
    <Panel title={strategy} description={EXPECTED[strategy]}>
      <Readouts>
        <Readout
          label="URL"
          testId={`rc-${strategy}-url`}
          value={timeUrl(strategy)}
        />
        <Readout label="Calls" testId={`rc-${strategy}-calls`} value={calls} />
        <Readout
          label="Came from"
          testId={`rc-${strategy}-source`}
          value={
            <Badge variant={source === 'cache' ? 'default' : 'outline'}>
              {source}
            </Badge>
          }
        />
        <Readout
          label="x-served-at"
          testId={`rc-${strategy}-served-at`}
          value={served?.servedAt || '—'}
        />
        <Readout
          label="Status / error"
          testId={`rc-${strategy}-status`}
          value={served === null ? '—' : (served.error ?? served.status)}
        />
      </Readouts>
      <Actions>
        <Button
          data-testid={`rc-${strategy}-fetch`}
          onClick={async () => {
            setServed(await servedFetch(timeUrl(strategy)));
            setCalls((n) => n + 1);
          }}
        >
          Fetch
        </Button>
      </Actions>
    </Panel>
  );
}

function RuntimeCache() {
  const [cleared, setCleared] = useState<string>('never');
  return (
    <ScenarioPage
      id="runtime-cache"
      title="Runtime Cache"
      explanation={
        <>
          <p>
            Each endpoint returns a unique x-served-at stamp and no-store, so
            the browser&apos;s HTTP cache stays out of it. The worker adds
            x-pwa-toolkit-cached-at to every copy it saves, so an answer with
            that header came from its Runtime Cache. An old x-served-at shows
            which copy it was.
          </p>
          <p>
            Fetch each one twice, then go offline in DevTools and fetch again.
            The rules live in src/lib/runtime-cache-rules.ts.
          </p>
        </>
      }
    >
      <Panel title="Runtime Caches">
        <Readouts>
          <Readout label="Last cleared" testId="rc-cleared" value={cleared} />
        </Readouts>
        <Actions>
          <Button
            variant="destructive"
            data-testid="rc-clear"
            onClick={() =>
              void clearRuntimeCache().then(() =>
                setCleared(new Date().toISOString()),
              )
            }
          >
            Clear every Runtime Cache
          </Button>
        </Actions>
      </Panel>
      {TIME_STRATEGIES.map((strategy) => (
        <StrategyPanel key={strategy} strategy={strategy} />
      ))}
    </ScenarioPage>
  );
}
