import type { OtelEvent, OtelSpan } from '../trace-model';
import { formatDuration } from '../trace-model';
import { LogDetail } from './log-detail';

const BODY_KEYS = ['body', 'message', 'log.message'] as const;

function titleFor(event: OtelEvent): string {
  for (const key of BODY_KEYS) {
    const value = event.attributes[key];
    if (value !== undefined) return String(value);
  }
  return event.name;
}

function severityFor(event: OtelEvent): string | null {
  const value =
    event.attributes['severityText'] ??
    event.attributes['log.severityText'] ??
    event.attributes['severity'] ??
    event.attributes['level'];
  return value === undefined ? null : String(value).toUpperCase();
}

export function LogSpanDetail({
  event,
  span,
  traceStart,
}: {
  readonly event: OtelEvent;
  readonly span: OtelSpan;
  readonly traceStart: number;
}) {
  const severity = severityFor(event);
  const severityMeta = severity
    ? severity.includes('ERROR') || severity.includes('FATAL')
      ? { dotClass: 'bg-destructive', labelClass: 'text-destructive' }
      : severity.includes('WARN')
        ? { dotClass: 'bg-amber-500', labelClass: 'text-amber-600' }
        : { dotClass: 'bg-sky-500', labelClass: 'text-muted-foreground' }
    : null;

  return (
    <div className="flex flex-col">
      <div className="border-b border-border px-6 py-4">
        <p
          className="truncate font-mono text-sm font-medium"
          title={titleFor(event)}
        >
          {titleFor(event)}
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          Log in <span className="font-mono">{span.name}</span>
        </p>
      </div>
      <div className="flex flex-col gap-6 px-6 py-6">
        <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
          <dt className="text-muted-foreground">Trace offset</dt>
          <dd className="font-mono tabular-nums">
            +{formatDuration(event.timestamp - traceStart)}
          </dd>
          <dt className="text-muted-foreground">Span ID</dt>
          <dd className="truncate font-mono" title={span.spanId}>
            {span.spanId}
          </dd>
        </dl>
        <LogDetail
          event={event}
          size="roomy"
          severityMeta={severityMeta}
          severityLabel={severity}
        />
      </div>
    </div>
  );
}
