import {
  byTime,
  formatAttributes,
  formatMillis,
  offsetColumn,
} from '../text-format.js';
import type {
  SimpleLog,
  SimpleSpan,
  SimpleTrace,
  SimpleTraceSummary,
} from './simplify.js';

const summaryLine = (trace: SimpleTraceSummary) =>
  [
    `service ${trace.serviceName ?? '(unknown)'}`,
    `start ${trace.startTime ?? '?'}`,
    trace.running ? 'running' : `duration ${formatMillis(trace.durationMs)}`,
    `${trace.spanCount} spans`,
    `${trace.errorCount} errors`,
  ].join(' · ');

const statusTag = (span: SimpleSpan) =>
  span.status === 'running'
    ? '[running]'
    : `[${span.status} ${formatMillis(span.durationMs)}]`;

const logLine = (log: SimpleLog, start: number | null, indent: string) => {
  const attributes = formatAttributes(log.attributes);
  const head = log.eventName ? `${log.eventName}: ${log.body}` : log.body;
  return `${offsetColumn(log.timeMs, start)}${indent}  · ${log.severity} ${head}${attributes ? `  ${attributes}` : ''}`;
};

/** Renders a Trace as the Narrative view in plain text. */
export const renderTraceText = (trace: SimpleTrace) => {
  const start = trace.startMs;
  const children = new Map<string | null, SimpleSpan[]>();
  for (const span of trace.spans) {
    const bucket = children.get(span.parentSpanId) ?? [];
    bucket.push(span);
    children.set(span.parentSpanId, bucket);
  }
  const lines: string[] = [`Trace ${trace.traceId}`, summaryLine(trace), ''];
  const renderSpan = (span: SimpleSpan, depth: number) => {
    const indent = '  '.repeat(depth);
    const narrative = span.narrative ? `  — ${span.narrative}` : '';
    const statusMessage = span.statusMessage
      ? `  status: ${span.statusMessage}`
      : '';
    lines.push(
      `${offsetColumn(span.startMs, start)}${indent}▸ ${span.name} ${statusTag(span)}${narrative}${statusMessage}`,
    );
    const items: Array<{ time: number | null; render: () => void }> = [
      ...span.logs.map((log) => ({
        time: log.timeMs,
        render: () => lines.push(logLine(log, start, indent)),
      })),
      ...(children.get(span.spanId) ?? []).map((child) => ({
        time: child.startMs,
        render: () => renderSpan(child, depth + 1),
      })),
    ];
    items.sort(byTime((item) => item.time)).forEach((item) => item.render());
  };
  for (const root of children.get(null) ?? []) renderSpan(root, 0);
  if (trace.logs.length > 0) {
    lines.push('', 'Log Records without a Span:');
    for (const log of trace.logs) lines.push(logLine(log, start, ''));
  }
  return lines.join('\n');
};

/** Renders Trace Summaries as one row per Trace, newest first. */
export const renderTraceSummariesText = (list: {
  readonly items: ReadonlyArray<SimpleTraceSummary>;
}) =>
  list.items.length === 0
    ? 'No Traces stored.'
    : list.items
        .map((trace) =>
          [
            trace.traceId,
            (trace.startTime ?? '?').padEnd(24),
            trace.running
              ? 'running'.padEnd(10)
              : formatMillis(trace.durationMs).padEnd(10),
            `${trace.spanCount} spans`.padEnd(10),
            trace.errorCount > 0
              ? `${trace.errorCount} errors`.padEnd(10)
              : ''.padEnd(10),
            trace.serviceName ?? '(unknown)',
            trace.name ?? '',
          ].join('  '),
        )
        .join('\n');
