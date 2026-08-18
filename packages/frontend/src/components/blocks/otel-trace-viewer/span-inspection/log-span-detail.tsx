import { cn } from '#lib/utils';

import { detectLogSeverity } from '../trace-presentation';
import type { OtelEvent, OtelSpan } from '../trace-model';
import { formatDuration } from '../trace-model';
import { JsonTree } from '../../json';

const BODY_KEYS = ['body', 'message', 'log.message'] as const;
const META_KEYS = new Set([
  ...BODY_KEYS,
  'severity',
  'level',
  'log.severity',
  'log.level',
  'severityText',
  'severityNumber',
  'log.severityText',
  'log.severityNumber',
]);

const SEVERITY_CLASS = {
  trace: 'bg-muted text-muted-foreground',
  debug: 'bg-muted text-muted-foreground',
  info: 'bg-sky-500/10 text-sky-700 dark:text-sky-400',
  warn: 'bg-amber-500/10 text-amber-700 dark:text-amber-400',
  error: 'bg-destructive/10 text-destructive',
} as const;

function bodyFor(event: OtelEvent): unknown {
  for (const key of BODY_KEYS) {
    if (event.attributes[key] !== undefined) return event.attributes[key];
  }
  return null;
}

function severityLabel(event: OtelEvent): string | null {
  const raw =
    event.attributes['severityText'] ??
    event.attributes['log.severityText'] ??
    event.attributes['severity'] ??
    event.attributes['level'];
  if (raw !== undefined) return String(raw).toUpperCase();
  return detectLogSeverity(event)?.toUpperCase() ?? null;
}

function LogValue({ value }: { readonly value: unknown }) {
  if (value !== null && typeof value === 'object') {
    return <JsonTree value={value as object} collapsed={false} />;
  }

  const text = value === null ? 'null' : String(value);
  const multiline = text.includes('\n') || text.length > 100;
  return multiline ? (
    <pre className="whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed text-foreground/85">
      {text}
    </pre>
  ) : (
    <span className="break-all font-mono text-[11px] text-foreground/85">
      {text}
    </span>
  );
}

function SectionLabel({ children }: { readonly children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold uppercase tracking-widest text-muted-foreground/70">
      {children}
    </p>
  );
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
  const body = bodyFor(event);
  const severity = detectLogSeverity(event);
  const label = severityLabel(event);
  const fields = Object.entries(event.attributes).filter(
    ([key]) => !META_KEYS.has(key),
  );
  const serviceName =
    span.attributes['resource.service.name'] ?? span.attributes['service.name'];

  return (
    <div className="flex flex-col">
      <div className="border-b border-border px-6 py-4">
        <div className="flex min-w-0 items-center gap-2">
          {severity && label && (
            <span
              className={cn(
                'shrink-0 rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold tracking-wide',
                SEVERITY_CLASS[severity],
              )}
            >
              {label}
            </span>
          )}
          <p
            className="min-w-0 flex-1 truncate font-mono text-sm font-medium"
            title={event.name}
          >
            {event.name}
          </p>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 font-mono text-[10px] tabular-nums text-muted-foreground">
          <span>trace +{formatDuration(event.timestamp - traceStart)}</span>
          <span>span +{formatDuration(event.timestamp - span.startTime)}</span>
        </div>
      </div>

      <div className="flex flex-col gap-7 px-6 py-6">
        <section className="flex flex-col gap-2.5">
          <SectionLabel>Message</SectionLabel>
          <div className="rounded-md bg-muted/35 px-3 py-3">
            {body !== null ? (
              <LogValue value={body} />
            ) : (
              <p className="font-mono text-xs text-foreground/85">
                {event.name}
              </p>
            )}
          </div>
        </section>

        {fields.length > 0 && (
          <section className="flex flex-col gap-2.5">
            <div className="flex items-center justify-between gap-3">
              <SectionLabel>Fields</SectionLabel>
              <span className="text-[10px] tabular-nums text-muted-foreground/60">
                {fields.length}
              </span>
            </div>
            <dl className="divide-y divide-border/40 overflow-hidden rounded-md border border-border/50">
              {fields.map(([key, value]) => (
                <div className="px-3 py-2.5" key={key}>
                  <dt className="mb-1 break-all font-mono text-[10px] text-muted-foreground">
                    {key}
                  </dt>
                  <dd>
                    <LogValue value={value} />
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}

        <section className="flex flex-col gap-2.5">
          <SectionLabel>Context</SectionLabel>
          <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[11px]">
            <dt className="text-muted-foreground">Span</dt>
            <dd className="truncate font-mono" title={span.name}>
              {span.name}
            </dd>
            {serviceName !== undefined && (
              <>
                <dt className="text-muted-foreground">Service</dt>
                <dd className="truncate font-mono" title={String(serviceName)}>
                  {String(serviceName)}
                </dd>
              </>
            )}
            <dt className="text-muted-foreground">Trace ID</dt>
            <dd className="truncate font-mono" title={span.traceId}>
              {span.traceId}
            </dd>
            <dt className="text-muted-foreground">Span ID</dt>
            <dd className="truncate font-mono" title={span.spanId}>
              {span.spanId}
            </dd>
          </dl>
        </section>
      </div>
    </div>
  );
}
