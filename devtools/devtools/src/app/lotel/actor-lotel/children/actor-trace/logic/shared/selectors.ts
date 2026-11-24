import type {
  OtelEvent,
  OtelSpan,
} from '../../../../../services/telemetry/contract/index.js';
import type { SpanNode } from '../../../../logic/shared/index.js';

/* Pure reads of a Trace's Spans and Log Records, as its views draw them. */

const LOG_INDICATOR_KEYS = [
  'severityNumber',
  'severityText',
  'log.severityNumber',
  'log.severityText',
  'body',
  'log.message',
];

/**
 * Treat a span event as a log record when it carries any of the standard
 * OTel log attributes. Hand-authored `span.AddEvent` calls without these
 * fall through as legacy events (the deprecated API).
 */
export function isLog(event: OtelEvent): boolean {
  for (const key of LOG_INDICATOR_KEYS) {
    if (key in event.attributes) return true;
  }
  return false;
}

export function formatDuration(ms: number | null): string {
  if (ms === null) return '—';
  if (ms < 1) return '< 1ms';
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1_000).toFixed(2)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
  if (ms < 86_400_000) return `${(ms / 3_600_000).toFixed(1)}h`;
  return `${(ms / 86_400_000).toFixed(1)}d`;
}

export function spanDuration(span: OtelSpan): number | null {
  if (span.endTime === null) return null;
  return span.endTime - span.startTime;
}

export function collectSpans(nodes: SpanNode[]): OtelSpan[] {
  const result: OtelSpan[] = [];
  function visit(node: SpanNode) {
    result.push(node.span);
    node.children.forEach(visit);
  }
  nodes.forEach(visit);
  return result;
}
