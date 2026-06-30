import {
  ActivityIcon,
  AlertTriangleIcon,
  HelpCircleIcon,
} from '@monorepo/frontend/lucide';
import { serviceColor } from '@monorepo/frontend/components/blocks/otel-trace-viewer';
import { cn } from '@monorepo/frontend/lib/utils';
import {
  formatServiceName,
  NO_ROOT_SERVICE,
  type ServiceInsight,
} from './filters';

interface ServiceGlossaryProps {
  insights: ServiceInsight[];
  onSelectService: (name: string) => void;
}

export function ServiceGlossary({
  insights,
  onSelectService,
}: ServiceGlossaryProps) {
  if (insights.length === 0) {
    return (
      <div className="flex items-center justify-center rounded-lg border border-border p-10 text-sm text-muted-foreground">
        No services
      </div>
    );
  }

  const maxTraces = insights.reduce((m, s) => Math.max(m, s.traceCount), 0);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-baseline justify-between">
        <h2 className="text-sm font-medium text-foreground">Services</h2>
        <span className="text-xs text-muted-foreground">
          {insights.length} service{insights.length !== 1 ? 's' : ''} ·{' '}
          {insights.reduce((s, i) => s + i.traceCount, 0)} trace
          {insights.reduce((s, i) => s + i.traceCount, 0) !== 1 ? 's' : ''}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        {insights.map((s) => (
          <ServiceCard
            key={s.name}
            insight={s}
            maxTraces={maxTraces}
            onSelect={() => onSelectService(s.name)}
          />
        ))}
      </div>
    </div>
  );
}

function ServiceCard({
  insight,
  maxTraces,
  onSelect,
}: {
  insight: ServiceInsight;
  maxTraces: number;
  onSelect: () => void;
}) {
  const isNoRoot = insight.name === NO_ROOT_SERVICE;
  const c = isNoRoot ? null : serviceColor(insight.name);
  const errorRate =
    insight.traceCount > 0
      ? Math.round((insight.errorCount / insight.traceCount) * 100)
      : 0;
  const volume = maxTraces > 0 ? insight.traceCount / maxTraces : 0;
  const hasErrors = insight.errorCount > 0;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        'group relative flex flex-col gap-4 overflow-hidden rounded-lg border border-border bg-card p-4 text-left',
        'transition-all hover:border-foreground/20 hover:shadow-sm',
      )}
    >
      <div
        aria-hidden
        className={cn(
          'absolute left-0 top-0 h-0.5',
          c ? c.dot : 'bg-muted-foreground/40',
        )}
        style={{ width: `${Math.max(8, volume * 100)}%` }}
      />

      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          {isNoRoot ? (
            <HelpCircleIcon className="size-3.5 shrink-0 text-muted-foreground" />
          ) : (
            <span className={cn('size-2.5 shrink-0 rounded-full', c!.dot)} />
          )}
          <span
            className={cn(
              'min-w-0 truncate font-mono text-sm font-medium',
              isNoRoot && 'text-muted-foreground italic',
            )}
          >
            {formatServiceName(insight.name)}
          </span>
        </div>
        {hasErrors && (
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-full px-1.5 py-0.5',
              'bg-destructive/10 text-[10px] font-medium text-destructive',
            )}
          >
            <AlertTriangleIcon className="size-2.5" />
            {errorRate}%
          </span>
        )}
      </div>

      <div className="flex items-end gap-4">
        <div className="flex flex-col">
          <span className="font-mono text-2xl font-medium leading-none tabular-nums">
            {insight.traceCount}
          </span>
          <span className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
            traces
          </span>
        </div>
        <div className="flex flex-col">
          <span
            className={cn(
              'font-mono text-2xl font-medium leading-none tabular-nums',
              hasErrors ? 'text-destructive' : 'text-muted-foreground/50',
            )}
          >
            {insight.errorCount}
          </span>
          <span className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
            errors
          </span>
        </div>
        <div className="flex flex-1 flex-col items-end">
          <span className="inline-flex items-center gap-1 font-mono text-xs tabular-nums text-muted-foreground">
            <ActivityIcon className="size-3" />
            {formatRelative(insight.lastSeen)}
          </span>
          <span className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground/70">
            last seen
          </span>
        </div>
      </div>

      {insight.topTraceNames.length > 0 && (
        <div className="flex flex-col gap-1 border-t border-border/40 pt-3">
          {insight.topTraceNames.map((t) => (
            <div key={t.name} className="flex items-baseline gap-2 text-xs">
              <span className="min-w-0 flex-1 truncate font-mono text-foreground/80">
                {t.name}
              </span>
              <span className="shrink-0 tabular-nums text-muted-foreground/60">
                {t.count}
              </span>
            </div>
          ))}
        </div>
      )}
    </button>
  );
}

function formatRelative(ts: number): string {
  if (!Number.isFinite(ts)) return '—';
  const diff = Date.now() - ts;
  if (diff < 0) return 'now';
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return `${sec}s ago`;
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  return `${day}d ago`;
}
