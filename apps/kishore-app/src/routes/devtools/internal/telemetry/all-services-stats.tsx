import { AlertTriangleIcon } from '@monorepo/frontend/lucide';
import { cn } from '@monorepo/frontend/lib/utils';
import {
  formatRelativeTime,
  formatServiceName,
  NO_ROOT_SERVICE,
  type ServiceInsight,
} from './filters';

interface AllServicesStatsProps {
  insights: ServiceInsight[];
  onSelectService: (name: string) => void;
}

/**
 * The right-pane overview shown when no service is selected: headline totals
 * plus a short "needs attention" list pointing at the services worth opening.
 */
export function AllServicesStats({
  insights,
  onSelectService,
}: AllServicesStatsProps) {
  if (insights.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-10 text-sm text-muted-foreground">
        No data yet — waiting for telemetry.
      </div>
    );
  }

  const totalTraces = insights.reduce((s, i) => s + i.traceCount, 0);
  const totalErrors = insights.reduce((s, i) => s + i.errorCount, 0);
  const errorRate =
    totalTraces > 0 ? Math.round((totalErrors / totalTraces) * 100) : 0;

  const hasErrors = totalErrors > 0;
  const attention = insights
    .slice()
    .sort((a, b) => {
      if (b.errorCount !== a.errorCount) return b.errorCount - a.errorCount;
      return b.traceCount - a.traceCount;
    })
    .slice(0, 5);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-8 p-8">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatTile label="Services" value={insights.length} />
        <StatTile label="Traces" value={totalTraces} />
        <StatTile
          label="Errors"
          value={totalErrors}
          emphasis={totalErrors > 0}
        />
        <StatTile
          label="Error rate"
          value={`${errorRate}%`}
          emphasis={errorRate > 0}
        />
      </div>

      <div className="flex flex-col gap-2">
        <h2 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">
          {hasErrors ? 'Needs attention' : 'Busiest services'}
        </h2>
        <div className="flex flex-col overflow-hidden rounded-lg border border-border">
          {attention.map((s, i) => (
            <button
              key={s.name}
              type="button"
              onClick={() => onSelectService(s.name)}
              className={cn(
                'flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50',
                i > 0 && 'border-t border-border/40',
              )}
            >
              <span
                className={cn(
                  'min-w-0 truncate font-mono text-sm',
                  s.name === NO_ROOT_SERVICE && 'italic text-muted-foreground',
                )}
              >
                {formatServiceName(s.name)}
              </span>
              <div className="flex shrink-0 items-center gap-4 text-xs tabular-nums text-muted-foreground">
                {s.errorCount > 0 && (
                  <span className="inline-flex items-center gap-1 font-medium text-destructive">
                    <AlertTriangleIcon className="size-3" />
                    {s.errorCount}
                  </span>
                )}
                <span>
                  {s.traceCount} trace{s.traceCount !== 1 ? 's' : ''}
                </span>
                <span className="text-muted-foreground/60">
                  {formatRelativeTime(s.lastSeen)}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  emphasis = false,
}: {
  label: string;
  value: number | string;
  emphasis?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-card p-4">
      <span
        className={cn(
          'font-mono text-2xl font-medium leading-none tabular-nums',
          emphasis ? 'text-destructive' : 'text-foreground',
        )}
      >
        {value}
      </span>
      <span className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
        {label}
      </span>
    </div>
  );
}
