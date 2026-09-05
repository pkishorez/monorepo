import { StatusDot } from '../trace-presentation';
import type { OtelSpan } from '../trace-model';
import {
  formatDuration,
  formatSpanName,
  isLog,
  spanDuration,
} from '../trace-model';

interface OverlapSpanSummaryProps {
  readonly spans: readonly OtelSpan[];
}

export function OverlapSpanSummary({ spans }: OverlapSpanSummaryProps) {
  const totalLogs = spans.reduce(
    (count, span) => count + span.events.filter(isLog).length,
    0,
  );

  return (
    <div className="flex flex-col">
      <div className="border-b border-border px-6 py-5">
        <p className="text-sm font-medium">{spans.length} overlapping spans</p>
        <p className="mt-1 text-xs text-muted-foreground">
          {totalLogs} {totalLogs === 1 ? 'log' : 'logs'} across this overlap
        </p>
      </div>
      <div className="space-y-1 p-3">
        {spans.map((span) => {
          const logCount = span.events.filter(isLog).length;

          return (
            <div
              className="flex items-center gap-2.5 rounded-md px-3 py-2.5"
              key={span.spanId}
            >
              <StatusDot status={span.status} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-xs font-medium">
                  {formatSpanName(span.name, span.attributes)}
                </span>
                <span className="mt-0.5 block text-[10px] text-muted-foreground">
                  {formatDuration(spanDuration(span))}
                  {logCount > 0 &&
                    ` · ${logCount} ${logCount === 1 ? 'log' : 'logs'}`}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
