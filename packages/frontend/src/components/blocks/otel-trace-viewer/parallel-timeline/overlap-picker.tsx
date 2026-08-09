import { StatusDot } from '../status';
import type { OtelSpan } from '../trace-model';
import {
  formatDuration,
  formatSpanName,
  isLog,
  spanDuration,
} from '../trace-model';

interface OverlapPickerProps {
  readonly spans: readonly OtelSpan[];
  readonly onSelect: (span: OtelSpan) => void;
  readonly onHover: (span: OtelSpan | null) => void;
}

export function OverlapPicker({
  spans,
  onSelect,
  onHover,
}: OverlapPickerProps) {
  return (
    <div className="flex flex-col">
      <p className="border-b border-border px-2.5 py-2 text-[11px] font-medium text-muted-foreground">
        {spans.length} overlapping spans
      </p>
      <div className="p-1">
        {spans.map((span) => {
          const logCount = span.events.filter(isLog).length;

          return (
            <button
              className="flex w-full items-center gap-2 rounded-sm px-2 py-2 text-left transition-colors hover:bg-muted focus-visible:bg-muted focus-visible:outline-none"
              key={span.spanId}
              onBlur={() => onHover(null)}
              onClick={() => onSelect(span)}
              onFocus={() => onHover(span)}
              onMouseEnter={() => onHover(span)}
              onMouseLeave={() => onHover(null)}
              type="button"
            >
              <StatusDot status={span.status} />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-[11px] font-medium">
                  {formatSpanName(span.name, span.attributes)}
                </span>
                <span className="mt-0.5 block text-[9px] text-muted-foreground">
                  {formatDuration(spanDuration(span))}
                  {logCount > 0 &&
                    ` · ${logCount} ${logCount === 1 ? 'log' : 'logs'}`}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
