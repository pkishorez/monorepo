import { View } from 'effect-oak/react';
import { Button } from '@kstackz/web-platform/components/button';
import { AsyncData, ErrorPanel, LoadingPanel } from '../async-data/index.js';
import { StatsQuery } from './queries.js';

const Figure = ({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) => (
  <div className="flex flex-col gap-1 rounded-xl border p-4">
    <div className="text-sm text-muted-foreground">{label}</div>
    <div className="text-2xl font-semibold tabular-nums">{value}</div>
  </div>
);

export const StatsView = View.make(StatsQuery, ({ model, send }) => {
  const entry = model.entries[''] ?? AsyncData.idle;
  const served = AsyncData.dataOf(entry);
  const error = AsyncData.errorOf(entry);
  const pending = AsyncData.isPending(entry);
  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Stats</h2>
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() => send({ _tag: 'ClickedRefresh', key: '' })}
        >
          {pending ? 'Refreshing…' : 'Refresh'}
        </Button>
      </div>
      <p className="text-sm text-muted-foreground">
        The app orders a revalidate every 5 seconds while this tab is open.
      </p>
      {error !== undefined && (
        <ErrorPanel
          error={error}
          onRetry={() => send({ _tag: 'ClickedRetry', key: '' })}
        />
      )}
      {served === undefined ? (
        error === undefined && <LoadingPanel text="Loading stats…" />
      ) : (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Figure label="Active users" value={`${served.data.activeUsers}`} />
            <Figure
              label="Requests per second"
              value={`${served.data.requestsPerSecond}`}
            />
            <Figure
              label="Cache hit rate"
              value={`${served.data.cacheHitRatePercent}%`}
            />
          </div>
          <p className="flex gap-3 text-sm text-muted-foreground">
            Updated at {new Date(served.servedAt).toLocaleTimeString()}
            {entry._tag === 'Refreshing' && (
              <span className="font-medium text-primary">Refreshing</span>
            )}
          </p>
        </>
      )}
    </section>
  );
});
