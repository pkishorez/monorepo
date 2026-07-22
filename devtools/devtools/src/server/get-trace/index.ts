import { Effect } from 'effect';
import { queryTraces } from '@pkishorez/lotel';
import { TraceNotFound } from '../../rpc/index.js';

/** Converts an OTLP nanosecond timestamp to a sortable integer when possible. */
const toNanoseconds = (value: string | number | undefined): bigint | null => {
  if (value === undefined) return null;
  try {
    return BigInt(value);
  } catch {
    return null;
  }
};

/** Orders stored spans by start time, then by their monotonic record id. */
const compareSpans = (
  left: { id: string; record: { startTimeUnixNano?: string | number } },
  right: { id: string; record: { startTimeUnixNano?: string | number } },
) => {
  const leftStart = toNanoseconds(left.record.startTimeUnixNano);
  const rightStart = toNanoseconds(right.record.startTimeUnixNano);
  if (leftStart !== null && rightStart !== null && leftStart !== rightStart) {
    return leftStart < rightStart ? -1 : 1;
  }
  if (leftStart !== null && rightStart === null) return -1;
  if (leftStart === null && rightStart !== null) return 1;
  return left.id.localeCompare(right.id);
};

/** Finds and chronologically orders every stored span for a trace id. */
export const getTrace = (traceId: string) =>
  Effect.gen(function* () {
    const { items } = yield* queryTraces();
    const spans = items
      .map(({ value }) => value)
      .filter(({ record }) => record.traceId === traceId)
      .sort(compareSpans);

    if (spans.length === 0) return yield* new TraceNotFound({ traceId });
    return { traceId, spans };
  });
