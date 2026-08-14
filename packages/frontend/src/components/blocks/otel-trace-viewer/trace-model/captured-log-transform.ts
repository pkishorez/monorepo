import type { OtelEvent, OtelSpan } from './types';

/**
 * Structurally compatible with `CapturedLog` from
 * `@pkishorez/effect-tracer/recorder` and laymos's `CapturedTraceSchema`.
 */
interface CapturedLogRecord {
  readonly spanId: string | null;
  readonly timestamp: number;
  readonly level: 'Fatal' | 'Error' | 'Warn' | 'Info' | 'Debug' | 'Trace';
  readonly message: unknown;
  readonly annotations: Readonly<Record<string, unknown>>;
}

function capturedLogToEvent(log: CapturedLogRecord): OtelEvent {
  return {
    name: log.level.toLowerCase(),
    timestamp: log.timestamp,
    attributes: {
      ...log.annotations,
      body:
        typeof log.message === 'string'
          ? log.message
          : JSON.stringify(log.message),
      severityText: log.level,
    },
  };
}

/**
 * Fold recorder logs into their spans' events so the viewer renders them.
 * Logs that identify no span have nowhere to attach and are dropped.
 */
export function attachCapturedLogs(
  spans: readonly OtelSpan[],
  logs: readonly CapturedLogRecord[],
): OtelSpan[] {
  const bySpan = new Map<string, OtelEvent[]>();
  for (const log of logs) {
    if (log.spanId === null) continue;
    const events = bySpan.get(log.spanId) ?? [];
    events.push(capturedLogToEvent(log));
    bySpan.set(log.spanId, events);
  }
  return spans.map((span) => {
    const extra = bySpan.get(span.spanId);
    return extra ? { ...span, events: [...span.events, ...extra] } : span;
  });
}
