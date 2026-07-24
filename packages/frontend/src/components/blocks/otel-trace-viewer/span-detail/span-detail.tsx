import { useMemo } from 'react';

import { XIcon } from 'lucide-react';

import { Button } from '#components/ui/button';

import { StatusDot } from '../status';
import type { OtelSpan } from '../trace-model';
import { formatDuration, isLog, spanDuration } from '../trace-model';
import { AttributeSection } from './attribute-section';
import { LogSection } from './log-section';

interface SpanDetailProps {
  span: OtelSpan;
  traceStart?: number;
  showLogs?: boolean;
  onClose?: () => void;
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
      {children}
    </p>
  );
}

export function SpanDetail({
  span,
  traceStart = span.startTime,
  showLogs = true,
  onClose,
}: SpanDetailProps) {
  const logs = useMemo(() => span.events.filter(isLog), [span.events]);
  const hasAttributes = Object.keys(span.attributes).length > 0;
  const hasLogs = logs.length > 0;

  return (
    <div className="flex flex-col">
      <div className="flex items-center gap-3 border-b border-border px-6 py-4">
        <StatusDot status={span.status} />
        <span className="min-w-0 flex-1 truncate font-mono text-sm font-medium">
          {span.name}
        </span>
        <span className="shrink-0 tabular-nums text-xs text-muted-foreground">
          {formatDuration(spanDuration(span))}
        </span>
        {onClose && (
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={onClose}
            className="shrink-0"
          >
            <XIcon />
            <span className="sr-only">Close</span>
          </Button>
        )}
      </div>

      <div className="flex flex-col gap-8 px-6 py-6">
        <div>
          <SectionLabel>Overview</SectionLabel>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
            <dt className="text-muted-foreground">Status</dt>
            <dd className="font-mono capitalize">{span.status}</dd>
            <dt className="text-muted-foreground">Start</dt>
            <dd className="font-mono tabular-nums">
              +{formatDuration(span.startTime - traceStart)}
            </dd>
            <dt className="text-muted-foreground">Span ID</dt>
            <dd className="truncate font-mono" title={span.spanId}>
              {span.spanId}
            </dd>
            <dt className="text-muted-foreground">Parent</dt>
            <dd
              className="truncate font-mono"
              title={span.parentSpanId ?? 'Root span'}
            >
              {span.parentSpanId ?? 'Root span'}
            </dd>
          </dl>
        </div>

        {showLogs && hasLogs && (
          <div>
            <SectionLabel>Logs</SectionLabel>
            <LogSection
              logs={logs}
              spanStart={span.startTime}
              spanName={span.name}
            />
          </div>
        )}

        {hasAttributes && (
          <div>
            <SectionLabel>Attributes</SectionLabel>
            <AttributeSection attributes={span.attributes} />
          </div>
        )}

        {!hasAttributes && (!showLogs || !hasLogs) && (
          <p className="text-sm text-muted-foreground">
            {showLogs ? 'No attributes or logs.' : 'No attributes.'}
          </p>
        )}
      </div>
    </div>
  );
}
