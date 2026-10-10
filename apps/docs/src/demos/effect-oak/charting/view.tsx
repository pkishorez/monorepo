import { View } from 'effect-oak/react';
import {
  Alert,
  AlertDescription,
} from '@kstackz/web-platform/components/alert';
import { Button } from '@kstackz/web-platform/components/button';
import { AsyncData, ErrorPanel, LoadingPanel } from '../async-data/index.js';
import { Chart, describeDatum } from './chart/index.js';
import { Charting } from './charting.js';
import { ControlsView } from './controls/index.js';

const Figure = ({
  label,
  value,
}: {
  readonly label: string;
  readonly value: number;
}) => (
  <div className="flex flex-col rounded-lg border p-3">
    <span className="text-xs text-muted-foreground">{label}</span>
    <span className="text-lg font-semibold tabular-nums">
      {value.toLocaleString()}
    </span>
  </div>
);

export const ChartingView = View.make(
  Charting,
  ({ model, children, frame, send }) => {
    const telemetry = AsyncData.dataOf(model.telemetry);
    const error = AsyncData.errorOf(model.telemetry);
    const picked =
      telemetry && model.selectedDatumId !== null
        ? describeDatum(telemetry, model.choice, model.selectedDatumId)
        : null;
    return (
      <div className="size-full overflow-y-auto p-6">
        <div className="mx-auto grid max-w-5xl gap-6 md:grid-cols-[16rem_1fr]">
          <aside className="flex flex-col gap-6">
            <header className="flex flex-col gap-1">
              <h1 className="text-xl font-semibold">Foldkit telemetry</h1>
              <p className="text-sm text-muted-foreground">
                Live from npm and GitHub, drawn as SVG.
              </p>
            </header>
            <ControlsView node={children.controls} frame={frame} />
            {telemetry && (
              <div className="grid grid-cols-2 gap-2">
                <Figure label="Stars" value={telemetry.repository.stars} />
                <Figure label="Forks" value={telemetry.repository.forks} />
                <Figure
                  label="Open issues"
                  value={telemetry.repository.openIssues}
                />
                <Figure
                  label="Downloads, 1 year"
                  value={telemetry.packages.reduce(
                    (sum, p) => sum + p.totalDownloads,
                    0,
                  )}
                />
              </div>
            )}
          </aside>
          <main className="flex min-w-0 flex-col gap-4">
            <div className="flex items-center justify-between gap-4">
              <span className="text-sm text-muted-foreground">
                {telemetry
                  ? `Fetched at ${new Date(telemetry.fetchedAt).toLocaleTimeString()}`
                  : ''}
              </span>
              <Button
                size="sm"
                variant="outline"
                disabled={AsyncData.isPending(model.telemetry)}
                onClick={() => send({ _tag: 'ClickedRefresh' })}
              >
                {model.telemetry._tag === 'Refreshing'
                  ? 'Refreshing…'
                  : 'Refresh'}
              </Button>
            </div>
            {error !== undefined && (
              <ErrorPanel
                error={error}
                onRetry={() => send({ _tag: 'ClickedRetry' })}
              />
            )}
            {telemetry?.warnings.map((warning) => (
              <Alert key={warning}>
                <AlertDescription>{warning}</AlertDescription>
              </Alert>
            ))}
            {telemetry === undefined ? (
              error === undefined && <LoadingPanel text="Fetching telemetry…" />
            ) : (
              <>
                <Chart
                  telemetry={telemetry}
                  choice={model.choice}
                  selectedId={model.selectedDatumId}
                  onPick={(datumId) =>
                    send({ _tag: 'ClickedChartDatum', datumId })
                  }
                />
                <p className="min-h-5 text-sm" aria-live="polite">
                  {picked ?? (
                    <span className="text-muted-foreground">
                      Click a point, bar or package to read it.
                    </span>
                  )}
                </p>
              </>
            )}
          </main>
        </div>
      </div>
    );
  },
);
