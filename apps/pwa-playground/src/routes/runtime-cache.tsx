import { createFileRoute } from '@tanstack/react-router';
import { Badge } from 'kui-toolkit/components/ui/badge';
import { Button } from 'kui-toolkit/components/ui/button';
import { clearRuntimeCache } from 'pwa-toolkit/react';
import { useState } from 'react';
import {
  Actions,
  type Outcome,
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
  const [pending, setPending] = useState(0);
  const source =
    served === null
      ? 'not fetched'
      : served.error !== null
        ? 'error'
        : served.fromCache
          ? 'cache'
          : 'network';
  const outcome: Outcome =
    pending > 0
      ? 'running'
      : source === 'not fetched'
        ? 'idle'
        : source === 'error'
          ? 'failure'
          : 'success';
  return (
    <Panel
      title={strategy}
      description={EXPECTED[strategy]}
      outcome={outcome}
      outcomeLabel={
        outcome === 'running'
          ? 'Fetching'
          : outcome === 'success'
            ? `From ${source}`
            : undefined
      }
      outcomeTestId={`rc-${strategy}-outcome`}
    >
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
            <Badge
              variant={source === 'cache' ? 'default' : 'outline'}
              className="font-mono font-normal"
            >
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
          variant="outline"
          data-testid={`rc-${strategy}-fetch`}
          onClick={async () => {
            setPending((n) => n + 1);
            const answer = await servedFetch(timeUrl(strategy));
            setServed(answer);
            setCalls((n) => n + 1);
            setPending((n) => n - 1);
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
      proves={
        <p>
          Each endpoint returns a unique x-served-at stamp and no-store, so the
          browser&apos;s HTTP cache stays out of it. The worker adds
          x-pwa-toolkit-cached-at to every copy it saves, so an answer with that
          header came from its Runtime Cache, and an old x-served-at shows which
          copy it was. The rules live in src/lib/runtime-cache-rules.ts.
        </p>
      }
      steps={[
        'Fetch each strategy twice while online and compare the stamps.',
        'Go offline in DevTools (Network → Offline) and fetch again.',
        'network-only fails offline; the other three answer from cache. Clear every Runtime Cache to start over.',
      ]}
    >
      <Panel
        title="Runtime Caches"
        description="Deletes every pwa-toolkit:runtime:* cache; the Precache stays."
      >
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
