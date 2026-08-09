import type { OtelSpan } from './types';

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
