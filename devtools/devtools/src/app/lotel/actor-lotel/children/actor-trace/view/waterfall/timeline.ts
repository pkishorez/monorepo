import type { OtelSpan } from '../../../../../services/telemetry/contract/index.js';

/** Resolves trace bounds from every known span timestamp. */
export function spanTimelineBounds(
  spans: readonly OtelSpan[],
  fallbackStart: number,
) {
  if (spans.length === 0) {
    return { traceStart: fallbackStart, traceEnd: fallbackStart };
  }

  let traceStart = spans[0]!.startTime;
  let traceEnd = traceStart;

  for (const span of spans) {
    traceStart = Math.min(traceStart, span.startTime);
    traceEnd = Math.max(
      traceEnd,
      span.startTime,
      span.endTime ?? span.startTime,
    );
  }

  return { traceStart, traceEnd };
}
